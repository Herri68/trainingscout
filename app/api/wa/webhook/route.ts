// POST /api/wa/webhook — terima batch debounced messages dari sidecar VPS.
// Body: { jid, messages: [{ type: 'text', text: string, timestamp: number }, ...] }
// Header: x-waha-signature: <hex sha256 hmac of raw body using WAHA_WEBHOOK_HMAC_SECRET>

import { NextResponse } from "next/server";
import { verifyHmac } from "@/lib/wa/hmac";
import { handleWelcomeFlow } from "@/lib/wa/welcome";

export const runtime = "nodejs";

type InboundMessage = {
  type: string;
  text?: string;
  timestamp?: number;
};

type Body = {
  jid: string;
  messages: InboundMessage[];
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
  const sig = req.headers.get("x-waha-signature");
  if (!verifyHmac(raw, sig, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: Body;
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.jid || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // Phase 2: gabung hanya pesan text. Media handling masuk Phase 4.
  const joinedText = body.messages
    .filter((m) => m.type === "text" && typeof m.text === "string")
    .map((m) => m.text!.trim())
    .filter(Boolean)
    .join("\n");

  if (!joinedText) {
    // No text content; Phase 2 tidak handle media — Phase 4 akan tolak halus.
    return NextResponse.json({ ok: true, skipped: "no_text" });
  }

  try {
    const result = await handleWelcomeFlow(body.jid, joinedText);
    // Phase 3 akan invoke agent di sini saat result.readyForAgent === true.
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
