import { NextResponse } from "next/server";
import { verifyWahaHmac } from "@/lib/wa/hmac";
import { sendText } from "@/lib/wa/client";
import { runMasLini } from "@/lib/mas-lini/run";
import { transcribeAudio } from "@/lib/wa/transcribe";
import { REJECT_MEDIA, VOICE_TOO_LONG, VOICE_FAILED } from "@/lib/wa/messages";

export const runtime = "nodejs";
export const maxDuration = 120;
type WahaEvent = {
  event?: string;
  session?: string;
  payload?: {
    id?: string;
    from?: string;
    fromMe?: boolean;
    body?: string;
    type?: string;
    hasMedia?: boolean;
    media?: { url?: string; mimetype?: string; duration?: number };
    _data?: { seconds?: number };
  };
};
export async function POST(req: Request): Promise<Response> {
  if (process.env.WHATSAPP_ENABLED !== "true")
    return NextResponse.json({ error: "wa disabled" }, { status: 503 });
  const secret = process.env.WAHA_WEBHOOK_HMAC_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 500 },
    );
  const raw = await req.text();
  if (!verifyWahaHmac(raw, req.headers.get("x-webhook-hmac"), secret))
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  let evt: WahaEvent;
  try {
    evt = JSON.parse(raw);
    if (!evt || typeof evt !== "object") throw new Error("invalid event");
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (
    evt.event !== "message" ||
    evt.session !== (process.env.WAHA_SESSION_NAME ?? "default")
  )
    return NextResponse.json({ ok: true, ignored: true });
  const p = evt.payload ?? {};
  // Ignore groups, status feeds and outbound messages.
  if (
    typeof p.from !== "string" ||
    !/^\d+@(c\.us|s\.whatsapp\.net|lid)$/.test(p.from) ||
    p.fromMe === true
  )
    return NextResponse.json({ ok: true, ignored: true });
  if (typeof p.id !== "string" || !p.id.trim())
    return NextResponse.json({ error: "message id required" }, { status: 400 });
  let message = typeof p.body === "string" ? p.body.trim() : "";
  try {
    if (message.length > 8000) {
      await sendText(
        p.from,
        "Pesannya panjang sekali. Boleh kirim versi singkatnya?",
      );
      return NextResponse.json({ ok: true });
    }
    if (p.hasMedia) {
      const mime = p.media?.mimetype ?? "";
      const audio =
        mime.startsWith("audio/") ||
        ["voice", "ptt", "audio"].includes(p.type ?? "");
      if (!audio) {
        await sendText(p.from, REJECT_MEDIA);
        return NextResponse.json({ ok: true });
      }
      if ((p.media?.duration ?? p._data?.seconds ?? 0) > 120) {
        await sendText(p.from, VOICE_TOO_LONG);
        return NextResponse.json({ ok: true });
      }
      if (!p.media?.url) {
        await sendText(p.from, VOICE_FAILED);
        return NextResponse.json({ ok: true });
      }
      message = (await transcribeAudio(p.media.url, mime)).slice(0, 8000);
    }
    if (message) await runMasLini(p.from, p.id, message);
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[mas-lini] incoming turn failed; webhook should retry");
    return NextResponse.json({ error: "retry required" }, { status: 503 });
  }
}
