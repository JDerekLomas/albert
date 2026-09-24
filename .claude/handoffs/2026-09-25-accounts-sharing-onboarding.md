# Accounts, sharing, onboarding — design and handoff (2026-09-25)

**Goal.** Turn the manuscript editor into a product a stranger can be sent to: sign in,
bring a book in, invite collaborators with roles, and learn the tool without Derek in the
room. First real outside user: Pieter Jan Stappers. Derek's ask, verbatim: "build out the
complete product, including sharing, onboarding, accounts, etc."

**Definition of done.** Signed-out visitor sees a landing page and can sign in by email
link. Signed-in user sees only their books, can create/import one, rename/delete it (owner),
invite by email or share link with a role, and work in the editor under their real name.
Every API route that reads or writes book data, or spends Gemini money, requires a session
and checks membership. The public "Allow all" RLS policies are gone. Scripts still work
(service key). Deployed, aliased, verified with a headless-Chrome run.

## Why this shape

- **Own magic-link auth, not Supabase Auth.** Supabase Auth needs the redirect allowlist,
  SMTP and email templates set in the dashboard or Management API. The Management token in
  secret-lover is dead (401, verified 2026-09-25) and the `supabase` CLI is logged into a
  different org. Without that, magic links fall back to an unknown Site URL and the built-in
  mailer allows ~2 emails/hour. Resend (sourcelibrary's key, `sourcelibrary.org` verified) is
  in hand, so the login link is ours end to end.
- **Data access moves behind API routes.** Our sessions are invisible to Postgres RLS, so
  the browser can no longer talk to Supabase directly. `src/lib/api.ts` is the client; the
  routes use the service key and enforce membership. The anon key stays only for realtime
  presence/broadcast channels. (Broadcast on a public channel is readable by anyone who
  knows a document id — accepted for now; private channels need auth JWTs we can't mint.)
- **Members keyed by email**, so you can invite someone before they have signed in.

## Schema (additive; `db/schema.sql` is the record)

```
albert_users        (id uuid pk, email text unique, name text, color text, created_at, last_seen_at)
albert_login_tokens (token_hash text pk, email text, redirect text, created_at, expires_at, used_at)
albert_book_members (book_id, email, role owner|editor|viewer, invited_by, created_at, accepted_at; pk (book_id,email))
albert_books        + owner_email text, share_token text unique, share_role text default 'editor'
albert_invites_log  (not needed; invites are member rows with accepted_at null)
```
Existing books: `derek@playpowerlabs.com` is owner of all three. Albert's email is unknown —
Derek adds him from the Members panel.

After the frontend is merged and deployed: drop every `Allow all` / `*_all` policy on the
`albert_*` tables that is granted to `public`. Keep the `albert_app` role policies and the
service role (bypasses RLS). Scripts that used the anon key are switched to prefer the
service key first.

## Session

Cookie `me_session`, httpOnly, Secure, SameSite=Lax, 90 days. Value: base64url(JSON
{email,name,uid,exp}) + "." + HMAC-SHA256(secret). Secret in env `SESSION_SECRET`. No
server-side session table: sign-out clears the cookie; rotating the secret signs everyone out.

Login: `POST /api/auth/request {email, redirect}` → token (32 random bytes, sha256 stored),
15 min, Resend email with `/auth/verify?t=…&r=…`. The verify page is a client page with a
"Continue" button that POSTs the token — link prefetchers (Outlook Safe Links) would burn a
GET-consumed token. `POST /api/auth/verify` consumes it, upserts `albert_users`, sets cookie.

Env: `SESSION_SECRET`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (default
`Manuscript Editor <editor@sourcelibrary.org>`), `APP_URL` (default
`https://albert-book.vercel.app`).

## API (all JSON, all require session unless noted)

```
POST /api/auth/request       {email, redirect?}            public
POST /api/auth/verify        {token}                       public → sets cookie
POST /api/auth/signout
GET  /api/auth/me            → {user} | 401
PATCH /api/auth/me           {name?, color?}
GET  /api/books              → {books:[{…, role, chapters, words}]}
POST /api/books              {title, chapters?:[{title,html,chapter_number}]} → {book}
GET  /api/books/:id          → {book, documents, members, role}
PATCH /api/books/:id         {title?, share_role?, share_enabled?}   owner
DELETE /api/books/:id                                                  owner (cascade)
POST /api/books/:id/documents {title, chapter_number?, part_number?}  editor
GET/POST/DELETE /api/books/:id/members  {email, role}                owner
POST /api/join/:token                                                  → adds member, {bookId}
GET  /api/documents/:id      → {document, role}
PATCH /api/documents/:id     {content?, title?}                        editor
DELETE /api/documents/:id                                              editor
GET/POST /api/documents/:id/versions
GET/POST /api/documents/:id/comments; PATCH/DELETE /api/comments/:id
POST /api/documents/:id/suggestion-log
GET  /api/books/:id/verdicts
```
Existing `ai`, `assess`, `assess-book`, `continuity` routes: require session + membership
(`assess` and `ai` take a `documentId` now). `migrate`, `run-sql`, `setup` routes and the
`/setup` page are deleted; the SQL lives in `db/schema.sql`.

## Roles
owner: everything incl. members, rename, delete, share link. editor: edit, comment,
suggest, run AI. viewer: read, no comments (editor mounted `editable=false`, panels hidden).

## Onboarding
- `/` signed out: landing (what it is, three things it does, sign in). Signed in: my books.
- First sign-in with no books → `/new`, which also offers "start empty".
- Book page: a dismissable "How this works" card the first time a user sees any book
  (localStorage flag) and a permanent `/guide` page linked from the header.
- Invite email: "<name> invited you to work on <book>" with a link that signs them in and
  lands on the book.
- Header account menu everywhere: name (click to change), email, sign out.

## Status: SHIPPED 2026-09-25 01:30 CEST
PR #7 merged by Derek's say-so ("merge, gnite"), deployed to production, the three domains
re-aliased, `scripts/tighten-rls.mjs` run: public policies 9 → 0, anon key reads `[]` from
`albert_documents`, production sign-in + `/api/books` verified with a throwaway user (cleaned up).

**Open items for Derek:** (1) sign in once at https://albert-book.vercel.app/login with
derek@playpowerlabs.com — he is owner of all three books already; (2) invite Albert from the
Share panel of both memoir books; (3) send Pieter Jan https://albert-book.vercel.app/new;
(4) optionally verify a nicer sender domain in Resend and set `AUTH_EMAIL_FROM`.

## Rollout
1. Branch `accounts`, PR, Vercel preview. Additive tables created before the PR.
2. Headless-Chrome run on the preview: request link → read token hash… (tokens are hashed,
   so the test reads the emailed link via Resend's API `GET /emails/:id`, or inserts a known
   token directly with the DB URL) → verify → create book → invite → second context joins.
3. Derek reviews (auth is on the hold list), merges. Then: deploy, alias, drop public
   policies, verify the anon key can no longer read `albert_documents`.

## Not in scope
Google sign-in (Resend link is enough; Google needs OAuth client setup), per-paragraph
permissions, billing, rate limits beyond "must be a member".
