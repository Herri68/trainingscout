import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import Chat from "./chat";

export default async function SessionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = supabaseAdmin();

  const { data: participant } = await admin
    .from("participants")
    .select("id, name, status, batch_id")
    .eq("token", token)
    .single();
  if (!participant) notFound();

  const { data: batch } = await admin
    .from("batches")
    .select("name, course_name, deadline, status")
    .eq("id", participant.batch_id)
    .single();

  const deadlinePassed =
    batch?.deadline && new Date(batch.deadline).getTime() < Date.now();
  const batchClosed = batch?.status === "closed";
  const sessionCompleted = participant.status === "completed";

  if ((deadlinePassed || batchClosed) && !sessionCompleted) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-semibold">Sesi sudah ditutup</h1>
        <p className="mt-3 text-sm text-neutral-600">
          Halo {participant.name}, deadline wawancara untuk batch ini sudah lewat. Hubungi
          trainer kalau kamu masih ingin mengisi sesi.
        </p>
      </main>
    );
  }

  // Hanya tampilkan blok teks ke client (tool_use/tool_result disembunyikan).
  const { data: messages } = await admin
    .from("messages")
    .select("id, role, content, content_blocks")
    .eq("participant_id", participant.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true });

  type Block = { type: string; text?: string };
  const initialMessages = (messages ?? [])
    .map((m) => {
      const blocks: Block[] = Array.isArray(m.content_blocks) ? m.content_blocks : [];
      const text =
        blocks
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("")
          .trim() || (blocks.length === 0 ? m.content : "");
      return { role: m.role as "user" | "assistant", content: text };
    })
    .filter((m) => m.content.length > 0);

  return (
    <Chat
      token={token}
      participantName={participant.name}
      batchName={batch?.name ?? ""}
      courseName={batch?.course_name ?? null}
      initialStatus={participant.status as "not_started" | "in_progress" | "completed" | "abandoned"}
      initialMessages={initialMessages}
    />
  );
}
