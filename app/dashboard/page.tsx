import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { isWhatsappEnabled } from "@/lib/wa/config";
import { createBatchAction } from "./actions";

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const waEnabled = isWhatsappEnabled();
  const { data: batches } = await supabase
    .from("batches")
    .select("id, name, course_name, status, channel, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold">Batch kamu</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Setiap batch berisi peserta yang akan diwawancara TrainingScout sebelum kelas.
        </p>
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
