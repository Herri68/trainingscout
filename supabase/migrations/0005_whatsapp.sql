-- V2 Phase 1: WhatsApp channel — schema delta
-- Additive only, semua kolom baru nullable / default-safe agar batch web lama tidak terpengaruh.
-- Jalankan di Supabase SQL editor.

alter table batches
  add column if not exists channel text not null default 'web'
    check (channel in ('web', 'whatsapp'));

alter table participants
  add column if not exists phone_jid text,
  add column if not exists wa_status text
    check (wa_status in ('pending', 'pending_consent', 'in_progress', 'completed')),
  add column if not exists session_locked_at timestamptz,
  add column if not exists wa_reminder_24h_sent_at timestamptz,
  add column if not exists wa_reminder_2h_sent_at timestamptz;

create unique index if not exists participants_phone_jid_uniq
  on participants (phone_jid)
  where phone_jid is not null;
