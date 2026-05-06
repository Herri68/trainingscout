import { createHmac, timingSafeEqual } from "crypto";

export function signPayload(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyHmac(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = signPayload(rawBody, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
