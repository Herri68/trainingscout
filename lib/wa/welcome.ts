// Welcome/consent flow untuk batch WhatsApp.
// Phase 2: handle pre-agent state machine (token claim → pending_consent → in_progress).
// Phase 3 akan invoke agent saat status = in_progress.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendText } from "./client";
import {
  welcomeBubble1,
  welcomeBubble2,
  NO_TOKEN,
  TOKEN_TAKEN,
  BATCH_CLOSED,
  SESSION_LOCKED,
  CONSENT_DECLINED,
  CONSENT_GRANTED_ACK,
} from "./messages";

const DECLINE_REGEX = /\b(tidak|no|skip|nggak|gak|engga|enggak)\b/i;
const TOKEN_REGEX = /([A-Za-z0-9_-]{20,})/;

export function extractToken(text: string): string | null {
  const m = text.match(/TrainingScout\s+([A-Za-z0-9_-]{20,})/i);
  if (m) return m[1];
  const fallback = text.match(TOKEN_REGEX);
  return fallback ? fallback[1] : null;
}

async function sendBubbles(jid: string, bubbles: string[]): Promise<void> {
  for (let i = 0; i < bubbles.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 600));
    try {
      await sendText(jid, bubbles[i]);
    } catch (err) {
      console.error(`[wa/welcome] sendBubbles failed at ${i} for ${jid}:`, err);
      return;
    }
  }
}

async function safeSend(jid: string, text: string): Promise<void> {
  try {
    await sendText(jid, text);
  } catch (err) {
    console.error(`[wa/welcome] safeSend failed for ${jid}:`, err);
  }
}

type ParticipantRow = {
  id: string;
  name: string;
  batch_id: string;
  token: string;
  phone_jid: string | null;
  wa_status: string | null;
  session_locked_at: string | null;
};

type BatchRow = {
  id: string;
  name: string;
  channel: string;
  status: string;
};

/**
 * Process inbound message dari peserta WA. Phase 2 hanya menangani state pre-agent.
 * Return true kalau status peserta sekarang sudah `in_progress` dan caller boleh lanjut ke agent (Phase 3).
 */
export async function handleWelcomeFlow(
  jid: string,
  joinedText: string,
): Promise<{ readyForAgent: boolean; participantId: string | null; token: string | null }> {
  const supabase = supabaseAdmin();

  // 1. Cek apakah JID sudah claim peserta.
  const { data: existing } = await supabase
    .from("participants")
    .select("id, name, batch_id, token, phone_jid, wa_status, session_locked_at")
    .eq("phone_jid", jid)
    .maybeSingle<ParticipantRow>();

  if (existing) {
    return await handleClaimedJid(existing, joinedText, jid);
  }

  // 2. Belum claim → coba extract token.
  const token = extractToken(joinedText);
  if (!token) {
    await safeSend(jid, NO_TOKEN);
    return { readyForAgent: false, participantId: null, token: null };
  }

  const { data: byToken } = await supabase
    .from("participants")
    .select("id, name, batch_id, token, phone_jid, wa_status, session_locked_at")
    .eq("token", token)
    .maybeSingle<ParticipantRow>();

  if (!byToken) {
    await safeSend(jid, NO_TOKEN);
    return { readyForAgent: false, participantId: null, token: null };
  }

  if (byToken.phone_jid && byToken.phone_jid !== jid) {
    await safeSend(jid, TOKEN_TAKEN);
    return { readyForAgent: false, participantId: null, token: null };
  }

  const { data: batch } = await supabase
    .from("batches")
    .select("id, name, channel, status")
    .eq("id", byToken.batch_id)
    .single<BatchRow>();

  if (!batch || batch.channel !== "whatsapp") {
    await safeSend(jid, NO_TOKEN);
    return { readyForAgent: false, participantId: null, token: null };
  }

  if (batch.status === "closed") {
    await safeSend(jid, BATCH_CLOSED);
    return { readyForAgent: false, participantId: null, token: null };
  }

  // Claim: bind JID, set pending_consent, kirim welcome.
  await supabase
    .from("participants")
    .update({ phone_jid: jid, wa_status: "pending_consent" })
    .eq("id", byToken.id);

  await sendBubbles(jid, [welcomeBubble1(byToken.name), welcomeBubble2(batch.name)]);
  return { readyForAgent: false, participantId: byToken.id, token: byToken.token };
}

async function handleClaimedJid(
  p: ParticipantRow,
  joinedText: string,
  jid: string,
): Promise<{ readyForAgent: boolean; participantId: string | null; token: string | null }> {
  const supabase = supabaseAdmin();

  if (p.session_locked_at || p.wa_status === "completed") {
    await safeSend(jid, SESSION_LOCKED);
    return { readyForAgent: false, participantId: p.id, token: p.token };
  }

  const { data: batch } = await supabase
    .from("batches")
    .select("id, name, channel, status")
    .eq("id", p.batch_id)
    .single<BatchRow>();

  if (batch?.status === "closed") {
    await safeSend(jid, BATCH_CLOSED);
    return { readyForAgent: false, participantId: p.id, token: p.token };
  }

  if (p.wa_status === "pending_consent") {
    if (DECLINE_REGEX.test(joinedText)) {
      await safeSend(jid, CONSENT_DECLINED);
      return { readyForAgent: false, participantId: p.id, token: p.token };
    }
    await supabase
      .from("participants")
      .update({ wa_status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", p.id);
    await safeSend(jid, CONSENT_GRANTED_ACK);
    // Phase 2 stops here; Phase 3 will invoke agent on the next inbound turn.
    return { readyForAgent: false, participantId: p.id, token: p.token };
  }

  if (p.wa_status === "in_progress") {
    return { readyForAgent: true, participantId: p.id, token: p.token };
  }

  // wa_status null/pending tanpa claim — tidak seharusnya terjadi (defensive).
  await safeSend(jid, NO_TOKEN);
  return { readyForAgent: false, participantId: p.id, token: p.token };
}
