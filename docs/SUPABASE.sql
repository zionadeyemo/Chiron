-- CHIRON storage. Run once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run. See docs/DEPLOY.md.

-- All app data: one key-value row per document, scoped by the anonymous visitor id.
create table if not exists public.docs (
  visitor_id uuid not null,
  collection text not null,
  id text not null,
  data jsonb not null,
  version bigint not null default 0,          -- optimistic concurrency for read-modify-write
  updated_at timestamptz not null default now(),
  primary key (visitor_id, collection, id)
);
create index if not exists docs_visitor_collection on public.docs (visitor_id, collection);

-- Instrumentation events (append-only), also scoped by visitor.
create table if not exists public.events (
  seq bigint generated always as identity primary key,
  visitor_id uuid not null,
  stream text not null,
  at timestamptz not null,
  data jsonb not null
);
create index if not exists events_visitor_stream on public.events (visitor_id, stream, seq);

-- Only the server (service-role key) may touch these. RLS on with no policies = the anon and
-- authenticated keys can read and write nothing, even if the anon key ever leaked.
alter table public.docs enable row level security;
alter table public.events enable row level security;
revoke all on public.docs, public.events from anon, authenticated;

-- Private file bucket: uploads, PDF pages, images. Never public; served through signed URLs
-- (10 minutes max) after the server checks the visitor prefix. 60 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chiron-files', 'chiron-files', false, 62914560,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Handy afterwards: which access code each visitor used.
--   select visitor_id, data->>'code' as code, data->>'at' as entered
--   from public.docs where collection = 'meta' and id = 'access' order by 3;
