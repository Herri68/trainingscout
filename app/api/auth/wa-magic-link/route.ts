// POST /api/auth/wa-magic-link
// Single-trainer internal login: generate Supabase magic link via Admin API + kirim ke WA.
// Auto-fallback ke email magic link kalau WA tidak available.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendText, getSessionStatus } from "@/lib/wa/client";

export const runtime = "nodejs";
export const maxDuration = 30;

// In-memory rate limit: per-IP, window 30s, max 3 req. Reset on cold start (acceptable for internal-only).
const RATE_WINDOW_MS = 30_000;
const RATE_MAX = 3;
const ipBuckets = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const arr = (ipBuckets.get(ip) ?? []).filter((t) => t > cutoff);
  if (arr.length >= RATE_MAX) {
    ipBuckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  ipBuckets.set(ip, arr);
  return false;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const head = user[0] ?? "*";
  return `${head}***@${domain}`;
}

function maskJid(jid: string): string {
  // Ambil 4 digit terakhir dari prefix nomor (sebelum @).
  const at = jid.indexOf("@");
  const prefix = at > 0 ? jid.slice(0, at) : jid;
  const last4 = prefix.slice(-4);
  return `+${prefix.slice(0, 2)} ${"x".repeat(Math.max(0, prefix.length - 6))} ${last4}`;
}

function isWaConfigured(): boolean {
  return (
    process.env.WHATSAPP_ENABLED === "true" &&
    !!process.env.TRAINER_WA_JID &&
    !!process.env.WAHA_BASE_URL
  );
}

async function isWaWorking(): Promise<boolean> {
  const s = await getSessionStatus();
  return !!s && (s.status === "WORKING" || s.status === "STARTING");
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function POST(req: Request): Promise<Response> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (rateLimited(ip)) {
    console.log(`[auth/wa-magic-link] rate_limited ip=${ip}`);
    return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }

  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, reason: "invalid_email" }, { status: 400 });
  }

  const trainerEmail = process.env.TRAINER_EMAIL?.trim().toLowerCase();
  if (!trainerEmail || email.toLowerCase() !== trainerEmail) {
    console.log(`[auth/wa-magic-link] not_registered email=${maskEmail(email)}`);
    return NextResponse.json({ ok: false, reason: "not_registered" });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const redirectTo = `${appUrl}/auth/callback`;
  const supabase = adminClient();

  const waReady = isWaConfigured() && (await isWaWorking());
  const fallbackReason = !isWaConfigured()
    ? "env_missing"
    : !waReady
      ? "wa_unavailable"
      : null;

  // WA path
  if (waReady) {
    try {
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (error || !data.properties?.action_link) {
        console.error(`[auth/wa-magic-link] generate_link_failed: ${error?.message}`);
        return NextResponse.json({ ok: false, reason: "generate_link_failed" }, { status: 500 });
      }
      const link = data.properties.action_link;
      const jid = process.env.TRAINER_WA_JID!;
      const text = `Halo! Klik link ini untuk masuk ke TrainingScout:\n\n${link}\n\nLink berlaku ~1 jam, sekali pakai.`;
      try {
        await sendText(jid, text);
        console.log(`[auth/wa-magic-link] sent_via=wa email=${maskEmail(email)} jid=${maskJid(jid)}`);
        return NextResponse.json({
          ok: true,
          channel: "wa",
          maskedDestination: maskJid(jid),
        });
      } catch (err) {
        console.error(`[auth/wa-magic-link] wa_send_failed:`, err);
        // jatuh ke email fallback di bawah
        return await fallbackToEmail(email, redirectTo, "wa_send_failed");
      }
    } catch (err) {
      console.error(`[auth/wa-magic-link] generateLink threw:`, err);
      return NextResponse.json({ ok: false, reason: "generate_link_failed" }, { status: 500 });
    }
  }

  return await fallbackToEmail(email, redirectTo, fallbackReason ?? "wa_unavailable");
}

async function fallbackToEmail(
  email: string,
  redirectTo: string,
  reason: string,
): Promise<Response> {
  const supabase = adminClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    console.error(`[auth/wa-magic-link] email_send_failed reason=${reason}: ${error.message}`);
    return NextResponse.json({ ok: false, reason: "email_send_failed" }, { status: 500 });
  }
  console.log(
    `[auth/wa-magic-link] sent_via=email reason=${reason} email=${maskEmail(email)}`,
  );
  return NextResponse.json({
    ok: true,
    channel: "email",
    reason,
    maskedDestination: maskEmail(email),
  });
}
