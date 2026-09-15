import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lookupPhoneByLid, sendText } from "@/lib/wa/client";
import { advance, Contact, initialContact } from "./flow";
import { composeReply } from "./compose";
import { buildNotice } from "./notify";
import { understand } from "./understand";

export async function runMasLini(
  jid: string,
  messageId: string,
  text: string,
): Promise<void> {
  const db = supabaseAdmin();
  const lease = randomUUID();
  const claimed = await db.rpc("cs_claim", {
    p_jid: jid,
    p_initial: initialContact(jid),
    p_lease: lease,
  });
  if (claimed.error) throw new Error("Contact storage unavailable");
  if (!claimed.data) throw new Error("Contact busy; retry");
  try {
    const cached = await db
      .from("cs_replies")
      .select("reply, delivered")
      .eq("jid", jid)
      .eq("message_id", messageId)
      .maybeSingle();
    if (cached.error) throw new Error("Reply storage unavailable");
    let state = claimed.data as Contact;
    if (cached.data?.delivered) {
      await flushNotices(db, jid, lease, state);
      return;
    }
    let reply: string;
    if (cached.data) {
      reply = cached.data.reply;
    } else {
      // Preserve question/answer ordering when a previous delivery failed.
      const pending = await db
        .from("cs_replies")
        .select("message_id")
        .eq("jid", jid)
        .eq("delivered", false)
        .limit(1);
      if (pending.error || pending.data?.length)
        throw new Error("Previous reply pending; retry");
      const contact = state;
      // Privacy ID (@lid) is not a phone number; resolve it before asking the user.
      if (!contact.phone && jid.endsWith("@lid"))
        contact.phone = await lookupPhoneByLid(jid);
      const understanding = await understand(contact, text);
      const result = advance(contact, understanding, text);
      // Alur tetap dari flow.ts; kalimatnya ditulis ulang agar luwes seperti CS manusia.
      // Balasan kosong = pesan di luar materi yang tidak dibalas.
      if (result.reply)
        result.reply = await composeReply({
          contact: result.contact,
          message: text,
          draft: result.reply,
          history: contact.history ?? [],
          recordedAnswer: understanding.feedback,
        });
      result.contact.history = [
        ...(contact.history ?? []),
        { role: "user" as const, text: text.slice(0, 1000) },
        ...(result.reply
          ? [{ role: "assistant" as const, text: result.reply }]
          : []),
      ].slice(-12);
      const saved = await db.rpc("cs_prepare", {
        p_jid: jid,
        p_lease: lease,
        p_message_id: messageId,
        p_state: result.contact,
        p_reply: result.reply,
      });
      if (saved.error) throw new Error("Contact update failed");
      reply = result.reply;
      state = result.contact;
    }
    // One bubble: do not swallow send failures or truncate the framework URL.
    if (reply) await sendText(jid, reply);
    const delivered = await db
      .from("cs_replies")
      .update({ delivered: true })
      .eq("jid", jid)
      .eq("message_id", messageId);
    if (delivered.error) throw new Error("Delivery receipt update failed");
    await flushNotices(db, jid, lease, state);
  } finally {
    const released = await db.rpc("cs_release", { p_jid: jid, p_lease: lease });
    if (released.error) console.error("[mas-lini] lease release failed");
  }
}

// Notifikasi ke Bang Herri dikirim setelah balasan peserta terkirim. Kegagalan tidak
// menggagalkan giliran peserta: sisa antrean tetap tersimpan dan dicoba pada pesan berikutnya.
async function flushNotices(
  db: ReturnType<typeof supabaseAdmin>,
  jid: string,
  lease: string,
  state: Contact,
): Promise<void> {
  const trainer = process.env.TRAINER_WA_JID;
  const pending = state.pending_notices ?? [];
  if (!trainer || !pending.length) return;
  let sent = 0;
  try {
    for (const notice of pending) {
      await sendText(trainer, await buildNotice(notice, state, jid));
      sent++;
    }
  } catch (err) {
    console.error("[mas-lini] trainer notice failed:", err);
  }
  if (!sent) return;
  const saved = await db
    .from("cs_contacts")
    .update({ state: { ...state, pending_notices: pending.slice(sent) } })
    .eq("jid", jid)
    .eq("lease", lease);
  if (saved.error) console.error("[mas-lini] notice queue update failed");
}
