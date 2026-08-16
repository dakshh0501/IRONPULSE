-- ----------------------------------------------------------------------------
-- 0005_storage.sql — Supabase Storage migration (Step 8F)
--
-- One public bucket for gym images (member avatars + gym logos). Uploads are
-- staff-only and gym-scoped via storage RLS; reads are public by design (the
-- URLs are persisted in DB rows and rendered in <img> tags; images are
-- non-sensitive avatars/logos).
--
-- Helpers reused: is_staff(auth.uid()), is_super_admin(auth.uid()),
-- auth_gym_id() (defined in 0001_initial_schema.sql).
-- ----------------------------------------------------------------------------

-- Bucket (idempotent). file_size_limit mirrors the client-side 5 MB cap;
-- allowed_mime_types mirrors validateImage().
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gym-images',
  'gym-images',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Path scoping predicate — mirrors the tenancy model:
--   members/{memberId}/profile.webp   -> member must belong to caller's gym
--   gyms/{gymId}/gym-logo.webp        -> gym segment must equal caller's gym
-- super_admin bypasses both.
-- ----------------------------------------------------------------------------
create or replace function public.storage_gym_image_allowed(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select
    (storage.foldername(object_name))[1] = 'members'
      and (is_super_admin(auth.uid())
           or exists (
             select 1 from members m
             where m.id::text = (storage.foldername(object_name))[2]
               and m.gym_id = auth_gym_id()))
    or
    (storage.foldername(object_name))[1] = 'gyms'
      and (is_super_admin(auth.uid())
           or (storage.foldername(object_name))[2] = auth_gym_id())
$$;

-- Public read (bucket is public; explicit policy keeps list/API access
-- consistent and is required for signed/API reads).
drop policy if exists gym_images_public_read on storage.objects;
create policy gym_images_public_read
  on storage.objects
  for select
  using (bucket_id = 'gym-images');

-- Staff-only, gym-scoped uploads (new object = insert).
drop policy if exists gym_images_staff_upload on storage.objects;
create policy gym_images_staff_upload
  on storage.objects
  for insert
  with check (
    bucket_id = 'gym-images'
    and is_staff(auth.uid())
    and public.storage_gym_image_allowed(name)
  );

-- Overwrite of an existing object (upsert) = update; same predicate.
drop policy if exists gym_images_staff_update on storage.objects;
create policy gym_images_staff_update
  on storage.objects
  for update
  using (
    bucket_id = 'gym-images'
    and is_staff(auth.uid())
    and public.storage_gym_image_allowed(name)
  )
  with check (
    bucket_id = 'gym-images'
    and is_staff(auth.uid())
    and public.storage_gym_image_allowed(name)
  );

-- Staff cleanup (deleteMemberPhoto runs in staff sessions only).
drop policy if exists gym_images_staff_delete on storage.objects;
create policy gym_images_staff_delete
  on storage.objects
  for delete
  using (
    bucket_id = 'gym-images'
    and is_staff(auth.uid())
    and public.storage_gym_image_allowed(name)
  );
