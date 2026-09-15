-- Mas Lini: isolated from legacy training data. No public/client access.
create table public.cs_contacts (
  jid text primary key,
  state jsonb not null,
  name text generated always as (state->>'name') stored,
  phone text generated always as (state->>'phone') stored,
  business text generated always as (state->>'business') stored,
  lease uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.cs_replies (
  jid text not null references public.cs_contacts(jid),
  message_id text not null,
  reply text not null,
  delivered boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (jid, message_id)
);
alter table public.cs_contacts enable row level security;
alter table public.cs_replies enable row level security;
revoke all on public.cs_contacts, public.cs_replies from anon, authenticated;
grant all on public.cs_contacts, public.cs_replies to service_role;

-- Serialize turns across server instances. WAHA retries a busy turn.
create function public.cs_claim(p_jid text, p_initial jsonb, p_lease uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.cs_contacts;
begin
  insert into cs_contacts(jid, state) values(p_jid, p_initial) on conflict do nothing;
  select * into c from cs_contacts where jid = p_jid for update;
  if c.lease_until > now() then return null; end if;
  update cs_contacts set lease=p_lease, lease_until=now()+interval '90 seconds' where jid=p_jid;
  return c.state;
end $$;

-- Save contact progress and cached reply atomically before delivery.
create function public.cs_prepare(p_jid text, p_lease uuid, p_message_id text, p_state jsonb, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update cs_contacts set state=p_state, updated_at=now()
    where jid=p_jid and lease=p_lease and lease_until>now();
  if not found then raise exception 'Contact lease expired'; end if;
  insert into cs_replies(jid,message_id,reply) values(p_jid,p_message_id,p_reply);
end $$;

create function public.cs_release(p_jid text, p_lease uuid)
returns void language sql security definer set search_path = public as $$
  update cs_contacts set lease=null, lease_until=null where jid=p_jid and lease=p_lease;
$$;
revoke all on function public.cs_claim(text,jsonb,uuid), public.cs_prepare(text,uuid,text,jsonb,text), public.cs_release(text,uuid) from public, anon, authenticated;
grant execute on function public.cs_claim(text,jsonb,uuid), public.cs_prepare(text,uuid,text,jsonb,text), public.cs_release(text,uuid) to service_role;
