// V2 WhatsApp: feature flag + helper untuk generate link wa.me.
// Dipakai server-side saja (membaca process.env).

export function isWhatsappEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === "true";
}

export function getWahaNumber(): string | null {
  const n = process.env.WAHA_NUMBER?.trim();
  return n && n.length > 0 ? n : null;
}

export function buildWaLink(token: string): string | null {
  const num = getWahaNumber();
  if (!num) return null;
  const text = encodeURIComponent(`Halo TrainingScout ${token}`);
  return `https://wa.me/${num}?text=${text}`;
}
