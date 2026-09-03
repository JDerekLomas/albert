@AGENTS.md

# Albert - Book Manuscript Editor

## What This Is
A collaborative manuscript editor — originally built for Albert Lin's memoir, now multi-project
(as of 2026-09-02). The memoir covers his life as a National Geographic explorer, the search for
Genghis Khan's tomb, losing his leg, his Lost Cities TV career, and his son Charlie's TBI
recovery — 22 chapters across 4 parts, ~92k words, book id `albert-lin-memoir`.

## Architecture
- **Next.js 16 + TipTap** rich text editor with real-time collaboration
- **Supabase** backend, multi-book: `albert_books` (projects) → `albert_documents` (chapters,
  scoped by `book_id`) → `albert_versions` (revision history), `albert_comments`,
  `albert_chapter_summaries` + `albert_book_index` (see "Book index" below)
- **Deployed** on Vercel: production deploys from main branch
- Routes: `/` (all books) → `/b/[bookId]` (chapters in one book, grouped by part) → `/d/[id]`
  (the editor)

## Database Schema
- `albert_books`: id, title, created_at
- `albert_documents`: id, title, content (HTML), chapter_number, part_number, book_id,
  created_at, updated_at — chapters have `chapter_number`; part-opener docs (title/epigraph
  page) have `chapter_number = null` and `part_number` set; free-floating notes have both null.
  No `status` column exists despite the `Document` TS type declaring one — use `select("*")`,
  never an explicit column list, or Postgrest 400s.
- `albert_versions`: id, document_id, content, title, message, created_at
- `albert_comments`: id, document_id, content, author, from_pos, to_pos, quote, resolved,
  created_at
