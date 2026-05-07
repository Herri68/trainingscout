import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { isWhatsappEnabled } from "@/lib/wa/config";
import { createBatchAction } from "./actions";

const PARTICIPANT_LIMIT = 500;

type SearchParams = Promise<{ batch?: string }>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { batch: batchFilter } = await searchParams;
  const supabase = await supabaseServer();
  const waEnabled = isWhatsappEnabled();

  const { data: batches } = await supabase
    .from("batches")
    .select("id, name, course_name, status, channel, created_at")
    .order("created_at", { ascending: false });

  let participantsQuery = supabase
    .from("participants")
    .select(
      "id, name, phone, status, wa_status, level, goal, created_at, batch_id, batches!inner(id, name, channel)",
    )
    .order("created_at", { ascending: false })
    .limit(PARTICIPANT_LIMIT);

  if (batchFilter) {
    participantsQuery = participantsQuery.eq("batch_id", batchFilter);
  }

  const { data: participantsRaw } = await participantsQuery;
  const participants = participantsRaw ?? [];

  function isCompleted(p: (typeof participants)[number]): boolean {
    const batch = Array.isArray(p.batches) ? p.batches[0] : p.batches;
    const isWa = batch?.channel === "whatsapp";
    return isWa ? p.wa_status === "completed" : p.status === "completed";
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold">Peserta kamu</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Daftar semua peserta lintas batch. Klik baris peserta untuk melihat profil
          (segera hadir).
        </p>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="batch" className="text-sm text-neutral-600">
              Batch
            </label>
            <select
              id="batch"
              name="batch"
              defaultValue={batchFilter ?? ""}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
            >
              <option value="">Semua batch</option>
              {(batches ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800">
              Terapkan
            </button>
            {batchFilter && (
              <Link
                href="/dashboard"
                className="text-sm text-neutral-600 underline-offset-2 hover:underline"
              >
                Reset
              </Link>
            )}
          </form>
          <span className="ml-auto text-sm text-neutral-500">
            {participants.length} peserta
            {participants.length === PARTICIPANT_LIMIT ? " (terbatas 500)" : ""}
          </span>
        </div>

        {participants.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            {batchFilter
              ? "Tidak ada peserta di batch ini."
              : "Belum ada peserta. Buat batch & undang peserta di bawah."}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {participants.map((p) => {
              const batch = Array.isArray(p.batches) ? p.batches[0] : p.batches;
              const completed = isCompleted(p);
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-neutral-600">
                      {batch?.name ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!completed && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                        belum wawancara
                      </span>
                    )}
                    {completed && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                        selesai
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="font-medium">Buat batch baru</h2>
        <form
          action={createBatchAction}
          className={`mt-4 grid gap-3 ${waEnabled ? "sm:grid-cols-[1fr_1fr_auto_auto]" : "sm:grid-cols-[1fr_1fr_auto]"}`}
        >
          <input
            name="name"
            required
            placeholder="Nama batch (mis. Cohort Maret 2026)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            name="course_name"
            placeholder="Nama kelas (mis. Vibe Coding 101)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          {waEnabled && (
            <select
              name="channel"
              defaultValue="web"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              title="Channel wawancara"
            >
              <option value="web">Web</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          )}
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-800">
            Buat batch
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-medium">Batch kamu</h2>
        {batches && batches.length > 0 ? (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {batches.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/dashboard/batches/${b.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
                >
                  <div>
                    <div className="font-medium">{b.name}</div>
                    {b.course_name && (
                      <div className="text-sm text-neutral-600">{b.course_name}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {b.channel === "whatsapp" && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                        WhatsApp
                      </span>
                    )}
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                      {b.status}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">Belum ada batch. Buat satu di atas.</p>
        )}
      </section>
    </div>
  );
}
