"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type SuccessState =
  | { channel: "wa"; maskedDestination: string }
  | { channel: "email"; maskedDestination: string; fallback: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"wa" | "email" | "verify" | null>(
    null,
  );
  const [otp, setOtp] = useState("");

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
          setError("Gagal mengirim kode. Coba lagi.");
        }
        return;
      }
      if (data.channel === "wa") {
        setSuccess({
          channel: "wa",
          maskedDestination: data.maskedDestination ?? "",
        });
      } else {
        setSuccess({
          channel: "email",
          maskedDestination: data.maskedDestination ?? "",
          fallback: true,
        });
      }
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

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading("verify");
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: "email",
    });
    setLoading(null);
    if (error) {
      setError("Kode salah atau kadaluarsa. Coba kirim ulang.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  function reset() {
    setSuccess(null);
    setError(null);
    setOtp("");
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-2xl font-semibold">Masuk sebagai trainer</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Kami akan kirim kode OTP ke WhatsApp atau magic link ke email kamu.
      </p>

      {success?.channel === "wa" ? (
        <form onSubmit={verifyOtp} className="mt-6 space-y-4">
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p>
              Kode OTP dikirim ke WhatsApp <b>{success.maskedDestination}</b>.
            </p>
            <p className="mt-1 text-xs text-green-800/80">
              Berlaku ~1 jam, sekali pakai.
            </p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={10}
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="kode dari WA"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-2xl tracking-[0.5em] outline-none focus:border-neutral-900"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading !== null || otp.length < 6}
            className="w-full rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading === "verify" ? "Memverifikasi..." : "Masuk"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            Kirim ulang / ganti email
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      ) : success?.channel === "email" ? (
        <div className="mt-6 space-y-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          {success.fallback && (
            <p className="text-amber-800">
              ⚠️ WhatsApp sedang gangguan, link dikirim ke email sebagai
              fallback.
            </p>
          )}
          <p>
            Magic link sudah dikirim ke email <b>{success.maskedDestination}</b>
            .
          </p>
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
              : "Kirim kode via WhatsApp"}
          </button>
          <button
            type="button"
            onClick={submitEmail}
            disabled={loading !== null || !email}
            className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading === "email"
              ? "Mengirim ke email..."
              : "Kirim magic link via email"}
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
