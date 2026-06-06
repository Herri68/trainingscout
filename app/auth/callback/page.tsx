"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = supabaseBrowser();

    // Supabase magic link (generateLink admin) mengirim session via hash fragment:
    // #access_token=...&refresh_token=...&type=magiclink
    // supabase-js v2 detect ini otomatis via onAuthStateChange.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        subscription.unsubscribe();
        router.replace("/dashboard");
      } else if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        subscription.unsubscribe();
        router.replace("/login#error=access_denied&error_code=otp_expired");
      }
    });

    // Timeout fallback: kalau 5 detik tidak ada event, berarti tidak ada hash session
    const timeout = setTimeout(async () => {
      subscription.unsubscribe();
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/dashboard");
      } else {
        router.replace("/login#error=access_denied&error_code=otp_expired");
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-neutral-500 text-sm">Masuk...</p>
    </main>
  );
}