- `albert_chapter_summaries` / `albert_book_index`: see "Book index" below.
- **DDL access**: no `DATABASE_URL` in this project's own secrets, but `sourcelibrary`'s
  secret-lover manifest has `SUPABASE_DB_URL` — same underlying Supabase project, shared with
  sourcelibrary — which gives real Postgres access via the `postgres` npm package (already a
  dependency). Run migration scripts with `cd ~/sourcelibrary && secret-lover run -- node
  <absolute-path-to-albert-script>.mjs` (cwd controls which project's secrets inject; the
  script's own path is unaffected). Delete the script when done — these are one-off DDL, not
  part of the app. `/setup`'s copy-paste-SQL pattern is the fallback if that access ever breaks.

## Book index
Chapter and book-level summaries, built for answering synthesis questions ("what does the book
say about X, across all chapters") without re-reading the whole manuscript. Researched against
how Sudowrite/Novelcrafter/NovelAI and the map-reduce summarization literature handle this
before building (structured summaries beat embeddings/RAG at this corpus size — 92k words
doesn't need a vector store). Staleness is **computed on read**, never a stored flag: a chapter
summary is stale iff `source_updated_at < albert_documents.updated_at`.
```bash
# Map step — one chapter -> one summary row. Skips chapters already fresh.
secret-lover run -- node scripts/summarize-chapter.mjs --doc <document-id>
secret-lover run -- node scripts/summarize-chapter.mjs --book <book-id> --all [--force]

# Reduce step — refuses to run if any chapter's summary is stale.
secret-lover run -- node scripts/reindex-book.mjs --book <book-id>
```
Uses Gemini (`gemini-3-flash-preview`) via direct REST call, not Claude — cheap enough to
regenerate freely, per Derek. **The Gemini key must be albert's own project-scoped secret-lover
entry**, not the global-scoped one — they hold different values and the global one is stale
(401s). If this ever breaks again: `cd ~/sourcelibrary && secret-lover run -- node -e
'process.stdout.write(process.env.GEMINI_API_KEY)'` piped straight into `secret-lover add
GEMINI_API_KEY` from albert's own directory (never echo the value to a terminal line by itself).
Re-run `summarize-chapter.mjs` for a chapter after any content change; re-run `reindex-book.mjs`
after that.

## Working with the Manuscript

**Start here: `scripts/chapter.mjs`.** One command for the whole editing loop, and
it loads `.env.local` itself — no `set -a; source .env.local` dance, no throwaway
`_tmp-*.mjs` scripts (three past sessions hand-rolled those and two got the HTML
parsing subtly wrong).
```bash
node scripts/chapter.mjs status 14              # pending suggestions, comments, git sync, index staleness
node scripts/chapter.mjs read   14 -o draft.txt # live chapter as editable plain text
node scripts/chapter.mjs read   14 --accepted   # preview with all suggestions applied
node scripts/chapter.mjs diff   14 draft.txt    # word-level diff BEFORE proposing anything
node scripts/chapter.mjs suggest 14 draft.txt --reason "..."
node scripts/chapter.mjs reject-all 14          # clear pending, restore the prose exactly
node scripts/chapter.mjs accept-all 14
node scripts/chapter.mjs pull   14              # live chapter -> git manuscript file
```
Takes a chapter number or a document id. `status` is the right first call on any
chapter — it answers "is the DB ahead of git?" which nothing else does.

**The divergence trap `pull` exists for:** the documented flow is git → DB only
(`import-book.mjs`), so anything Albert accepts or types in the browser lives
*only* in Supabase and the next import silently destroys it. After Albert reviews
a chapter, run `pull`, eyeball `git diff --word-diff=color`, and commit — then git
is authoritative again. `pull` refuses while suggestions are unresolved.

**Parsing gotcha, if you ever write your own script:** attribute order on
suggestion marks is not stable. `suggest-chapter.mjs` writes `data-suggest` first;
TipTap re-serializes it *after* `data-sid` as soon as a human opens the chapter in
the browser. Anything anchored on `<span data-suggest=` silently matches nothing on
a chapter someone has looked at. `chapter.mjs` matches the attribute anywhere in
the tag — reuse that, don't re-derive it.

- Chapters are stored as HTML in Supabase, editable via the web editor
- **Never write a chapter's `content` directly with the service role key.** Propose
  edits with `scripts/suggest-chapter.mjs` instead — it diffs a revised draft
  against the live chapter and writes the changes back as pending
  insertion/deletion suggestion marks (rendered inline + in the editor's
  Suggestions panel), not as applied prose. Derek/Albert accept or reject each
  change in the browser. See `notes/tool-research.md` for why.
- **The in-app "AI" panel (`AIPanel.tsx`) follows the same rule.** "Suggest insertion" /
  "Suggest replacement" wrap the AI's output in `suggestionInsert`/`suggestionDelete` marks
  client-side (`Editor.tsx`'s `handleInsert`/`handleReplace`) rather than writing it straight
  into the doc — so a browser-only session (no credentials, no scripts, just the link) can
  still only ever *propose* edits, never apply them silently. Backed by Gemini
  (`gemini-3-flash-preview`) via `/api/ai`, not Claude — the stored `ANTHROPIC_API_KEY` (both
  locally and on Vercel) is dead; don't spend time trying to revive it, just use Gemini like
  everything else here does.
- **Text-in-git is the source of truth.** `manuscript/part{1,2,3,4}/*.txt` — one file per
  chapter (`chNN-slug.txt`) plus a `00-part-opener.txt` per part that has a title/epigraph.
  `scripts/split-manuscript.mjs` regenerates these from Albert's raw `~/Downloads/PART_*.txt`
  drops; `scripts/import-book.mjs --book-id <id> --title "<title>" --confirm` rebuilds
  Supabase FROM these files (dry-run without `--confirm`) — always this direction, git → DB,
  never the reverse. `chapter_number` is the running number across all 4 parts (1–22, not
  reset per part); `part_number` is 1–4.
- Chapter document ids follow the pattern `<book-id>-ch-NN` (zero-padded); part openers are
  `<book-id>-part-N`.

## For Albert (or Albert's Claude Code)
- **Yellow highlighted blocks** (`background: #fef3c7`) are questions/requests for Albert
- **Purple highlighted blocks** (`background: #ede9fe`) are episode questions
- To answer a question: edit the chapter in the web editor, replace the yellow block with your content
- After editing, click "Save version" to create a snapshot before and after changes
- The "History" page shows diffs between any two versions

## Key Commands
```bash
# Split Albert's raw ~/Downloads/PART_*.txt drops into manuscript/part{1-4}/*.txt
node scripts/split-manuscript.mjs

# Rebuild a book in Supabase from the git manuscript/ files (dry run without --confirm)
set -a; source .env.local; set +a
node scripts/import-book.mjs --book-id albert-lin-memoir --title "..." --confirm

# Propose AI edits to a chapter as reviewable suggestions (never overwrites)
set -a; source .env.local; set +a
node scripts/suggest-chapter.mjs --doc albert-lin-memoir-ch-14 revised-ch14.txt --reason "continuity pass"

# Book index (see "Book index" above)
secret-lover run -- node scripts/summarize-chapter.mjs --book albert-lin-memoir --all
secret-lover run -- node scripts/reindex-book.mjs --book albert-lin-memoir

# Type check
npx tsc --noEmit

# Deploy
vercel --prod
```

**After `vercel --prod`, the CLI does NOT re-point the stable production domains**
(`albert-book.vercel.app`, `albert-xi-drab.vercel.app`, `albert-dereklomas-projects.vercel.app`) —
each deploy gets its own fresh `.vercel.app` URL, and the named aliases stay pinned to whatever
they were last explicitly set to. Discovered 2026-09-02 when two deploys in a row silently
never reached the URL Derek actually uses. Always follow a deploy with:
```bash
LATEST="<the production url printed by vercel --prod>"
vercel alias set "$LATEST" albert-book.vercel.app
vercel alias set "$LATEST" albert-xi-drab.vercel.app
vercel alias set "$LATEST" albert-dereklomas-projects.vercel.app
```
Then verify with `vercel inspect albert-book.vercel.app` (check the `created` timestamp is
fresh) — don't just trust the deploy command's "Ready" status.

## Environment
- `.env.local` has Supabase URL, anon key, and service role key
- Never commit secrets

## If you're a different AI session working in this repo
Welcome — this section is for you specifically (Albert's Claude Code, a collaborator's session,
whoever's not Derek's own). The repo is public, so you can clone and read freely. To also
read/write chapters and post comments, you only need **`NEXT_PUBLIC_SUPABASE_URL` +
`NEXT_PUBLIC_SUPABASE_ANON_KEY`** in a `.env.local` — that's the same access level the web app
itself runs on (`src/lib/supabase.ts` never uses anything else client-side), and the RLS
policies on every `albert_*` table are permissive enough for full read/write with just that key.

**Do not use `SUPABASE_SERVICE_ROLE_KEY`, and do not ask Derek for it.** This Supabase project
is shared with `sourcelibrary`, an unrelated production app with real users — the service role
key bypasses RLS entirely and is a master key over *that entire database*, not just this book.
If you're not Derek's own session working directly in this repo with `.env.local` already
present, you don't need it and shouldn't have it.

**Edits go through `scripts/suggest-chapter.mjs`, never a direct `content` write** — see
"Working with the Manuscript" above. This isn't optional: Derek/Albert's whole review workflow
depends on AI edits arriving as reviewable suggestion marks, not applied prose.
