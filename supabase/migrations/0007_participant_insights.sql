-- Customer insight dashboard Phase 1: tambah kolom level & goal di participants.
-- Additive, nullable. Diisi oleh pipeline ekstraksi insight (Phase 2+).
-- Sentinel goal "belum jelas" dibedakan dari NULL (NULL = belum diekstrak / gagal).

alter table participants
  add column if not exists level text
    check (level in ('pemula', 'menengah', 'mahir')),
  add column if not exists goal text;
