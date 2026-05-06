-- TrainingScout: schema awal (Phase 1)
-- Jalankan di Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  course_name text,
  deadline timestamptz,
  status text not null default 'draft' check (status in ('draft','active','closed')),
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  token text not null unique,
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','completed','abandoned')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists participants_batch_idx on participants(batch_id);
create index if not exists participants_token_idx on participants(token);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_participant_idx on messages(participant_id, created_at);

-- RLS: trainer hanya lihat data miliknya. Peserta tidak login;
-- akses sesi dilakukan via service role key di server route.
alter table batches enable row level security;
alter table participants enable row level security;
alter table messages enable row level security;

create policy "trainer reads own batches" on batches
  for select using (auth.uid() = created_by_user_id);
create policy "trainer writes own batches" on batches
  for all using (auth.uid() = created_by_user_id)
  with check (auth.uid() = created_by_user_id);

create policy "trainer reads own participants" on participants
  for select using (
    exists (select 1 from batches b where b.id = batch_id and b.created_by_user_id = auth.uid())
  );
create policy "trainer writes own participants" on participants
  for all using (
    exists (select 1 from batches b where b.id = batch_id and b.created_by_user_id = auth.uid())
  ) with check (
    exists (select 1 from batches b where b.id = batch_id and b.created_by_user_id = auth.uid())
  );

create policy "trainer reads own messages" on messages
  for select using (
    exists (
      select 1 from participants p
      join batches b on b.id = p.batch_id
      where p.id = participant_id and b.created_by_user_id = auth.uid()
    )
  );
