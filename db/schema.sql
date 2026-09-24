-- Accounts, membership, sharing (2026-09-25). Additive; safe to re-run.
create table if not exists albert_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  color text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create table if not exists albert_login_tokens (
  token_hash text primary key,
  email text not null,
  redirect text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create table if not exists albert_book_members (
  book_id text not null references albert_books(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','editor','viewer')),
  invited_by text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (book_id, email)
);
create index if not exists idx_book_members_email on albert_book_members(email);
alter table albert_books add column if not exists owner_email text;
alter table albert_books add column if not exists share_token text unique;
alter table albert_books add column if not exists share_role text not null default 'editor';
alter table albert_users enable row level security;
alter table albert_login_tokens enable row level security;
alter table albert_book_members enable row level security;
-- No public policies on the new tables: only the service role (API routes) touches them.

-- Existing books belong to Derek.
update albert_books set owner_email = 'derek@playpowerlabs.com' where owner_email is null;
insert into albert_book_members (book_id, email, role, accepted_at)
  select id, 'derek@playpowerlabs.com', 'owner', now() from albert_books
  on conflict (book_id, email) do nothing;

-- The app's key is scoped to the Postgres role albert_app (not service_role), so
-- every new table needs an explicit grant and an allow-all policy for that role.
grant select, insert, update, delete on albert_users, albert_login_tokens, albert_book_members to albert_app;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='albert_users' and policyname='albert_app_all') then
    create policy albert_app_all on albert_users for all to albert_app using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='albert_login_tokens' and policyname='albert_app_all') then
    create policy albert_app_all on albert_login_tokens for all to albert_app using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='albert_book_members' and policyname='albert_app_all') then
    create policy albert_app_all on albert_book_members for all to albert_app using (true) with check (true);
  end if;
end $$;
