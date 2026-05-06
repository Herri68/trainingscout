import { createHmac, timingSafeEqual } from "crypto";

// WAHA mengirim header `X-Webhook-Hmac` berisi sha512 hex dari raw body,
// dengan header `X-Webhook-Hmac-Algorithm: sha512`.
// Key di-set di dashboard WAHA per session (HMAC Key field).
export function verifyWahaHmac(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
