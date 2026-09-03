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
- Chapters have `chapter_number` for ordering; notes/planning docs have `chapter_number = null`

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

## Environment
- `.env.local` has Supabase URL, anon key, and service role key
- Never commit secrets
