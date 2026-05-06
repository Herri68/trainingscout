-- Phase 2: tool use infrastructure
-- Jalankan di Supabase SQL editor.

-- Simpan content blocks API Anthropic (text + tool_use + tool_result) supaya
-- conversation bisa direkonstruksi persis di turn berikutnya.
alter table messages
  add column if not exists content_blocks jsonb;

create table if not exists dimension_marks (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  dimension text not null,
  summary text not null,
  marked_at timestamptz not null default now(),
  unique (participant_id, dimension)
);
create index if not exists dimension_marks_participant_idx on dimension_marks(participant_id);

alter table dimension_marks enable row level security;

create policy "trainer reads own dimension_marks" on dimension_marks
  for select using (
    exists (
      select 1 from participants p
      join batches b on b.id = p.batch_id
      where p.id = participant_id and b.created_by_user_id = auth.uid()
    )
  );
