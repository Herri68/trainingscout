import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MODEL = "claude-haiku-4-5-20251001";

export const LEVELS = ["pemula", "menengah", "mahir"] as const;
export type Level = (typeof LEVELS)[number];

export type Insight = { level: Level; goal: string };

function buildTranscript(
  msgs: { role: string; content: string; content_blocks: unknown }[],
): string {
  return msgs
    .map((m) => {
      type Block = { type: string; text?: string };
      const blocks: Block[] = Array.isArray(m.content_blocks)
        ? (m.content_blocks as Block[])
        : [];
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
}

const SYSTEM_PROMPT =
  "Kamu adalah analis pra-pelatihan. Dari transkrip wawancara peserta, ekstrak " +
  "level skill peserta dan tujuan utama mereka mengikuti kelas. Kembalikan HANYA " +
  "JSON valid tanpa pembungkus markdown, tanpa penjelasan tambahan.";

function buildUserPrompt(transcript: string): string {
  return `Skema output (JSON):
{"level": "pemula" | "menengah" | "mahir", "goal": string ringkas maks 5 kata}

Definisi level:
- pemula: belum punya pengalaman koding/AI yang signifikan, masih belajar dasar.
- menengah: sudah pernah praktik nyata (bikin proyek kecil, ikut kelas sebelumnya), tapi belum konsisten produktif.
- mahir: sudah produktif, punya proyek/produk jalan, mau dalami teknik lanjutan.

Aturan goal:
- Ringkas, ≤ 5 kata, lowercase, Bahasa Indonesia.
- Kalau peserta tidak menyebut tujuan eksplisit, isi: "belum jelas".

Contoh:
Transkrip: "PESERTA: saya baru kenal AI bulan lalu, mau bikin chatbot untuk toko"
Output: {"level":"pemula","goal":"bikin chatbot toko"}

Transkrip: "PESERTA: saya sudah deploy beberapa app Next.js, mau belajar agentic workflow"
Output: {"level":"mahir","goal":"belajar agentic workflow"}

Transkrip: "PESERTA: pernah ikut kelas Python dasar, sekarang masih cari arah"
Output: {"level":"menengah","goal":"belum jelas"}

Sekarang transkrip aktual:
${transcript}

Output JSON:`;
}

function parseInsight(raw: string): Insight | null {
  // Strip markdown fence kalau model masih membungkus
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const level = obj.level;
  const goal = obj.goal;
  if (typeof level !== "string" || !LEVELS.includes(level as Level)) return null;
  if (typeof goal !== "string") return null;
  const trimmedGoal = goal.trim().toLowerCase();
  if (trimmedGoal.length === 0 || trimmedGoal.length > 60) return null;
  return { level: level as Level, goal: trimmedGoal };
}

/**
 * Ekstrak level & goal dari transkrip peserta lalu simpan ke participants.
 * Fail-silent: kegagalan apapun (LLM error, JSON malformed, validasi gagal)
 * di-log dan return false. Status peserta tidak diubah.
 */
export async function extractInsightFor(participantId: string): Promise<boolean> {
  const admin = supabaseAdmin();
  try {
    const { data: msgs } = await admin
      .from("messages")
      .select("role, content, content_blocks, created_at")
      .eq("participant_id", participantId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true });

    const transcript = buildTranscript(msgs ?? []);
    if (!transcript) {
      console.warn(`[insight] transcript kosong untuk ${participantId}`);
      return false;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[insight] ANTHROPIC_API_KEY tidak ada");
      return false;
    }
    const anthropic = new Anthropic({ apiKey });
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(transcript) }],
    });
    const raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const insight = parseInsight(raw);
    if (!insight) {
      console.error(`[insight] output invalid untuk ${participantId}: ${raw}`);
      return false;
    }

    const { error } = await admin
      .from("participants")
      .update({ level: insight.level, goal: insight.goal })
      .eq("id", participantId);
    if (error) {
      console.error(`[insight] update gagal untuk ${participantId}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[insight] error untuk ${participantId}:`, err);
    return false;
  }
}
