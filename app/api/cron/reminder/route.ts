import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sendText } from "@/lib/wa/client";
import { reminder24h, reminder2h } from "@/lib/wa/messages";

export const runtime = "nodejs";
export const maxDuration = 300;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TWO_HR_MS = 2 * 60 * 60 * 1000;

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return new Response("unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const now = Date.now();

  const inOneDay = new Date(now + ONE_DAY_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  const { data: batches, error } = await admin
    .from("batches")
    .select("id, name, course_name, deadline, channel")
    .neq("status", "closed")
    .gte("deadline", nowIso)
    .lte("deadline", inOneDay);
  if (error) return new Response(error.message, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const results: { participant_id: string; ok: boolean; channel: string; reason?: string }[] = [];

  for (const b of batches ?? []) {
    if (b.channel === "whatsapp") {
      const deadlineMs = b.deadline ? new Date(b.deadline).getTime() : 0;
      const within2h = deadlineMs - now <= TWO_HR_MS;

      const { data: psWa } = await admin
        .from("participants")
        .select("id, name, phone_jid, wa_reminder_24h_sent_at, wa_reminder_2h_sent_at")
        .eq("batch_id", b.id)
        .eq("wa_status", "in_progress")
        .not("phone_jid", "is", null);

      for (const p of psWa ?? []) {
        if (!p.phone_jid) continue;
        try {
          if (within2h && !p.wa_reminder_2h_sent_at) {
            await sendText(p.phone_jid, reminder2h(p.name, b.name));
            await admin
              .from("participants")
              .update({ wa_reminder_2h_sent_at: nowIso })
              .eq("id", p.id);
            results.push({ participant_id: p.id, ok: true, channel: "wa-2h" });
          } else if (!p.wa_reminder_24h_sent_at) {
            await sendText(p.phone_jid, reminder24h(p.name, b.name));
            await admin
              .from("participants")
              .update({ wa_reminder_24h_sent_at: nowIso })
              .eq("id", p.id);
            results.push({ participant_id: p.id, ok: true, channel: "wa-24h" });
          }
        } catch (e) {
          results.push({
            participant_id: p.id,
            ok: false,
            channel: "wa",
            reason: (e as Error).message,
          });
        }
      }
      continue; // skip email path untuk batch WA
    }

    // Web batch — email path existing
    const { data: participants } = await admin
      .from("participants")
      .select("id, name, email, token, status, reminder_sent_at")
      .eq("batch_id", b.id)
      .in("status", ["not_started", "in_progress"])
      .is("reminder_sent_at", null);

    for (const p of participants ?? []) {
      if (!p.email) {
        results.push({ participant_id: p.id, ok: false, channel: "email", reason: "no email" });
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
          .update({ reminder_sent_at: nowIso })
          .eq("id", p.id);
        results.push({ participant_id: p.id, ok: true, channel: "email" });
      } catch (e) {
        results.push({
          participant_id: p.id,
          ok: false,
          channel: "email",
          reason: (e as Error).message,
        });
      }
    }
  }

  return Response.json({ processed: results.length, results });
}
