# Phase 3 — Safe cloud sync foundation

## Status
This phase introduces a reviewed Supabase schema foundation on an isolated branch. It does **not** enable syncing in the app yet. Existing IndexedDB remains the local source of truth until the sync engine, sign-in UI, conflict handling, and migration tests are implemented.

## Safety decisions
- Each cloud record is scoped by authenticated `user_id` and protected by Row Level Security (RLS).
- Notes, subjects, folders, resources, revision data, and preferences use a typed JSON payload. IDs are scoped by both user and record type.
- Deletes should eventually be represented as tombstones (`deleted_at`) so another device can learn about deletions.
- Attachments are stored in a private Storage bucket; object paths must start with the authenticated user's UUID. Metadata is separate from file bytes.
- Never put a Supabase service-role key in browser code. Client apps use only the project's publishable/anon key plus authenticated sessions.
- Cloud sync must be opt-in and must never silently replace local data.

## Supabase setup (not yet applied)
1. Create/open the intended Supabase project.
2. In SQL Editor, review and run `supabase/migrations/202610170001_phase3_safe_cloud_sync.sql`.
3. In Authentication settings, configure the sign-in methods and allowed redirect URLs for local development and the intended deployed domain.
4. Add only the project URL and publishable/anon key to local environment configuration. Do not commit `.env`.
5. Confirm RLS with two test accounts before uploading any real student data.

## App integration still required
- Add the Supabase JS client dependency and environment validation.
- Build sign-in/sign-out and explicit cloud-sync opt-in.
- Add a versioned local export/snapshot before first sync.
- Implement upload/download as a staged operation: validate → compare revisions/timestamps → show conflicts → apply transactionally → verify counts.
- Preserve attachment blobs and restore behavior; never clear IndexedDB as part of a sync attempt.
- Add retry/backoff, offline status, last-successful-sync timestamp, and idempotent writes.
- Test RLS isolation, empty cloud vs populated local database, same-record conflicts, deleted records, large attachments, interrupted sync, and restore after failure.

## Conflict policy
Do not blindly use last-write-wins for conflicting content. First integration should detect a same-record divergence and preserve both versions or ask the user which version to keep. Server timestamps are sync metadata, not proof of learning mastery.

## Validation
This migration has not been applied to a Supabase project and has not been tested against a live database. Review it in a disposable Supabase project first. No production deployment or live cloud sync is claimed.
