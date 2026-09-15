import { normalizePhoneToJid } from "@/lib/wa/phone";

export const FRAMEWORK =
  "https://drive.google.com/drive/folders/1kT-1D_MYwIgcYF4ve7LYb4-SbVNwZP7y?usp=sharing";
// Tanpa link wa.me: WhatsApp menampilkannya sebagai kartu "Share on WhatsApp".
const HANDOFF_NUMBER = "08112268556";
export const HANDOFF_CONTACT = `Bang Herri melalui WhatsApp di ${HANDOFF_NUMBER}`;
export const QUESTIONS = [
  "Bagaimana kesan Kakak setelah mengikuti Creative Talk?",
  "Bagian mana yang paling menarik atau bermanfaat buat Kakak?",
  "Adakah bagian yang kurang jelas atau perlu diperbaiki?",
  "Topik atau kegiatan lanjutan apa yang Kakak harapkan?",
] as const;

export type Turn = { role: "user" | "assistant"; text: string };

export type Notice =
  | { type: "identity" }
  | { type: "review" }
  | { type: "complaint"; text: string };

export type Contact = {
  name: string | null;
  business: string | null;
  phone: string | null;
  welcomed: boolean;
  framework_sent: boolean;
  feedback: (string | null)[];
  feedback_stopped: boolean;
  handed_off: boolean;
  complaints?: string[];
  // Notifikasi untuk Bang Herri yang belum terkirim.
  pending_notices?: Notice[];
  // Riwayat singkat agar balasan ditulis natural sesuai konteks.
  history?: Turn[];
  // Info boleh melewati/berhenti cukup disampaikan sekali.
  skip_hint_given?: boolean;
  // Penutup (kontak Bang Herri) dan penjelasan di luar topik cukup sekali.
  closing_sent?: boolean;
  off_topic_noted?: boolean;
};
export type Understanding = {
  name?: string;
  business?: string;
  phone?: string;
  negative?: boolean;
  decline_feedback?: boolean;
  feedback?: string;
  request_framework?: boolean;
  off_topic?: boolean;
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
  message = "",
): { contact: Contact; reply: string } {
  const contact = { ...previous, feedback: [...previous.feedback] };
  const notices: Notice[] = [];
  const wasFinished =
    previous.framework_sent &&
    (previous.feedback_stopped || previous.feedback.every((f) => f !== null));
  if (input.name) contact.name = input.name;
  if (input.business) contact.business = input.business;
  if (!contact.phone && input.phone)
    contact.phone = normalizePhoneToJid(input.phone)?.split("@")[0] ?? null;
  const intro = !contact.welcomed
    ? "Halo Kak! Saya Mas Lini, asisten AI Bang Herri. Nama, nomor WhatsApp, dan bisnis Kakak akan disimpan untuk membantu percakapan ini. "
    : "";
  contact.welcomed = true;
  // Sapa dengan "Kak"; hindari "Kak Kak" bila nama sudah diawali sapaan.
  const name = contact.name
    ? `, Kak ${contact.name.replace(/^kak(ak)?\.?\s+/i, "")}`
    : "";
  // Pesan di luar materi: dijelaskan sekali, selanjutnya tidak dibalas (reply kosong).
  const onlyOffTopic =
    input.off_topic &&
    previous.welcomed &&
    !input.negative &&
    !input.name &&
    !input.business &&
    !input.phone &&
    !input.feedback &&
    !input.decline_feedback &&
    !input.request_framework;
  if (onlyOffTopic) {
    const firstNotice = !contact.off_topic_noted;
    contact.off_topic_noted = true;
    return {
      contact,
      reply: firstNotice
        ? `Mohon maaf${name || ", Kak"}, Mas Lini hanya dapat membantu seputar Creative Talk dan framework-nya.`
        : "",
    };
  }
  let reply: string;
  if (input.negative || contact.handed_off) {
    const firstEscalation = !contact.handed_off;
    contact.handed_off = true;
    contact.feedback_stopped = true;
    // Keluhan dicatat agar pernyataan "sudah kami catat" benar adanya.
    const note = (input.feedback ?? message).trim().slice(0, 1000);
    if (input.negative && note) {
      contact.complaints = [...(contact.complaints ?? []), note].slice(-20);
      notices.push({ type: "complaint", text: note });
    }
    const link = input.request_framework
      ? `Berikut link framework Creative Talk${name}: ${FRAMEWORK}\n\n`
      : "";
    reply =
      link +
      (firstEscalation
        ? `Terima kasih atas masukannya${name}. Kami mohon maaf karena pengalaman Kakak di Creative Talk belum sesuai harapan.\n\nMasukan Kakak sudah kami catat sebagai bahan evaluasi. Untuk pembahasan lebih lanjut, Kakak dapat menghubungi ${HANDOFF_CONTACT}.`
        : input.negative
          ? `Terima kasih${name}, tambahan masukan Kakak sudah kami catat.`
          : `Baik${name}.`);
  } else if (!contact.name) {
    reply = "Boleh tahu nama Kakak?";
  } else if (!contact.business) {
    reply = `Salam kenal${name}! Bisnis atau kegiatan Kakak bergerak di bidang apa?`;
  } else if (!contact.phone) {
    reply = `Terima kasih${name}. Nomor HP Kakak belum terbaca dari WhatsApp. Boleh tuliskan nomor HP dengan awalan 08 atau +62?`;
  } else if (!contact.framework_sent) {
    contact.framework_sent = true;
    contact.feedback_stopped = !!input.decline_feedback;
    notices.push({ type: "identity" });
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
    if (!wasFinished && (contact.feedback_stopped || next < 0))
      notices.push({ type: "review" });
    // Info boleh melewati cukup sekali agar tidak terdengar seperti robot.
    const skipHint =
      !contact.feedback_stopped && next >= 0 && !contact.skip_hint_given
        ? " Kakak boleh melewati pertanyaan atau berhenti kapan saja."
        : "";
    if (skipHint) contact.skip_hint_given = true;
    const link = input.request_framework
      ? `Ini link framework-nya${name}: ${FRAMEWORK}\n\n`
      : "";
    const finished = contact.feedback_stopped || next < 0;
    // Penutup dengan kontak Bang Herri cukup sekali (kontak lama dicek lewat riwayat).
    const closingKnown =
      contact.closing_sent ||
      (contact.history ?? []).some(
        (t) => t.role === "assistant" && t.text.includes(HANDOFF_NUMBER),
      );
    if (finished) contact.closing_sent = true;
    reply = (
      link +
      (!finished
        ? `${input.feedback ? `Terima kasih${name}. ` : ""}${QUESTIONS[next]}${skipHint}`
        : !closingKnown
          ? `Terima kasih${name}! Semoga framework-nya bermanfaat. Jika membutuhkan bantuan lebih lanjut, Kakak dapat menghubungi ${HANDOFF_CONTACT}.`
          : link
            ? ""
            : `Baik${name}.`)
    ).trimEnd();
  }
  if (notices.length)
    contact.pending_notices = [
      ...(previous.pending_notices ?? []),
      ...notices,
    ].slice(-10);
  return { contact, reply: intro + reply };
}
