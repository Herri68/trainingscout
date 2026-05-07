"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ResultEntry = {
  participant_id: string;
  name: string;
  status: "sent" | "failed" | "skipped";
  reason?: string;
};

type Props = {
  batchId: string;
  targetCount: number;
  disabledReason: string | null;
};

export default function BroadcastSection({ batchId, targetCount, disabledReason }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    sent: number;
    failed: number;
    skipped: number;
    results: ResultEntry[];
  } | null>(null);
  const [showResults, setShowResults] = useState(false);

  const estMin = Math.ceil((targetCount * 30) / 60);
  const disabled = loading || disabledReason !== null || targetCount === 0;
  const reasonLabel =
    disabledReason ?? (targetCount === 0 ? "Tidak ada peserta yang perlu di-broadcast." : null);

  async function onClick() {
    if (
      !confirm(
        `Yakin broadcast ke ${targetCount} peserta? Proses akan berjalan ~${estMin} menit (1 pesan tiap 30 detik). Jangan tutup tab.`,
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/wa/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { reason?: string };
        setError(body.reason ?? `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as {
        sent: number;
        failed: number;
        skipped: number;
        results: ResultEntry[];
      };
      setDone(data);
      router.refresh();
    } catch (e) {
      setError(
        `Request gagal/timeout: ${(e as Error).message}. Sebagian peserta mungkin sudah ter-broadcast — refresh dan klik lagi untuk lanjut sisanya.`,
      );
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6">
      <h2 className="font-medium">Broadcast WA</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Kirim pesan inisiasi WA ke peserta yang belum mulai dan belum pernah di-broadcast.
        1 pesan tiap 30 detik untuk mengurangi pola spam.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onClick}
          disabled={disabled}
          className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading
            ? `Mengirim... (~${estMin} menit)`
            : `Broadcast ke ${targetCount} peserta`}
        </button>
        {targetCount > 0 && !disabledReason && (
          <span className="text-xs text-neutral-500">
            Estimasi ~{estMin} menit. Untuk batch besar, klik beberapa kali sampai semua peserta ter-broadcast.
          </span>
        )}
        {reasonLabel && <span className="text-xs text-neutral-500">{reasonLabel}</span>}
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      )}

      {done && (
        <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <div>
            ✅ {done.sent} terkirim · ⚠️ {done.failed} gagal · ⏭ {done.skipped} dilewati
          </div>
          {done.results.length > 0 && (
            <button
              onClick={() => setShowResults((s) => !s)}
              className="mt-2 text-xs text-neutral-600 underline"
            >
              {showResults ? "Sembunyikan detail" : "Lihat detail"}
            </button>
          )}
          {showResults && (
            <ul className="mt-2 divide-y divide-neutral-200 text-xs">
              {done.results.map((r) => (
                <li key={r.participant_id} className="flex justify-between py-1">
                  <span>{r.name}</span>
                  <span
                    className={
                      r.status === "sent"
                        ? "text-green-700"
                        : r.status === "failed"
                          ? "text-red-700"
                          : "text-neutral-600"
                    }
                  >
                    {r.status}
                    {r.reason ? ` (${r.reason})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
