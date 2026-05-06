"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
type Status = "not_started" | "in_progress" | "completed" | "abandoned";

const END_MARKER = "[SESSION_ENDED]";

export default function Chat({
  token,
  participantName,
  batchName,
  courseName,
  initialStatus,
  initialMessages,
}: {
  token: string;
  participantName: string;
  batchName: string;
  courseName: string | null;
  initialStatus: Status;
  initialMessages: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<Status>(initialStatus);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (initialMessages.length === 0 && initialStatus !== "completed") void send("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    if (streaming || status === "completed") return;
    const userMsg = text.trim();
    const next: Msg[] = userMsg ? [...messages, { role: "user", content: userMsg }] : [...messages];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, userMessage: userMsg }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => "");
        throw new Error(err || "Gagal menghubungi server");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        const ended = raw.includes(END_MARKER);
        const display = raw.replace(END_MARKER, "").trimEnd();
        setMessages((prev) => {
          const copy = prev.slice();
          copy[copy.length - 1] = { role: "assistant", content: display };
          return copy;
        });
        if (ended) setStatus("completed");
      }
    } catch (e) {
      setMessages((prev) => {
        const copy = prev.slice();
        copy[copy.length - 1] = {
          role: "assistant",
          content: `(Maaf, terjadi error: ${(e as Error).message}. Coba refresh halaman.)`,
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  const ended = status === "completed";

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col">
      <header className="border-b border-neutral-200 bg-white px-6 py-3">
        <div className="text-sm text-neutral-500">TrainingScout · {batchName}</div>
        <div className="font-medium">
          Halo, {participantName}
          {courseName ? ` — sesi pra-kelas ${courseName}` : ""}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[80%] rounded-2xl bg-neutral-900 px-4 py-2 text-white"
                  : "max-w-[85%] rounded-2xl bg-white px-4 py-2 ring-1 ring-neutral-200"
              }
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {m.content || (m.role === "assistant" && streaming ? "..." : "")}
              </div>
            </div>
          ))}
          {ended && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              ✓ Sesi sudah selesai. Terima kasih sudah meluangkan waktu — trainer akan menerima ringkasanmu sebelum kelas.
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) send(input);
        }}
        className="border-t border-neutral-200 bg-white px-6 py-3"
      >
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming || ended}
            placeholder={ended ? "Sesi sudah selesai" : "Tulis jawabanmu..."}
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || ended || !input.trim()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            Kirim
          </button>
        </div>
      </form>
    </div>
  );
}
