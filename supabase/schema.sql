-- Run once in a fresh Supabase project using SQL Editor.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null,
  email text,
  role text not null check (role in ('seller', 'admin')),
  approved_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.cases (
  id bigint generated always as identity primary key,
  seller_id uuid not null references public.profiles(id),
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 120),
  customer_phone text not null check (char_length(btrim(customer_phone)) between 7 and 25),
  seller_phone text not null check (char_length(btrim(seller_phone)) between 7 and 25),
  unique_code text not null check (char_length(btrim(unique_code)) between 1 and 80),
  issue text not null check (char_length(btrim(issue)) between 5 and 3000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'solved')),
  admin_remark text not null default '' check (char_length(admin_remark) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  solved_at timestamptz,
  constraint solved_at_consistency check ((status = 'solved') = (solved_at is not null))
);

create index if not exists cases_seller_created_idx on public.cases(seller_id, created_at desc);
create index if not exists cases_created_idx on public.cases(created_at desc);

-- SECURITY DEFINER avoids a recursive profile RLS check. Only authenticated users can execute it.
create function public.is_support_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
grant execute on function public.is_support_admin() to authenticated;

create function public.prepare_case_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Immutable seller submission. Admin may only change status and remark.
  if new.id is distinct from old.id or new.seller_id is distinct from old.seller_id
     or new.customer_name is distinct from old.customer_name
     or new.customer_phone is distinct from old.customer_phone
     or new.seller_phone is distinct from old.seller_phone
     or new.unique_code is distinct from old.unique_code
     or new.issue is distinct from old.issue
     or new.created_at is distinct from old.created_at then
    raise exception 'Submission fields cannot be changed';
  end if;
  new.updated_at := now();
  if new.status = 'solved' then
    new.solved_at := coalesce(old.solved_at, now());
  else
    new.solved_at := null;
  end if;
  return new;
end;
$$;
create trigger prepare_case_update_trigger before update on public.cases
for each row execute function public.prepare_case_update();

-- Every new Auth account starts as a seller awaiting admin approval.
-- The role and approval state are assigned by the database, never by client metadata.
create function public.handle_new_seller_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, display_name, email, role, approved_at)
  values (
    new.id,
    'seller_' || substring(replace(new.id::text, '-', '') from 1 for 12),
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Seller'), 120),
    new.email,
    'seller',
    null
  );
  return new;
end;
$$;
create trigger on_auth_user_created_seller after insert on auth.users
for each row execute function public.handle_new_seller_registration();

alter table public.profiles enable row level security;
alter table public.cases enable row level security;

create policy "Read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "Admin reads profiles" on public.profiles for select to authenticated
  using ((select public.is_support_admin()));
create policy "Admin approves sellers" on public.profiles for update to authenticated
  using ((select public.is_support_admin()))
  with check ((select public.is_support_admin()));

create policy "Seller reads own cases" on public.cases for select to authenticated
  using (seller_id = (select auth.uid()));
create policy "Admin reads all cases" on public.cases for select to authenticated
  using ((select public.is_support_admin()));
create policy "Seller creates own open case" on public.cases for insert to authenticated
  with check (
    seller_id = (select auth.uid()) and status = 'open'
    and admin_remark = '' and solved_at is null
    and exists (select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'seller')
  );
create policy "Only approved sellers create cases" on public.cases as restrictive for insert to authenticated
  with check (exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'seller' and p.approved_at is not null));
create policy "Admin updates cases" on public.cases for update to authenticated
  using ((select public.is_support_admin()))
  with check ((select public.is_support_admin()));

grant select on public.profiles to authenticated;
grant update (approved_at) on public.profiles to authenticated;
grant select, insert, update on public.cases to authenticated;
grant usage, select on sequence public.cases_id_seq to authenticated;
