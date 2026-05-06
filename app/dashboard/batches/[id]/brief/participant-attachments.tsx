"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mark = { dimension: string; summary: string };
type MsgRow = { role: string; content: string; content_blocks: unknown };

export default function ParticipantAttachments({
  participantId,
  name,
  statusLabel,
}: {
  participantId: string;
  name: string;
  statusLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [transcript, setTranscript] = useState<{ role: string; text: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (marks && transcript) return;
    setLoading(true);
    setError(null);
    const supabase = supabaseBrowser();
    const [m, t] = await Promise.all([
      supabase
        .from("dimension_marks")
        .select("dimension, summary")
        .eq("participant_id", participantId),
      supabase
        .from("messages")
        .select("role, content, content_blocks")
        .eq("participant_id", participantId)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true }),
    ]);
    setLoading(false);
    if (m.error || t.error) {
      setError((m.error ?? t.error)?.message ?? "Gagal memuat data.");
      return;
    }
    setMarks((m.data as Mark[]) ?? []);

    type Block = { type: string; text?: string };
    const lines = ((t.data as MsgRow[]) ?? [])
      .map((row) => {
        const blocks: Block[] = Array.isArray(row.content_blocks)
          ? (row.content_blocks as Block[])
          : [];
        const text =
          blocks
            .filter((b) => b.type === "text")
            .map((b) => b.text ?? "")
            .join("")
            .trim() || (blocks.length === 0 ? row.content : "");
        return text ? { role: row.role, text } : null;
      })
      .filter((x): x is { role: string; text: string } => Boolean(x));
    setTranscript(lines);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void load();
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-neutral-50"
      >
        <span className="font-medium">{name}</span>
        <span className="flex items-center gap-2 text-sm text-neutral-500">
          {statusLabel}
          <span className="text-neutral-400">{open ? "▴" : "▾"}</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-neutral-200 p-4 text-sm">
          {loading && <div className="text-neutral-500">Memuat...</div>}
          {error && <div className="text-red-600">{error}</div>}
          {!loading && !error && marks && (
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 font-medium">Ringkasan dimensi</h4>
                {marks.length > 0 ? (
                  <ul className="space-y-1.5">
                    {marks.map((m, i) => (
                      <li key={i}>
                        <span className="font-medium">{m.dimension}:</span>{" "}
                        <span className="text-neutral-700">{m.summary}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-neutral-500">Belum ada dimensi yang tertutup.</p>
                )}
              </div>
              <div>
                <h4 className="mb-2 font-medium">Transkrip</h4>
                {transcript && transcript.length > 0 ? (
                  <div className="max-h-96 space-y-2 overflow-y-auto rounded-md bg-neutral-50 p-3">
                    {transcript.map((m, i) => (
                      <div key={i} className="text-xs">
                        <span
                          className={
                            m.role === "user" ? "font-medium text-neutral-900" : "font-medium text-blue-700"
                          }
                        >
                          {m.role === "user" ? "Peserta" : "Agent"}:
                        </span>{" "}
                        <span className="whitespace-pre-wrap text-neutral-700">{m.text}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-neutral-500">Belum ada percakapan.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
