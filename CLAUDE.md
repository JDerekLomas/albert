@AGENTS.md

# Albert - Book Manuscript Editor

## What This Is
A collaborative manuscript editor for Albert Lin's memoir. The book covers his life as a National Geographic explorer, the search for Genghis Khan's tomb, losing his leg, his Lost Cities TV career, and his son Charlie's TBI recovery.

## Architecture
- **Next.js 16 + TipTap** rich text editor with real-time collaboration
- **Supabase** backend: `albert_documents` (chapters) + `albert_versions` (revision history)
- **Deployed** on Vercel: production deploys from main branch

## Database Schema
- `albert_documents`: id, title, content (HTML), chapter_number, book_id, created_at, updated_at
- `albert_versions`: id, document_id, content, title, message, created_at
- `albert_comments`: id, document_id, content, author, from_pos, to_pos, quote, resolved,
  created_at — **check this actually exists before assuming Comments works.** It didn't for
  a long time (CommentsPanel.tsx queries it, but its migration was never run); SQL is on
  `/setup` if it's missing again. No `status` column exists on `albert_documents` despite
  the `Document` TS type declaring one — don't `select()` it explicitly, use `select("*")`.
- Chapters have `chapter_number` for ordering; notes/planning docs have `chapter_number = null`
- No direct Postgres connection available (no `DATABASE_URL`), only Supabase REST/service-role
  keys — those can't run DDL. Schema changes need Derek to run SQL in the Supabase dashboard
  (link + copyable SQL already on `/setup`, follow that pattern for new tables).

## Working with the Manuscript
- Chapters are stored as HTML in Supabase, editable via the web editor
- **Never write a chapter's `content` directly with the service role key.** Propose
  edits with `scripts/suggest-chapter.mjs` instead — it diffs a revised draft
  against the live chapter and writes the changes back as pending
  insertion/deletion suggestion marks (rendered inline + in the editor's
  Suggestions panel), not as applied prose. Derek/Albert accept or reject each
  change in the browser. See `notes/tool-research.md` for why.
- Chapter IDs follow the pattern `ch-01`, `ch-02`, etc.
- The import script is at `scripts/import-manuscript.mjs`
- Original manuscript text files are in `~/Downloads/block{1,2,3}_chapters_*.txt`

## For Albert (or Albert's Claude Code)
- **Yellow highlighted blocks** (`background: #fef3c7`) are questions/requests for Albert
- **Purple highlighted blocks** (`background: #ede9fe`) are episode questions
- To answer a question: edit the chapter in the web editor, replace the yellow block with your content
- After editing, click "Save version" to create a snapshot before and after changes
- The "History" page shows diffs between any two versions

## Key Commands
```bash
# Import manuscript from text files
set -a; source .env.local; set +a; node scripts/import-manuscript.mjs

# Propose AI edits to a chapter as reviewable suggestions (never overwrites)
set -a; source .env.local; set +a
node scripts/suggest-chapter.mjs --chapter 14 revised-ch14.txt --reason "continuity pass"

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
