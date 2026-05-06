import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { buildWaLink } from "@/lib/wa/config";
import Link from "next/link";
import {
  createParticipantAction,
  generateBriefAction,
  updateBatchDeadlineAction,
} from "../../actions";
import CopyLinkButton from "./copy-link-button";
import CSVUpload from "./csv-upload";
import GenerateBriefButton from "./generate-brief-button";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Belum mulai",
  in_progress: "Sedang berlangsung",
  completed: "Selesai",
  abandoned: "Tidak selesai",
};

const STATUS_STYLE: Record<string, string> = {
  not_started: "bg-neutral-100 text-neutral-700",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  abandoned: "bg-red-100 text-red-700",
};

function formatDeadlineForInput(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  // datetime-local butuh format YYYY-MM-DDTHH:mm di local timezone
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: batch } = await supabase
    .from("batches")
    .select("id, name, course_name, status, deadline, channel")
    .eq("id", id)
    .single();
  if (!batch) notFound();
  const isWaBatch = batch.channel === "whatsapp";

  const { data: participants } = await supabase
    .from("participants")
    .select("id, name, email, phone, token, status")
    .eq("batch_id", id)
    .order("created_at", { ascending: true });

  const { data: latestBrief } = await supabase
    .from("briefs")
    .select("id, generated_at")
    .eq("batch_id", id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const counts = (participants ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{batch.name}</h1>
          {isWaBatch && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
              WhatsApp
            </span>
          )}
        </div>
        {batch.course_name && <p className="text-neutral-600">{batch.course_name}</p>}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="font-medium">Deadline wawancara</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Sebelum deadline, peserta bisa klik link dan menyelesaikan sesi. Setelah deadline, link
          tidak bisa lagi dibuka. (Cron auto-brief masuk di Phase 6.)
        </p>
        <form action={updateBatchDeadlineAction} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="batch_id" value={batch.id} />
          <input
            type="datetime-local"
            name="deadline"
            defaultValue={formatDeadlineForInput(batch.deadline)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">
            Simpan deadline
          </button>
          {batch.deadline && (
            <span className="text-xs text-neutral-500">
              Saat ini: {new Date(batch.deadline).toLocaleString("id-ID")}
            </span>
          )}
        </form>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="font-medium">Tambah peserta</h2>

        <div className="mt-4">
          <h3 className="text-sm font-medium text-neutral-700">Manual</h3>
          <form
            action={createParticipantAction}
            className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <input type="hidden" name="batch_id" value={batch.id} />
            <input
              name="name"
              required
              placeholder="Nama"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="email"
              type="email"
              placeholder="Email (opsional)"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="phone"
              placeholder={isWaBatch ? "No HP (wajib untuk WA)" : "No HP (opsional)"}
              required={isWaBatch}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">
              Tambah
            </button>
          </form>
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-4">
          <h3 className="text-sm font-medium text-neutral-700">Bulk via CSV</h3>
          <div className="mt-2">
            <CSVUpload batchId={batch.id} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Class brief</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {latestBrief
                ? `Brief terakhir di-generate ${new Date(latestBrief.generated_at).toLocaleString("id-ID")}.`
                : "Belum ada brief untuk batch ini."}
            </p>
          </div>
          <div className="flex gap-2">
            {latestBrief && (
              <Link
                href={`/dashboard/batches/${batch.id}/brief`}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
              >
                Lihat brief
              </Link>
            )}
            <GenerateBriefButton
              batchId={batch.id}
              action={generateBriefAction}
              hasExisting={!!latestBrief}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-medium">Peserta ({participants?.length ?? 0})</h2>
          {participants && participants.length > 0 && (
            <div className="text-xs text-neutral-500">
              {Object.entries(counts)
                .map(([k, v]) => `${STATUS_LABEL[k] ?? k}: ${v}`)
                .join(" · ")}
            </div>
          )}
        </div>
        {participants && participants.length > 0 ? (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {participants.map((p) => {
              const webLink = `${appUrl}/s/${p.token}`;
              const waLink = isWaBatch ? buildWaLink(p.token) : null;
              return (
                <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="truncate text-xs text-neutral-500">
                      {p.email ?? "—"} · {p.phone ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[p.status] ?? ""}`}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                    {isWaBatch ? (
                      waLink ? (
                        <CopyLinkButton link={waLink} label="Salin link WA" />
                      ) : (
                        <span className="text-xs text-amber-700" title="Set WAHA_NUMBER di env">
                          WAHA_NUMBER belum diset
                        </span>
                      )
                    ) : (
                      <CopyLinkButton link={webLink} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">Belum ada peserta.</p>
        )}
      </section>
    </div>
  );
}
