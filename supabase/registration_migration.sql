-- Run once in SQL Editor on the existing Seller Registration Support project.
-- Existing accounts remain approved; new self-registered accounts wait for admin.
alter table public.profiles add column email text;
alter table public.profiles add column approved_at timestamptz default now();

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

create policy "Admin approves sellers" on public.profiles for update to authenticated
  using ((select public.is_support_admin()))
  with check ((select public.is_support_admin()));
create policy "Only approved sellers create cases" on public.cases as restrictive for insert to authenticated
  with check (exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'seller' and p.approved_at is not null));

grant update (approved_at) on public.profiles to authenticated;
