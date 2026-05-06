import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return new Response("unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const now = Date.now();

  // Batch dengan deadline 0–24 jam ke depan dan belum closed
  const inOneDay = new Date(now + ONE_DAY_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  const { data: batches, error } = await admin
    .from("batches")
    .select("id, name, course_name, deadline")
    .neq("status", "closed")
    .gte("deadline", nowIso)
    .lte("deadline", inOneDay);
  if (error) return new Response(error.message, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const results: { participant_id: string; ok: boolean; reason?: string }[] = [];

  for (const b of batches ?? []) {
    const { data: participants } = await admin
      .from("participants")
      .select("id, name, email, token, status, reminder_sent_at")
      .eq("batch_id", b.id)
      .in("status", ["not_started", "in_progress"])
      .is("reminder_sent_at", null);

    for (const p of participants ?? []) {
      if (!p.email) {
        results.push({ participant_id: p.id, ok: false, reason: "no email" });
        continue;
      }
      try {
        const link = `${appUrl}/s/${p.token}`;
        const deadlineLocal = b.deadline
          ? new Date(b.deadline).toLocaleString("id-ID")
          : "";
        await sendEmail({
          to: p.email,
          subject: `Pengingat: sesi pra-kelas ${b.name}`,
          html: `<p>Halo ${escapeHtml(p.name)},</p>
<p>Ini pengingat untuk menyelesaikan sesi pra-kelas <b>${escapeHtml(b.name)}</b>${b.course_name ? ` (${escapeHtml(b.course_name)})` : ""}.</p>
<p>Deadline: <b>${escapeHtml(deadlineLocal)}</b></p>
<p><a href="${link}">Buka sesi</a> — kira-kira 15 menit ngobrol santai dengan TrainingScout.</p>
<p>—<br/>TrainingScout</p>`,
        });
        await admin
          .from("participants")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", p.id);
        results.push({ participant_id: p.id, ok: true });
      } catch (e) {
        results.push({ participant_id: p.id, ok: false, reason: (e as Error).message });
      }
    }
  }

  return Response.json({ processed: results.length, results });
}
