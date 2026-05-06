// Verifikasi request berasal dari Vercel Cron (atau dipanggil manual dengan secret).
// Vercel Cron mengirim header: Authorization: Bearer <CRON_SECRET>.

export function verifyCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}
