# Manuscript Editor

A collaborative editor for working on a book with other people, built around one rule:
**changes are proposed, then accepted.** A collaborator's editing pass or the AI's rewrite
arrives inline as a suggestion, old text beside new, and nothing is applied until the author
says so. Comments stay attached to the passage they are about. Every version is kept.

Live at https://albert-book.vercel.app. Sign in is a link sent to your email; there are no
passwords. A book is visible only to the people its owner invites (editors change text,
readers only read) or to anyone holding its share link, which can be switched off.

## What it does

- **Bring a manuscript in.** Drop a Word file (or Markdown, or plain text); it is split into
  chapters at your top-level headings, with a preview before anything is written.
- **The book from above.** Every chapter in order, sized by length, with open questions,
  pending suggestions and comments, plus a model verdict per chapter on request.
- **Suggestions, comments, versions.** The three editorial tools, all reviewable, all undoable.
- **Continuity check.** The whole book read at once, looking for places it contradicts itself.

## Stack

Next.js 16, TipTap, Supabase (Postgres + realtime presence), Gemini for the editorial passes,
Resend for email. Deployed on Vercel. The browser talks only to `/api/*`; those routes hold
the database key and enforce membership.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

`db/schema.sql` records the schema additions; the tables the app started with are described
in `CLAUDE.md`, which is also the working guide for anyone (human or AI) editing this codebase.
