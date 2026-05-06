import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { systemPrompt } from "./system-prompt";
import { TOOLS, TOOL_NAMES } from "./tools";
import { DIMENSION_IDS, isDimensionId } from "./dimensions";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_ITERATIONS = 6; // safety net untuk loop tool use

type DBMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  content_blocks: Anthropic.ContentBlockParam[] | null;
};

type Participant = {
  id: string;
  name: string;
  status: string;
  batch_id: string;
};

export type RunOptions = {
  token: string;
  userMessage?: string;
  onTextDelta: (text: string) => void;
  onSessionEnded: () => void;
};

export type RunResult = {
  ok: boolean;
  error?: string;
};

export async function runTurn(opts: RunOptions): Promise<RunResult> {
  const admin = supabaseAdmin();

  const { data: participant } = await admin
    .from("participants")
    .select("id, name, status, batch_id")
    .eq("token", opts.token)
    .single<Participant>();
  if (!participant) return { ok: false, error: "peserta tidak ditemukan" };

  if (participant.status === "completed") {
    return { ok: false, error: "sesi sudah selesai" };
  }

  const { data: batch } = await admin
    .from("batches")
    .select("course_name, deadline, status")
    .eq("id", participant.batch_id)
    .single<{ course_name: string | null; deadline: string | null; status: string }>();

  if (batch?.status === "closed") {
    return { ok: false, error: "batch sudah ditutup" };
  }
  if (batch?.deadline && new Date(batch.deadline).getTime() < Date.now()) {
    return { ok: false, error: "deadline batch sudah lewat" };
  }

  // Persist user message kalau ada
  if (opts.userMessage && opts.userMessage.trim()) {
    const text = opts.userMessage.trim();
    await admin.from("messages").insert({
      participant_id: participant.id,
      role: "user",
      content: text,
      content_blocks: [{ type: "text", text }],
    });
    if (participant.status === "not_started") {
      await admin
        .from("participants")
        .update({ status: "in_progress", started_at: new Date().toISOString() })
        .eq("id", participant.id);
    }
  }

  // Load history
  const { data: history } = await admin
    .from("messages")
    .select("role, content, content_blocks")
    .eq("participant_id", participant.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true });

  const apiMessages: Anthropic.MessageParam[] = (history ?? []).map(
    (m: DBMessage): Anthropic.MessageParam => ({
      role: m.role as "user" | "assistant",
      content:
        m.content_blocks && Array.isArray(m.content_blocks)
          ? m.content_blocks
          : [{ type: "text", text: m.content }],
    }),
  );

  // Seed kalau belum ada turn sama sekali
  if (apiMessages.length === 0) {
    apiMessages.push({ role: "user", content: "(mulai sesi)" });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: systemPrompt(participant.name, batch?.course_name ?? null),
      cache_control: { type: "ephemeral" },
    },
  ];

  let sessionEnded = false;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages: apiMessages,
    });

    let assistantText = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        assistantText += event.delta.text;
        opts.onTextDelta(event.delta.text);
      }
    }

    const finalMsg = await stream.finalMessage();
    const assistantBlocks = finalMsg.content;

    // Persist assistant turn
    await admin.from("messages").insert({
      participant_id: participant.id,
      role: "assistant",
      content: assistantText,
      content_blocks: assistantBlocks as unknown as Anthropic.ContentBlockParam[],
    });

    apiMessages.push({ role: "assistant", content: assistantBlocks });

    if (finalMsg.stop_reason !== "tool_use") {
      break;
    }

    // Process tool_use blocks
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantBlocks) {
      if (block.type !== "tool_use") continue;

      if (block.name === TOOL_NAMES.MARK) {
        const input = block.input as { dimension?: string; summary?: string };
        const dim = input.dimension ?? "";
        const summary = input.summary ?? "";
        if (!isDimensionId(dim) || !summary.trim()) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `dimension wajib salah satu dari [${DIMENSION_IDS.join(",")}] dan summary tidak boleh kosong.`,
          });
        } else {
          await admin
            .from("dimension_marks")
            .upsert(
              {
                participant_id: participant.id,
                dimension: dim,
                summary,
                marked_at: new Date().toISOString(),
              },
              { onConflict: "participant_id,dimension" },
            );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `OK: dimensi "${dim}" tersimpan.`,
          });
        }
      } else if (block.name === TOOL_NAMES.END) {
        const { data: marks } = await admin
          .from("dimension_marks")
          .select("dimension")
          .eq("participant_id", participant.id);
        const marked = new Set((marks ?? []).map((m) => m.dimension));
        const missing = DIMENSION_IDS.filter((d) => !marked.has(d));
        if (missing.length > 0) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Belum bisa menutup sesi. Dimensi belum tertutup: [${missing.join(", ")}]. Lanjutkan wawancara untuk dimensi ini.`,
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "OK: sesi ditutup. Terima kasih.",
          });
          sessionEnded = true;
        }
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `Tool tidak dikenal: ${block.name}`,
        });
      }
    }

    // Persist tool_result message
    await admin.from("messages").insert({
      participant_id: participant.id,
      role: "user",
      content: "",
      content_blocks: toolResults as unknown as Anthropic.ContentBlockParam[],
    });

    apiMessages.push({ role: "user", content: toolResults });

    if (sessionEnded) {
      await admin
        .from("participants")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", participant.id);
      opts.onSessionEnded();
      break;
    }
    // else loop again so model can continue with next question
  }

  return { ok: true };
}
