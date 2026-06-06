import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(new URL("/dashboard", url.origin));
  }

  // generateLink (admin) menghasilkan token-based magic link.
  // Setelah Supabase verify, redirect ke sini dengan token+type sebagai query params.
  const token = url.searchParams.get("token");
  const type = url.searchParams.get("type");
  if (token && (type === "magiclink" || type === "email")) {
    const supabase = await supabaseServer();
    // verifyOtp tidak butuh email untuk token-based flow dari generateLink
    const { error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: "magiclink",
    });
    if (!error) {
      return NextResponse.redirect(new URL("/dashboard", url.origin));
    }
    console.error("[auth/callback] verifyOtp error:", error.message);
  }

  // Fallback: kalau tidak ada code/token, redirect ke login dengan error
  const loginUrl = new URL("/login", url.origin);
  loginUrl.hash = "error=access_denied&error_code=otp_expired";
  return NextResponse.redirect(loginUrl);
}
