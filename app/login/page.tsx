"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type SuccessState = {
  channel: "wa" | "email";
  maskedDestination: string;
  fallback: boolean;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"wa" | "email" | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const errorCode = params.get("error_code");
    if (errorCode === "otp_expired") {
      setError("Link sudah kadaluarsa. Minta magic link baru di bawah.");
    } else if (params.get("error")) {
      setError("Link tidak valid. Minta magic link baru di bawah.");
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function submitWa(e: React.FormEvent) {
    e.preventDefault();
    setLoading("wa");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/wa-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        reason?: string;
        channel?: "wa" | "email";
        maskedDestination?: string;
      };
      if (res.status === 429) {
        setError("Terlalu banyak percobaan. Coba lagi 30 detik.");
        return;
      }
      if (!data.ok) {
        if (data.reason === "not_registered") {
          setError("Email tidak terdaftar.");
        } else if (data.reason === "invalid_email") {
          setError("Format email tidak valid.");
        } else {
          setError("Gagal mengirim magic link. Coba lagi.");
        }
        return;
      }
      setSuccess({
        channel: data.channel ?? "wa",
        maskedDestination: data.maskedDestination ?? "",
        fallback: data.channel === "email",
      });
    } catch {
      setError("Network error. Coba lagi.");
    } finally {
      setLoading(null);
    }
  }

  async function submitEmail() {
    setLoading("email");
    setError(null);
    setSuccess(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(null);
    if (error) setError(error.message);
    else
      setSuccess({
        channel: "email",
        maskedDestination: maskEmail(email),
        fallback: false,
      });
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-2xl font-semibold">Masuk sebagai trainer</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Kami akan kirim magic link ke WhatsApp atau email kamu.
      </p>

      {success ? (
        <div className="mt-6 space-y-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          {success.channel === "wa" ? (
            <p>
              Magic link sudah dikirim ke WhatsApp{" "}
              <b>{success.maskedDestination}</b>.
            </p>
          ) : (
            <>
              {success.fallback && (
                <p className="text-amber-800">
                  ⚠️ WhatsApp sedang gangguan, link dikirim ke email sebagai
                  fallback.
                </p>
              )}
              <p>
                Magic link sudah dikirim ke email{" "}
                <b>{success.maskedDestination}</b>.
              </p>
            </>
          )}
          <p className="text-xs text-green-800/80">
            Link berlaku ~1 jam, sekali pakai.
          </p>
        </div>
      ) : (
        <form onSubmit={submitWa} className="mt-6 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@kamu.com"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
          <button
            type="submit"
            disabled={loading !== null}
            className="w-full rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading === "wa"
              ? "Mengirim ke WhatsApp..."
              : "Kirim magic link via WhatsApp"}
          </button>
          <button
            type="button"
            onClick={submitEmail}
            disabled={loading !== null || !email}
            className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading === "email" ? "Mengirim ke email..." : "Kirim via email"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </main>
  );
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  return `${user[0]}***@${domain}`;
}
