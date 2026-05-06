import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateBrief } from "@/lib/agent/brief";
import { sendEmail, escapeHtml } from "@/lib/email";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return new Response("unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  // Batch yang deadline-nya sudah lewat dan belum di-close
  const { data: batches, error } = await admin
    .from("batches")
    .select("id, name, course_name, deadline, created_by_user_id, auto_brief_sent_at")
    .neq("status", "closed")
    .not("deadline", "is", null)
    .lt("deadline", now);
  if (error) return new Response(error.message, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const results: { batch_id: string; ok: boolean; reason?: string }[] = [];

  for (const b of batches ?? []) {
    if (b.auto_brief_sent_at) {
      results.push({ batch_id: b.id, ok: true, reason: "already sent" });
      continue;
    }

    try {
      // Cek ada peserta selesai? Kalau tidak ada sama sekali, tetap close tapi skip brief.
      const { count: completedCount } = await admin
        .from("participants")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", b.id)
        .eq("status", "completed");

      let briefId: string | null = null;
      if ((completedCount ?? 0) > 0) {
        const { briefId: id } = await generateBrief(b.id, "auto");
        briefId = id;
      }

      // Ambil email trainer
      const { data: userRes } = await admin.auth.admin.getUserById(b.created_by_user_id);
      const trainerEmail = userRes?.user?.email;

      if (trainerEmail) {
        const briefUrl = `${appUrl}/dashboard/batches/${b.id}/brief`;
        const subject = briefId
          ? `Class brief siap — ${b.name}`
          : `Batch ditutup tanpa brief — ${b.name}`;
        const bodyHtml = briefId
          ? `<p>Halo,</p>
<p>Deadline batch <b>${escapeHtml(b.name)}</b>${b.course_name ? ` (kelas ${escapeHtml(b.course_name)})` : ""} sudah lewat. Class brief sudah di-generate otomatis.</p>
<p><a href="${briefUrl}">Buka class brief</a></p>
<p>—<br/>TrainingScout</p>`
          : `<p>Halo,</p>
<p>Deadline batch <b>${escapeHtml(b.name)}</b> sudah lewat, tapi belum ada peserta yang menyelesaikan asesmen. Brief tidak di-generate.</p>
<p><a href="${appUrl}/dashboard/batches/${b.id}">Buka batch</a></p>
<p>—<br/>TrainingScout</p>`;
        await sendEmail({ to: trainerEmail, subject, html: bodyHtml });
      }

      await admin
        .from("batches")
        .update({ status: "closed", auto_brief_sent_at: new Date().toISOString() })
        .eq("id", b.id);

      results.push({ batch_id: b.id, ok: true });
    } catch (e) {
      results.push({ batch_id: b.id, ok: false, reason: (e as Error).message });
    }
  }

  return Response.json({ processed: results.length, results });
}
