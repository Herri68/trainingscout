import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { generateBriefAction } from "@/app/dashboard/actions";
import GenerateBriefButton from "../generate-brief-button";
import BriefEditor from "./brief-editor";
import ParticipantAttachments from "./participant-attachments";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Belum mulai",
  in_progress: "Sedang berlangsung",
  completed: "Selesai",
  abandoned: "Tidak selesai",
};

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: batch } = await supabase
    .from("batches")
    .select("id, name, course_name")
    .eq("id", id)
    .single();
  if (!batch) notFound();

  const { data: brief } = await supabase
    .from("briefs")
    .select("id, generated_at, generated_by, content, edited_content")
    .eq("batch_id", id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: participants } = await supabase
    .from("participants")
    .select("id, name, status")
    .eq("batch_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/batches/${batch.id}`}
          className="text-sm text-neutral-600 hover:underline"
        >
          ← Kembali ke batch
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Class brief — {batch.name}</h1>
        {batch.course_name && <p className="text-neutral-600">{batch.course_name}</p>}
      </div>

      {!brief ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
          <p className="text-neutral-600">Belum ada brief.</p>
          <div className="mt-4 inline-block">
            <GenerateBriefButton
              batchId={batch.id}
              action={generateBriefAction}
              hasExisting={false}
            />
          </div>
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-neutral-200 bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="text-neutral-600">
                Generated{" "}
                <b>{new Date(brief.generated_at).toLocaleString("id-ID")}</b> ·{" "}
                {brief.generated_by === "manual" ? "manual" : "auto"}
                {brief.edited_content ? " · ada edit trainer" : ""}
              </div>
              <GenerateBriefButton
                batchId={batch.id}
                action={generateBriefAction}
                hasExisting
              />
            </div>
            <BriefEditor
              briefId={brief.id}
              batchId={batch.id}
              originalContent={brief.content}
              editedContent={brief.edited_content}
            />
          </section>

          <section>
            <h2 className="mb-3 font-medium">
              Lampiran: profil per-peserta ({participants?.length ?? 0})
            </h2>
            {participants && participants.length > 0 ? (
              <ul className="space-y-2">
                {participants.map((p) => (
                  <li key={p.id}>
                    <ParticipantAttachments
                      participantId={p.id}
                      name={p.name}
                      statusLabel={STATUS_LABEL[p.status] ?? p.status}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">Belum ada peserta.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
