// POST /api/wa/broadcast — broadcast pesan inisiasi WA ke peserta wa_status=pending.
// Serial 30s antar pesan untuk mengurangi spam pattern. Idempotent via wa_broadcast_sent_at.

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendText, getSessionStatus } from "@/lib/wa/client";
import { normalizePhoneToJid } from "@/lib/wa/phone";
import { broadcastInvite } from "@/lib/wa/messages";
import { buildWaLink } from "@/lib/wa/config";

export const runtime = "nodejs";
export const maxDuration = 300;

const SLEEP_MS = 30_000;

type ResultEntry = {
  participant_id: string;
  name: string;
  status: "sent" | "failed" | "skipped";
  reason?: string;
};

function maskJid(jid: string): string {
  const at = jid.indexOf("@");
  const prefix = at > 0 ? jid.slice(0, at) : jid;
  if (prefix.length < 5) return "***";
  return `${prefix.slice(0, 3)}****${prefix.slice(-3)}`;
}

export async function POST(req: Request): Promise<Response> {
  let body: { batch_id?: string };
  try {
    body = (await req.json()) as { batch_id?: string };
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_body" },
      { status: 400 },
    );
  }
  const batchId = body.batch_id;
  if (!batchId) {
    return NextResponse.json(
      { ok: false, reason: "missing_batch_id" },
      { status: 400 },
    );
  }

  // Auth: trainer harus owner batch.
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  const { data: batch } = await supa
    .from("batches")
    .select("id, name, course_name, channel, status, created_by_user_id")
    .eq("id", batchId)
    .single<{
      id: string;
      name: string;
      course_name: string | null;
      channel: string;
      status: string;
      created_by_user_id: string;
    }>();

  if (!batch || batch.created_by_user_id !== user.id) {
    return NextResponse.json(
      { ok: false, reason: "forbidden" },
      { status: 403 },
    );
  }
  if (batch.channel !== "whatsapp") {
    return NextResponse.json(
      { ok: false, reason: "not_wa_batch" },
      { status: 400 },
    );
  }
  if (batch.status === "closed") {
    return NextResponse.json(
      { ok: false, reason: "batch_closed" },
      { status: 400 },
    );
  }

  if (process.env.WHATSAPP_ENABLED !== "true") {
    return NextResponse.json(
      { ok: false, reason: "wa_unavailable" },
      { status: 503 },
    );
  }
  const sess = await getSessionStatus();
  if (!sess || (sess.status !== "WORKING" && sess.status !== "STARTING")) {
    return NextResponse.json(
      { ok: false, reason: "wa_unavailable" },
      { status: 503 },
    );
  }

  const admin = supabaseAdmin();
  const { data: targets } = await admin
    .from("participants")
    .select("id, name, phone, token, wa_status, wa_broadcast_sent_at")
    .eq("batch_id", batchId)
    .eq("wa_status", "pending")
    .is("wa_broadcast_sent_at", null)
    .order("created_at", { ascending: true });

  const list = targets ?? [];
  const start = Date.now();
  console.log(`[wa/broadcast] start batch_id=${batchId} total=${list.length}`);

  const results: ResultEntry[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let firstSendDone = false;

  for (const p of list as Array<{
    id: string;
    name: string;
    phone: string | null;
    token: string;
  }>) {
    if (!p.phone || !p.phone.trim()) {
      results.push({
        participant_id: p.id,
        name: p.name,
        status: "skipped",
        reason: "no_phone",
      });
      console.log(
        `[wa/broadcast] skipped participant_id=${p.id} reason=no_phone`,
      );
      skipped++;
      continue;
    }
    const jid = normalizePhoneToJid(p.phone);
    if (!jid) {
      results.push({
        participant_id: p.id,
        name: p.name,
        status: "skipped",
        reason: "invalid_phone",
      });
      console.log(
        `[wa/broadcast] skipped participant_id=${p.id} reason=invalid_phone`,
      );
      skipped++;
      continue;
    }

    // Sleep 30s sebelum send berikutnya (kecuali yang pertama).
    if (firstSendDone) {
      await new Promise((r) => setTimeout(r, SLEEP_MS));
    }
    firstSendDone = true;

    const text = broadcastInvite(
      p.name,
      batch.name,
      batch.course_name,
      p.token,
      buildWaLink(p.token),
    );
    try {
      await sendText(jid, text);
      await admin
        .from("participants")
        .update({ wa_broadcast_sent_at: new Date().toISOString() })
        .eq("id", p.id);
      results.push({ participant_id: p.id, name: p.name, status: "sent" });
      console.log(
        `[wa/broadcast] sent participant_id=${p.id} jid=${maskJid(jid)}`,
      );
      sent++;
    } catch (err) {
      const msg = (err as Error).message;
      results.push({
        participant_id: p.id,
        name: p.name,
        status: "failed",
        reason: msg,
      });
      console.error(
        `[wa/broadcast] failed participant_id=${p.id} reason=${msg}`,
      );
      failed++;
    }
  }

  const duration = Math.round((Date.now() - start) / 1000);
  console.log(
    `[wa/broadcast] done batch_id=${batchId} sent=${sent} failed=${failed} skipped=${skipped} duration=${duration}s`,
  );

  return NextResponse.json({
    ok: true,
    total: list.length,
    sent,
    failed,
    skipped,
    results,
  });
}
