// Normalisasi nomor HP Indonesia → JID WAHA `62XXX@c.us`.
// Mendukung format umum: 08..., +628..., 628..., 8..., dengan space/dash.

export function normalizePhoneToJid(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Strip semua karakter non-digit
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;

  let normalized: string;
  if (digits.startsWith("62")) {
    normalized = digits;
  } else if (digits.startsWith("0")) {
    normalized = "62" + digits.slice(1);
  } else if (digits.startsWith("8")) {
    normalized = "62" + digits;
  } else {
    return null;
  }

  // Total digits harus reasonable Indonesia (biasanya 11–14, mis. 6281234567890)
  if (normalized.length < 10 || normalized.length > 15) return null;
  if (!normalized.startsWith("628")) return null;

  return `${normalized}@c.us`;
}
