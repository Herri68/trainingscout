"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function handle() {
      const supabase = supabaseBrowser();

      // Supabase magic link (generateLink admin) redirect ke sini dengan
      // session di fragment hash: #access_token=...&refresh_token=...&type=magiclink
      // supabase-js otomatis detect dan set session dari hash.
      const { data, error } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/dashboard");
        return;
      }

      // Kalau belum ada session, coba exchange — supabase-js akan baca hash otomatis.
      const { error: sessionError } =
        await supabase.auth.exchangeCodeForSession(window.location.href);
      if (!sessionError) {
        router.replace("/dashboard");
        return;
      }

      console.error(
        "[auth/callback] failed:",
        error?.message,
        sessionError?.message,
      );
      router.replace("/login#error=access_denied&error_code=otp_expired");
    }

    handle();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-neutral-500 text-sm">Masuk...</p>
    </main>
  );
}
