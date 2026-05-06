-- Phase 6: idempotency flags untuk cron deadline + reminder
-- Jalankan di Supabase SQL editor.

alter table participants
  add column if not exists reminder_sent_at timestamptz;

alter table batches
  add column if not exists auto_brief_sent_at timestamptz;
