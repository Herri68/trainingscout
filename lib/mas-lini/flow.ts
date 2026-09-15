import { normalizePhoneToJid } from "@/lib/wa/phone";

export const FRAMEWORK =
  "https://drive.google.com/drive/folders/1kT-1D_MYwIgcYF4ve7LYb4-SbVNwZP7y?usp=sharing";
export const HANDOFF =
  "Silakan hubungi Bang Herri langsung di 08112268556: https://wa.me/628112268556";
export const QUESTIONS = [
  "Bagaimana kesan kamu setelah mengikuti Creative Talk?",
  "Bagian mana yang paling menarik atau bermanfaat buat kamu?",
  "Adakah bagian yang kurang jelas atau perlu diperbaiki?",
  "Topik atau kegiatan lanjutan apa yang kamu harapkan?",
] as const;

export type Contact = {
  name: string | null;
  business: string | null;
  phone: string | null;
  welcomed: boolean;
  framework_sent: boolean;
  feedback: (string | null)[];
  feedback_stopped: boolean;
  handed_off: boolean;
};
export type Understanding = {
  name?: string;
  business?: string;
  phone?: string;
  negative?: boolean;
  decline_feedback?: boolean;
  feedback?: string;
  request_framework?: boolean;
};
export function initialContact(jid: string): Contact {
  const match = jid.match(/^([1-9]\d{7,14})@(c\.us|s\.whatsapp\.net)$/);
  return {
    name: null,
    business: null,
    phone: match?.[1] ?? null,
    welcomed: false,
    framework_sent: false,
    feedback: [null, null, null, null],
    feedback_stopped: false,
    handed_off: false,
  };
}

export function advance(
  previous: Contact,
  input: Understanding,
): { contact: Contact; reply: string } {
  const contact = { ...previous, feedback: [...previous.feedback] };
  if (input.name) contact.name = input.name;
  if (input.business) contact.business = input.business;
  if (!contact.phone && input.phone)
    contact.phone = normalizePhoneToJid(input.phone)?.split("@")[0] ?? null;
  const intro = !contact.welcomed
    ? "Halo! Saya Mas Lini, asisten AI Bang Herri. Nama, nomor WhatsApp, dan bisnis kamu akan disimpan untuk membantu percakapan ini. "
    : "";
  contact.welcomed = true;
  const name = contact.name ? `, ${contact.name}` : "";
  let reply: string;
  if (input.negative || contact.handed_off) {
    contact.handed_off = true;
    contact.feedback_stopped = true;
    reply = `Terima kasih sudah menyampaikan${name}. Maaf kalau pengalamannya kurang berkenan. ${HANDOFF}`;
  } else if (!contact.name) {
    reply = "Boleh tahu namanya?";
  } else if (!contact.business) {
    reply = `Salam kenal${name}! Bisnis atau kegiatan kamu bergerak di bidang apa?`;
  } else if (!contact.phone) {
    reply = `Terima kasih${name}. Nomor HP kamu belum terbaca dari WhatsApp. Boleh tuliskan nomor HP dengan awalan 08 atau +62?`;
  } else if (!contact.framework_sent) {
    contact.framework_sent = true;
    contact.feedback_stopped = !!input.decline_feedback;
    reply =
      `Ini framework Creative Talk-nya${name}: ${FRAMEWORK}\n\n` +
      (contact.feedback_stopped
        ? "Semoga bermanfaat!"
        : `Kalau berkenan, ceritakan sebentar: ${QUESTIONS[0]}`);
  } else {
    if (input.decline_feedback) contact.feedback_stopped = true;
    const index = contact.feedback.findIndex((f) => f === null);
    if (!contact.feedback_stopped && input.feedback && index >= 0)
      contact.feedback[index] = input.feedback;
    const next = contact.feedback.findIndex((f) => f === null);
    const link = input.request_framework
      ? `Ini link framework-nya${name}: ${FRAMEWORK}\n\n`
      : "";
    reply =
      link +
      (contact.feedback_stopped || next < 0
        ? `Terima kasih${name}! Semoga framework-nya bermanfaat. Kalau butuh bantuan lanjutan, ${HANDOFF}`
        : `${input.feedback ? `Terima kasih${name}. ` : ""}${QUESTIONS[next]} Kamu boleh melewati pertanyaan atau berhenti kapan saja.`);
  }
  return { contact, reply: intro + reply };
}
