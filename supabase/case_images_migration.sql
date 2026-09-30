-- Run once in the existing project before deploying the image interface.
-- Private bucket: each object path is seller_uuid/case_id/random_filename.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-images', 'case-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create table if not exists public.case_images (
  case_id bigint primary key references public.cases(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
alter table public.case_images enable row level security;

create policy "Case owner or admin reads image record" on public.case_images
for select to authenticated using (exists (
  select 1 from public.cases c where c.id = case_id
  and (c.seller_id = (select auth.uid()) or (select public.is_support_admin()))
));
create policy "Seller records own case image" on public.case_images
for insert to authenticated with check (exists (
  select 1 from public.cases c where c.id = case_id
  and c.seller_id = (select auth.uid())
  and storage_path like (select auth.uid())::text || '/' || case_id::text || '/%'
));
grant select, insert on public.case_images to authenticated;

-- SELECT is needed to create temporary signed viewing URLs. Never make this bucket public.
create policy "Case owner or admin views image object" on storage.objects
for select to authenticated using (
  bucket_id = 'case-images' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_support_admin())
  )
);
create policy "Seller uploads own case image" on storage.objects
for insert to authenticated with check (
  bucket_id = 'case-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.cases c
    where c.id::text = (storage.foldername(name))[2]
    and c.seller_id = (select auth.uid()))
);
-- Object deletion remains possible after the case row is removed.
create policy "Case owner or admin removes image object" on storage.objects
for delete to authenticated using (
  bucket_id = 'case-images' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_support_admin())
  )
);
