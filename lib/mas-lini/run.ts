import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lookupPhoneByLid, sendText } from "@/lib/wa/client";
import { advance, Contact, initialContact } from "./flow";
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
    if (cached.data?.delivered) return;
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
      const contact = claimed.data as Contact;
      // Privacy ID (@lid) is not a phone number; resolve it before asking the user.
      if (!contact.phone && jid.endsWith("@lid"))
        contact.phone = await lookupPhoneByLid(jid);
      const result = advance(contact, await understand(contact, text), text);
      const saved = await db.rpc("cs_prepare", {
        p_jid: jid,
        p_lease: lease,
        p_message_id: messageId,
        p_state: result.contact,
        p_reply: result.reply,
      });
      if (saved.error) throw new Error("Contact update failed");
      reply = result.reply;
    }
    // One bubble: do not swallow send failures or truncate the framework URL.
    await sendText(jid, reply);
    const delivered = await db
      .from("cs_replies")
      .update({ delivered: true })
      .eq("jid", jid)
      .eq("message_id", messageId);
    if (delivered.error) throw new Error("Delivery receipt update failed");
  } finally {
    const released = await db.rpc("cs_release", { p_jid: jid, p_lease: lease });
    if (released.error) console.error("[mas-lini] lease release failed");
  }
}
