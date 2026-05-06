"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-2xl font-semibold">Masuk sebagai trainer</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Kami akan kirim magic link ke emailmu. Klik link itu untuk masuk.
      </p>

      {sent ? (
        <div className="mt-6 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          Magic link sudah dikirim ke <b>{email}</b>. Cek inbox (dan spam folder).
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
            disabled={loading}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? "Mengirim..." : "Kirim magic link"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </main>
  );
}
