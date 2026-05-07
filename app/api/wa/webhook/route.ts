// POST /api/wa/webhook — terima webhook event dari WAHA (managed).
// WAHA payload native: { event, session, payload: { from, fromMe, type, body, timestamp, ... } }
// Header auth: `X-Webhook-Hmac` = sha512 hex dari raw body, key = WAHA_WEBHOOK_HMAC_SECRET
// (set di dashboard WAHA → HMAC Key).

import { NextResponse } from "next/server";
import { verifyWahaHmac } from "@/lib/wa/hmac";
import { handleWelcomeFlow } from "@/lib/wa/welcome";
import { runTurn } from "@/lib/agent/run";
import { sendChunked } from "@/lib/wa/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SESSION_LOCKED, REJECT_MEDIA, VOICE_TOO_LONG, VOICE_FAILED } from "@/lib/wa/messages";
import { sendText } from "@/lib/wa/client";
import { transcribeAudio } from "@/lib/wa/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

type WahaMedia = {
  url?: string;
  mimetype?: string;
  duration?: number;
  filename?: string;
};

type WahaPayload = {
  id?: string;
  from?: string;
  fromMe?: boolean;
  type?: string;
  body?: string;
  timestamp?: number;
  hasMedia?: boolean;
  source?: string;
  media?: WahaMedia;
  _data?: { seconds?: number };
};

const MAX_VOICE_SECONDS = 120;

type WahaEvent = {
  event?: string;
  session?: string;
  payload?: WahaPayload;
};

export async function POST(req: Request): Promise<Response> {
  if (process.env.WHATSAPP_ENABLED !== "true") {
    return NextResponse.json({ error: "wa disabled" }, { status: 503 });
  }

  const secret = process.env.WAHA_WEBHOOK_HMAC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const raw = await req.text();
  const sig = req.headers.get("x-webhook-hmac");
  if (!verifyWahaHmac(raw, sig, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let evt: WahaEvent;
  try {
    evt = JSON.parse(raw) as WahaEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Phase 2 hanya tangani event `message` inbound. session.status di-akui tapi diabaikan.
  if (evt.event !== "message") {
    return NextResponse.json({ ok: true, ignored: evt.event ?? "unknown" });
  }

  const p = evt.payload ?? {};
  if (!p.from || p.fromMe === true) {
    return NextResponse.json({ ok: true, skipped: "non-inbound" });
  }

  const text = typeof p.body === "string" ? p.body.trim() : "";
  const hasMedia = p.hasMedia === true;
  const mediaMime = p.media?.mimetype ?? "";
  const mediaUrl = p.media?.url ?? "";
  const isAudio =
    hasMedia &&
    (mediaMime.startsWith("audio/") ||
      p.type === "voice" ||
      p.type === "ptt" ||
      p.type === "audio");

  // Non-audio media (gambar/dokumen/video/sticker) → reject halus, tidak invoke agent.
  if (hasMedia && !isAudio) {
    console.log(`[wa/webhook] reject non-audio media from=${p.from} mime=${mediaMime} type=${p.type}`);
    await sendText(p.from, REJECT_MEDIA).catch(() => {});
    return NextResponse.json({ ok: true, skipped: "media" });
  }

  let userMessage = text;

  if (isAudio) {
    const duration = p.media?.duration ?? p._data?.seconds ?? null;
    if (typeof duration === "number" && duration > MAX_VOICE_SECONDS) {
      console.log(`[wa/webhook] voice too long ${duration}s from=${p.from}`);
      await sendText(p.from, VOICE_TOO_LONG).catch(() => {});
      return NextResponse.json({ ok: true, skipped: "voice-too-long" });
    }
    if (!mediaUrl) {
      console.error(`[wa/webhook] audio without media.url from=${p.from}`);
      await sendText(p.from, VOICE_FAILED).catch(() => {});
      return NextResponse.json({ ok: true, skipped: "no-media-url" });
    }
    try {
      const transcript = await transcribeAudio(mediaUrl, mediaMime);
      userMessage = `[via voice] ${transcript}`;
      console.log(`[wa/webhook] transcribed ${transcript.length} chars from=${p.from}`);
    } catch (err) {
      console.error(`[wa/webhook] transcribe failed for ${p.from}:`, err);
      await sendText(p.from, VOICE_FAILED).catch(() => {});
      return NextResponse.json({ ok: true, skipped: "transcribe-failed" });
    }
  }

  if (!userMessage) {
    console.log(`[wa/webhook] skipped empty from=${p.from} type=${p.type ?? "?"}`);
    return NextResponse.json({ ok: true, skipped: "empty" });
  }

  try {
    const result = await handleWelcomeFlow(p.from, userMessage);

    if (result.readyForAgent && result.token && result.participantId) {
      let collected = "";
      let sessionEnded = false;
      const run = await runTurn({
        token: result.token,
        userMessage,
        channel: "whatsapp",
        onTextDelta: (t) => {
          collected += t;
        },
        onSessionEnded: () => {
          sessionEnded = true;
        },
      });

      if (!run.ok) {
        console.error(`[wa/webhook] runTurn failed: ${run.error}`);
        // Kalau sesi sudah selesai sebelumnya, balas template lock.
        if (run.error === "sesi sudah selesai" || run.error === "batch sudah ditutup") {
          await sendChunked(p.from, SESSION_LOCKED).catch(() => {});
        }
        return NextResponse.json({ ok: true, agentError: run.error });
      }

      const reply = collected.trim();
      if (reply) {
        await sendChunked(p.from, reply).catch((e) =>
          console.error(`[wa/webhook] sendChunked error:`, e),
        );
      }

      if (sessionEnded) {
        await supabaseAdmin()
          .from("participants")
          .update({
            wa_status: "completed",
            session_locked_at: new Date().toISOString(),
          })
          .eq("id", result.participantId);
      }

      return NextResponse.json({ ok: true, agent: "ran", sessionEnded });
    }

    return NextResponse.json({
      ok: true,
      readyForAgent: result.readyForAgent,
      participantId: result.participantId,
    });
  } catch (err) {
    console.error("[wa/webhook] flow error:", err);
    return NextResponse.json({ error: "flow failed" }, { status: 500 });
  }
}
