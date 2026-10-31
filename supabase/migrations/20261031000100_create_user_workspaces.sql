-- StudyVault: account-isolated workspace storage
-- Each authenticated user owns independent records in each workspace collection.
-- The client must never use a service-role key.

create table if not exists public.workspace_records (
    user_id uuid not null references auth.users(id) on delete cascade,
    collection text not null check (
        collection in (
            'subjects',
            'resources',
            'notes',
            'folders',
            'timetable',
            'timetable_completions'
        )
    ),
    record_id text not null,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    primary key (user_id, collection, record_id)
);

create index if not exists workspace_records_user_collection_updated_idx
    on public.workspace_records (user_id, collection, updated_at desc);

alter table public.workspace_records enable row level security;

drop policy if exists "Users can read their own workspace records" on public.workspace_records;
create policy "Users can read their own workspace records"
    on public.workspace_records
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own workspace records" on public.workspace_records;
create policy "Users can insert their own workspace records"
    on public.workspace_records
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own workspace records" on public.workspace_records;
create policy "Users can update their own workspace records"
    on public.workspace_records
    for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own workspace records" on public.workspace_records;
create policy "Users can delete their own workspace records"
    on public.workspace_records
    for delete
    to authenticated
    using ((select auth.uid()) = user_id);

revoke all on public.workspace_records from anon;
grant select, insert, update, delete on public.workspace_records to authenticated;

-- Private file bucket. Object paths must begin with the authenticated user's UUID.
insert into storage.buckets (id, name, public)
values ('studyvault-files', 'studyvault-files', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can read their own StudyVault files" on storage.objects;
create policy "Users can read their own StudyVault files"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'studyvault-files'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Users can upload their own StudyVault files" on storage.objects;
create policy "Users can upload their own StudyVault files"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'studyvault-files'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Users can update their own StudyVault files" on storage.objects;
create policy "Users can update their own StudyVault files"
    on storage.objects
    for update
    to authenticated
    using (
        bucket_id = 'studyvault-files'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'studyvault-files'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Users can delete their own StudyVault files" on storage.objects;
create policy "Users can delete their own StudyVault files"
    on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'studyvault-files'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );
