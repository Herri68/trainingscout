import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DIMENSIONS } from "./dimensions";

const PRIMARY_MODEL = "claude-opus-4-7";
const FALLBACK_MODEL = "claude-sonnet-4-6";

async function callBriefModel(
  anthropic: Anthropic,
  model: string,
  userPrompt: string,
): Promise<string> {
  const res = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system:
      "Kamu adalah analis pelatihan yang bantu trainer memetakan kelas pra-pelatihan AI. Tulis dalam Bahasa Indonesia natural, profesional, ringkas. Output: markdown saja.",
    messages: [{ role: "user", content: userPrompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number };
  return e?.status === 529 || e?.status === 503 || e?.status === 429;
}

async function generateWithRetry(
  anthropic: Anthropic,
  userPrompt: string,
): Promise<string> {
  // Coba PRIMARY (Opus) 3x dengan backoff. Kalau masih overloaded, fallback ke Sonnet.
  const delays = [1000, 3000, 7000];
  let lastErr: unknown = null;
  for (const d of delays) {
    try {
      return await callBriefModel(anthropic, PRIMARY_MODEL, userPrompt);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) throw err;
      await new Promise((r) => setTimeout(r, d));
    }
  }
  // Fallback ke Sonnet
  try {
    return await callBriefModel(anthropic, FALLBACK_MODEL, userPrompt);
  } catch (err) {
    if (isRetryable(err)) {
      throw new Error(
        "Server Anthropic sedang overloaded. Coba generate ulang beberapa saat lagi.",
      );
    }
    throw err ?? lastErr;
  }
}

type ParticipantBundle = {
  id: string;
  name: string;
  status: string;
  dimension_marks: { dimension: string; summary: string }[];
  transcript: string;
};

async function loadBatchBundle(batchId: string) {
  const admin = supabaseAdmin();

  const { data: batch } = await admin
    .from("batches")
    .select("id, name, course_name")
    .eq("id", batchId)
    .single();
  if (!batch) throw new Error("Batch tidak ditemukan");

  const { data: participants } = await admin
    .from("participants")
    .select("id, name, status")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  const bundles: ParticipantBundle[] = [];
  for (const p of participants ?? []) {
    const { data: marks } = await admin
      .from("dimension_marks")
      .select("dimension, summary")
      .eq("participant_id", p.id);

    const { data: msgs } = await admin
      .from("messages")
      .select("role, content, content_blocks")
      .eq("participant_id", p.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true });

    const transcript = (msgs ?? [])
      .map((m) => {
        type Block = { type: string; text?: string };
        const blocks: Block[] = Array.isArray(m.content_blocks) ? m.content_blocks : [];
        const text =
          blocks
            .filter((b) => b.type === "text")
            .map((b) => b.text ?? "")
            .join("")
            .trim() || (blocks.length === 0 ? m.content : "");
        if (!text) return null;
        const speaker = m.role === "user" ? "PESERTA" : "AGENT";
        return `${speaker}: ${text}`;
      })
      .filter((s): s is string => Boolean(s))
      .join("\n");

    bundles.push({
      id: p.id,
      name: p.name,
      status: p.status,
      dimension_marks: marks ?? [],
      transcript,
    });
  }

  return { batch, participants: bundles };
}

function buildUserPrompt(
  batch: { name: string; course_name: string | null },
  participants: ParticipantBundle[],
): string {
  const completed = participants.filter((p) => p.status === "completed");
  const incomplete = participants.filter((p) => p.status !== "completed");

  const rubricList = DIMENSIONS.map(
    (d) => `- ${d.id} (${d.label}): ${d.description}`,
  ).join("\n");

  const participantsBlock = participants
    .map((p, i) => {
      const marks = p.dimension_marks
        .map((m) => `  - ${m.dimension}: ${m.summary}`)
        .join("\n");
      return `### Peserta ${i + 1}: ${p.name} [status: ${p.status}]
Dimension marks:
${marks || "  (tidak ada)"}

Transkrip:
${p.transcript || "(kosong)"}`;
    })
    .join("\n\n---\n\n");

  return `Kamu sedang membaca data wawancara pra-kelas dari ${participants.length} peserta untuk batch "${batch.name}"${batch.course_name ? ` (kelas: ${batch.course_name})` : ""}.

Status: ${completed.length} peserta menyelesaikan asesmen, ${incomplete.length} tidak menyelesaikan.

Rubrik 6 dimensi:
${rubricList}

Catatan: Summary dimensi yang diawali "[tipis]" berarti peserta menutup diri di dimensi itu setelah probing — tampilkan ini sebagai sinyal ke trainer, bukan data hilang.

Data peserta:

${participantsBlock}

Buatkan **class brief** dalam markdown Bahasa Indonesia untuk trainer. Ikuti struktur ini persis:

# Class Brief — ${batch.name}

## Ringkasan kelas
2–4 kalimat: gambaran umum kesiapan kelas, apa yang menonjol, mood keseluruhan.

## Distribusi level
Bullet points: berapa pemula / menengah / advanced di AI coding & vibe coding (perkiraan dari data, jelaskan dasarnya).

## Goal cluster
Kelompokkan goal peserta jadi 2–4 cluster bermakna. Untuk tiap cluster: nama cluster + peserta yang masuk + insight singkat.

## Rekomendasi fokus materi
3–5 bullet point konkret: materi/contoh apa yang HARUS di-tweak, di-expand, atau di-skip berdasarkan profil peserta. Beri alasan tiap rekomendasi.

## Peserta yang perlu perhatian khusus
Daftar peserta dengan kebutuhan/blocker spesifik yang perlu diperhatikan trainer (peserta dengan level jauh lebih tinggi/rendah dari rata-rata, peserta dengan tantangan unik, peserta yang tertutup).

## Catatan data quality
${incomplete.length > 0 ? `**${incomplete.length} dari ${participants.length} peserta belum menyelesaikan asesmen.** ` : ""}Catat juga peserta yang banyak jawaban "[tipis]" — interpretasi brief ini perlu dilakukan dengan kehati-hatian untuk peserta tersebut.

Tulis dengan ringkas tapi substantif. Tidak perlu hedge berlebihan. Trainer butuh keputusan, bukan analisis akademis.`;
}

export async function generateBrief(
  batchId: string,
  generatedBy: "auto" | "manual",
): Promise<{ briefId: string; content: string }> {
  const { batch, participants } = await loadBatchBundle(batchId);

  if (participants.length === 0) {
    throw new Error("Belum ada peserta di batch ini.");
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const userPrompt = buildUserPrompt(batch, participants);

  const content = await generateWithRetry(anthropic, userPrompt);

  if (!content) throw new Error("Brief kosong dari LLM.");

  const admin = supabaseAdmin();
  const { data: row, error } = await admin
    .from("briefs")
    .insert({
      batch_id: batchId,
      generated_by: generatedBy,
      content,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { briefId: row.id, content };
}
