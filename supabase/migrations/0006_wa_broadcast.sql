-- V2 broadcast: idempotency timestamp untuk feature broadcast WA.
-- Additive, nullable.

alter table participants
  add column if not exists wa_broadcast_sent_at timestamptz;
