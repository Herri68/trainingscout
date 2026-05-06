-- Phase 5: class brief generator output
-- Jalankan di Supabase SQL editor.

create table if not exists briefs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  generated_at timestamptz not null default now(),
  generated_by text not null check (generated_by in ('auto','manual')),
  content text not null,
  edited_content text
);
create index if not exists briefs_batch_idx on briefs(batch_id, generated_at desc);

alter table briefs enable row level security;

create policy "trainer reads own briefs" on briefs
  for select using (
    exists (select 1 from batches b where b.id = batch_id and b.created_by_user_id = auth.uid())
  );
create policy "trainer writes own briefs" on briefs
  for all using (
    exists (select 1 from batches b where b.id = batch_id and b.created_by_user_id = auth.uid())
  ) with check (
    exists (select 1 from batches b where b.id = batch_id and b.created_by_user_id = auth.uid())
  );
