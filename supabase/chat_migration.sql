begin;
create table if not exists public.case_messages (
  id bigint generated always as identity primary key,
  case_id bigint not null references public.cases(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  sender_role text not null check (sender_role in ('seller', 'admin')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  client_token uuid not null unique,
  created_at timestamptz not null default now()
);
create index if not exists case_messages_case_id_idx on public.case_messages(case_id, id desc);
alter table public.case_messages enable row level security;
revoke all on public.case_messages from anon, authenticated;
grant select on public.case_messages to authenticated;
grant insert (case_id, sender_id, sender_role, body, client_token) on public.case_messages to authenticated;
grant usage, select on sequence public.case_messages_id_seq to authenticated;
drop policy if exists "Case participants read chat" on public.case_messages;
create policy "Case participants read chat" on public.case_messages for select to authenticated using (
  exists (select 1 from public.cases c where c.id = case_id
    and (c.seller_id = (select auth.uid()) or (select public.is_support_admin())))
);
drop policy if exists "Case participants send chat" on public.case_messages;
create policy "Case participants send chat" on public.case_messages for insert to authenticated with check (
  sender_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.role = sender_role and (p.role = 'admin' or p.approved_at is not null))
  and exists (select 1 from public.cases c where c.id = case_id
    and (c.seller_id = (select auth.uid()) or (select public.is_support_admin())))
);
commit;
