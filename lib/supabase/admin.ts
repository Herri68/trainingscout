import { createClient } from "@supabase/supabase-js";

// Service-role client untuk operasi peserta (peserta tidak login).
// HANYA dipakai di server route — jangan import dari client component.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
