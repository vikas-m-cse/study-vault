-- StudyVault Phase 3: safe cloud-sync foundation
-- Apply in Supabase SQL Editor only after reviewing the setup guide.
-- This migration creates isolated sync records; it does NOT alter IndexedDB or existing app tables.

create table if not exists public.studyvault_sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type in ('subject', 'note', 'folder', 'resource', 'revision', 'preference')),
  record_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, record_type, record_id)
);

create index if not exists studyvault_sync_records_user_updated_idx
  on public.studyvault_sync_records (user_id, updated_at);

alter table public.studyvault_sync_records enable row level security;

drop policy if exists "Users can read their StudyVault sync records" on public.studyvault_sync_records;
create policy "Users can read their StudyVault sync records"
  on public.studyvault_sync_records for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their StudyVault sync records" on public.studyvault_sync_records;
create policy "Users can insert their StudyVault sync records"
  on public.studyvault_sync_records for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their StudyVault sync records" on public.studyvault_sync_records;
create policy "Users can update their StudyVault sync records"
  on public.studyvault_sync_records for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their StudyVault sync records" on public.studyvault_sync_records;
create policy "Users can delete their StudyVault sync records"
  on public.studyvault_sync_records for delete
  to authenticated
  using (auth.uid() = user_id);

-- Make API privileges explicit. RLS decides which rows a user can access;
-- SQL grants decide which operations the API role may attempt at all.
revoke all on table public.studyvault_sync_records from anon;
grant select, insert, update, delete on table public.studyvault_sync_records to authenticated;

-- Attachments live in Supabase Storage, not JSON. Store only metadata in this table.
create table if not exists public.studyvault_sync_attachments (
  user_id uuid not null references auth.users(id) on delete cascade,
  attachment_id text not null,
  resource_id text not null,
  object_path text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  byte_size bigint not null check (byte_size >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, attachment_id),
  unique (object_path)
);

alter table public.studyvault_sync_attachments enable row level security;

drop policy if exists "Users can read their StudyVault attachment metadata" on public.studyvault_sync_attachments;
create policy "Users can read their StudyVault attachment metadata"
  on public.studyvault_sync_attachments for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert their StudyVault attachment metadata" on public.studyvault_sync_attachments;
create policy "Users can insert their StudyVault attachment metadata"
  on public.studyvault_sync_attachments for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update their StudyVault attachment metadata" on public.studyvault_sync_attachments;
create policy "Users can update their StudyVault attachment metadata"
  on public.studyvault_sync_attachments for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their StudyVault attachment metadata" on public.studyvault_sync_attachments;
create policy "Users can delete their StudyVault attachment metadata"
  on public.studyvault_sync_attachments for delete
  to authenticated using (auth.uid() = user_id);

revoke all on table public.studyvault_sync_attachments from anon;
grant select, insert, update, delete on table public.studyvault_sync_attachments to authenticated;

-- Private bucket. Object paths must begin with the authenticated user's UUID.
insert into storage.buckets (id, name, public, file_size_limit)
values ('studyvault-attachments', 'studyvault-attachments', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "Users can read own StudyVault attachment objects" on storage.objects;
create policy "Users can read own StudyVault attachment objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'studyvault-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload own StudyVault attachment objects" on storage.objects;
create policy "Users can upload own StudyVault attachment objects"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'studyvault-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update own StudyVault attachment objects" on storage.objects;
create policy "Users can update own StudyVault attachment objects"
  on storage.objects for update to authenticated
  using (bucket_id = 'studyvault-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'studyvault-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete own StudyVault attachment objects" on storage.objects;
create policy "Users can delete own StudyVault attachment objects"
  on storage.objects for delete to authenticated
  using (bucket_id = 'studyvault-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
