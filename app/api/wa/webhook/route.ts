// POST /api/wa/webhook — terima webhook event dari WAHA (managed).
// WAHA payload native: { event, session, payload: { from, fromMe, type, body, timestamp, ... } }
// Header auth: `X-Webhook-Hmac` = sha512 hex dari raw body, key = WAHA_WEBHOOK_HMAC_SECRET
// (set di dashboard WAHA → HMAC Key).

import { NextResponse } from "next/server";
import { verifyWahaHmac } from "@/lib/wa/hmac";
import { handleWelcomeFlow } from "@/lib/wa/welcome";

export const runtime = "nodejs";

type WahaPayload = {
  id?: string;
  from?: string;
  fromMe?: boolean;
  type?: string;
  body?: string;
  timestamp?: number;
  hasMedia?: boolean;
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

  // Phase 2 text-only. Media handling masuk Phase 4.
  const isText = p.type === "chat" || p.type === "text";
  const text = typeof p.body === "string" ? p.body.trim() : "";
  if (!isText || !text) {
    return NextResponse.json({ ok: true, skipped: "non-text" });
  }

  try {
    const result = await handleWelcomeFlow(p.from, text);
    // Phase 3 akan invoke agent saat result.readyForAgent === true.
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
