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
import { SESSION_LOCKED } from "@/lib/wa/messages";

export const runtime = "nodejs";
export const maxDuration = 60;

type WahaPayload = {
  id?: string;
  from?: string;
  fromMe?: boolean;
  type?: string;
  body?: string;
  timestamp?: number;
  hasMedia?: boolean;
  source?: string;
};

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

  // Phase 2 text-only. Engine NOWEB tidak selalu set `type`; pakai hasMedia + body
  // untuk deteksi. Engine WEBJS set `type === "chat"`. Media handling masuk Phase 4.
  const text = typeof p.body === "string" ? p.body.trim() : "";
  const isMedia = p.hasMedia === true;
  if (isMedia || !text) {
    console.log(`[wa/webhook] skipped non-text from=${p.from} type=${p.type ?? "?"} hasMedia=${isMedia}`);
    return NextResponse.json({ ok: true, skipped: "non-text" });
  }

  try {
    const result = await handleWelcomeFlow(p.from, text);

    if (result.readyForAgent && result.token && result.participantId) {
      let collected = "";
      let sessionEnded = false;
      const run = await runTurn({
        token: result.token,
        userMessage: text,
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
