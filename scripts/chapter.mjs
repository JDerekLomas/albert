#!/usr/bin/env node
/**
 * chapter.mjs — the one command for working on a chapter with someone else.
 *
 * The editing loop has three surfaces that can disagree: the git manuscript
 * (`manuscript/partN/chNN-*.txt`), the live Supabase document Albert edits in
 * the browser, and any pending suggestions sitting on top of that document.
 * Every previous session hand-rolled throwaway scripts to answer "are these
 * three in sync?" and got it wrong in two different ways (attribute order,
 * whitespace). This is that logic, once, tested.
 *
 * Loads .env.local itself — no `set -a; source .env.local; set +a` dance.
 *
 *   node scripts/chapter.mjs status  14         what's pending, what's diverged
 *   node scripts/chapter.mjs read    14         live chapter as plain text
 *   node scripts/chapter.mjs read    14 -o f.txt   ...to a file, ready to edit
 *   node scripts/chapter.mjs diff    14 draft.txt  what a draft would change
 *   node scripts/chapter.mjs suggest 14 draft.txt --reason "..."
 *   node scripts/chapter.mjs reject-all 14      clear pending, restore prose
 *   node scripts/chapter.mjs accept-all 14      apply pending
 *   node scripts/chapter.mjs pull    14         live chapter -> git manuscript
 *
 * `pull` exists because the documented flow is git -> DB only, so anything
 * Albert accepts or types in the browser is invisible to git and would be
 * silently destroyed by the next `import-book.mjs` run. Pull first, commit,
 * then import.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { execFileSync } from "child_process";

const ROOT = resolve(import.meta.dirname, "..");
const BOOK = "albert-lin-memoir";

// ---- env ----------------------------------------------------------------
for (const f of [".env.local", ".env"]) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing Supabase env — expected .env.local with NEXT_PUBLIC_SUPABASE_URL + _ANON_KEY");
  process.exit(1);
}
const db = createClient(URL, KEY);

// ---- html <-> text ------------------------------------------------------

/** Drop <span>s marked as one suggestion type, unwrapping the other.
 *  Attribute order varies: this script writes data-suggest first, TipTap
 *  re-serializes it after data-sid once a human has opened the chapter. Match
 *  the attribute anywhere in the tag or you silently miss every mark. */
function resolveSuggestions(html, keep /* "ins" | "del" */) {
  const drop = keep === "ins" ? "del" : "ins";
  let out = html;
  for (let i = 0; i < 10; i++) {
    const next = out.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/g, (m, attrs, inner) => {
      if (new RegExp(`data-suggest="${drop}"`).test(attrs)) return "";
      if (new RegExp(`data-suggest="${keep}"`).test(attrs)) return inner;
      return m;
    });
    if (next === out) break;
    out = next;
  }
  // Dropping a span can leave its wrapper empty. Rejecting a suggestion that
  // added a whole paragraph leaves <p></p>; leaving those behind means the next
  // suggestion run diffs against empty paragraphs and emits empty del spans.
  out = out.replace(/<(em|strong|i|b)>\s*<\/\1>/g, "");
  out = out.replace(/<(p|h[1-6]|blockquote|li)>\s*<\/\1>\s*/g, "");
  return out;
}

const BLOCK = /<\/?(p|h[1-6]|div|blockquote|li|ul|ol|hr|br)\b[^>]*>/gi;
const ENTITIES = [
  [/&nbsp;/g, " "], [/&amp;/g, "&"], [/&lt;/g, "<"],
  [/&gt;/g, ">"], [/&quot;/g, '"'], [/&#39;/g, "'"],
];
/** Comparable plain text. Block tags become spaces; inline tags vanish, so
 *  "<em>Experience</em>." does not turn into "Experience ." */
function toText(html) {
  let s = html.replace(BLOCK, " ").replace(/<[^>]+>/g, "");
  for (const [re, to] of ENTITIES) s = s.replace(re, to);
  return s.replace(/\s+/g, " ").trim();
}

/** Live HTML -> the plain-text paragraph format the manuscript files use.
 *  view: "original" (what the chapter says now, pending edits rejected),
 *        "accepted" (what it would say with every suggestion accepted),
 *        "raw"      (leave the marks in). */
function htmlToManuscript(html, { view = "original" } = {}) {
  const src =
    view === "raw" ? html : resolveSuggestions(html, view === "accepted" ? "ins" : "del");
  const paras = [];
  const re = /<(p|h[1-4]|blockquote)\b[^>]*>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  let m;
  while ((m = re.exec(src))) {
    if (!m[1]) { paras.push("---"); continue; }
    let inner = m[2]
      .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
      .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
    let t = inner.replace(/<[^>]+>/g, "");
    for (const [rx, to] of ENTITIES) t = t.replace(rx, to);
    t = t.replace(/\s+/g, " ").trim();
    if (m[1].toLowerCase() === "h1") continue; // title lives in the title column
    if (t) paras.push(t);
  }
  return paras.join("\n\n") + "\n";
}

/** Manuscript text -> comparable plain text (markers stripped, like toText). */
function manuscriptToText(raw) {
  return raw
    .replace(/^\s*CHAPTER\s+\d+\s*\n[^\n]*\n/i, "")
    .split(/\n\s*\n+/).map((s) => s.trim()).filter((s) => s && s !== "---")
    .join(" ").replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
}

// ---- locating things ----------------------------------------------------
function manuscriptPath(chapterNumber) {
  for (const part of [1, 2, 3, 4]) {
    const dir = join(ROOT, "manuscript", `part${part}`);
    if (!existsSync(dir)) continue;
    const f = readdirSync(dir).find((n) =>
      new RegExp(`^ch0*${chapterNumber}-`).test(n)
    );
    if (f) return join(dir, f);
  }
  return null;
}

async function getDoc(target) {
  const isNum = /^\d+$/.test(String(target));
  const q = db.from("albert_documents").select("*");
  const { data, error } = isNum
    ? await q.eq("book_id", BOOK).eq("chapter_number", Number(target)).maybeSingle()
    : await q.eq("id", target).maybeSingle();
  if (error) { console.error(error.message); process.exit(1); }
  if (!data) { console.error(`No chapter "${target}" in ${BOOK}`); process.exit(1); }
  return data;
}

function pendingSids(html) {
  const ids = new Set();
  for (const m of html.matchAll(/<span\b[^>]*>/g)) {
    if (!/data-suggest="(ins|del)"/.test(m[0])) continue;
    const sid = m[0].match(/data-sid="([^"]+)"/);
    ids.add(sid ? sid[1] : "unknown");
  }
  return ids;
}

async function writeDoc(doc, html, note) {
  if (note) {
    await db.from("albert_versions").insert({
      document_id: doc.id, content: doc.content, title: doc.title, message: note,
    });
  }
  const { error } = await db
    .from("albert_documents").update({ content: html }).eq("id", doc.id);
  if (error) { console.error(error.message); process.exit(1); }
}

// ---- commands -----------------------------------------------------------
const [cmd, target, ...rest] = process.argv.slice(2);

if (!cmd || !target) {
  console.log(readFileSync(import.meta.filename, "utf8").split("\n").slice(2, 30).join("\n").replace(/^ \* ?/gm, ""));
  process.exit(cmd ? 1 : 0);
}

const doc = await getDoc(target);
const sids = pendingSids(doc.content || "");
const mpath = doc.chapter_number ? manuscriptPath(doc.chapter_number) : null;

switch (cmd) {
  case "status": {
    const live = toText(resolveSuggestions(doc.content, "del"));
    const clean = live.replace(new RegExp(`^${doc.title} `), "");
    const git = mpath ? manuscriptToText(readFileSync(mpath, "utf8")) : null;
    const { count: comments } = await db
      .from("albert_comments").select("*", { count: "exact", head: true })
      .eq("document_id", doc.id).eq("resolved", false);
    const { data: sum } = await db
      .from("albert_chapter_summaries").select("source_updated_at")
      .eq("document_id", doc.id).maybeSingle();

    console.log(`${doc.title}  (${doc.id})`);
    console.log(`  updated        ${doc.updated_at}`);
    console.log(`  words          ${clean.split(" ").length}`);
    console.log(`  suggestions    ${sids.size} pending`);
    console.log(`  comments       ${comments ?? 0} open`);
    console.log(`  manuscript     ${mpath ? mpath.replace(ROOT + "/", "") : "(none)"}`);
    if (git !== null) {
      const same = clean === git;
      console.log(`  git in sync    ${same ? "yes" : "NO — live text differs from the manuscript file"}`);
      if (!same) {
        const A = clean.split(" "), B = git.split(" ");
        let i = 0; while (i < A.length && i < B.length && A[i] === B[i]) i++;
        console.log(`                 first difference at word ${i}:`);
        console.log(`                 live: ${JSON.stringify(A.slice(i, i + 12).join(" "))}`);
        console.log(`                 git : ${JSON.stringify(B.slice(i, i + 12).join(" "))}`);
        console.log(`                 → 'pull' to bring the live text into git`);
      }
    }
    console.log(`  index          ${!sum ? "never built"
      : sum.source_updated_at < doc.updated_at ? "STALE — rerun summarize-chapter.mjs" : "fresh"}`);
    break;
  }

  case "read": {
    const oi = rest.indexOf("-o");
    const out = oi >= 0 ? rest[oi + 1] : null;
    const view = rest.includes("--accepted") ? "accepted"
      : rest.includes("--raw") ? "raw" : "original";
    const text = `CHAPTER ${doc.chapter_number}\n${doc.title.replace(/^Chapter \d+:\s*/, "")}\n\n` +
      htmlToManuscript(doc.content, { view });
    if (sids.size) {
      console.error(`note: ${sids.size} pending suggestion(s); showing the "${view}" view` +
        (view === "original" ? " (--accepted to preview them applied)" : ""));
    }
    if (out) { writeFileSync(out, text); console.log(`wrote ${out}`); }
    else process.stdout.write(text);
    break;
  }

  case "diff": {
    const draft = rest.find((a) => !a.startsWith("-"));
    if (!draft) { console.error("usage: diff <n> <draft.txt>"); process.exit(1); }
    const a = toText(resolveSuggestions(doc.content, "del")).replace(new RegExp(`^${doc.title} `), "");
    const b = manuscriptToText(readFileSync(draft, "utf8"));
    if (a === b) { console.log("No change — draft matches the live chapter."); break; }
    const tmp = join(ROOT, ".chapter-diff-live.txt");
    const tmp2 = join(ROOT, ".chapter-diff-draft.txt");
    writeFileSync(tmp, a.replace(/([.!?]) /g, "$1\n"));
    writeFileSync(tmp2, b.replace(/([.!?]) /g, "$1\n"));
    try {
      execFileSync("git", ["--no-pager", "diff", "--no-index", "--word-diff=color", tmp, tmp2], { stdio: "inherit" });
    } catch { /* git diff exits 1 when files differ */ }
    execFileSync("rm", ["-f", tmp, tmp2]);
    console.log(`\nlive ${a.split(" ").length} words → draft ${b.split(" ").length} words`);
    break;
  }

  case "reject-all":
  case "accept-all": {
    if (!sids.size) { console.log("No pending suggestions."); break; }
    const keep = cmd === "accept-all" ? "ins" : "del";
    const html = resolveSuggestions(doc.content, keep);
    if (/data-suggest/.test(html)) { console.error("marks survived — aborting"); process.exit(1); }
    await writeDoc(doc, html, `${cmd} (${sids.size} suggestions) via chapter.mjs`);
    // Log each resolution so the editor's Resolved history stays complete.
    await db.from("albert_suggestion_log").insert(
      [...sids].map((sid) => ({
        document_id: doc.id, sid, action: cmd === "accept-all" ? "accepted" : "rejected",
        del_text: null, ins_text: null, reason: "bulk via chapter.mjs", author: "claude",
      }))
    );
    console.log(`${cmd}: ${sids.size} suggestion(s) resolved on "${doc.title}".`);
    break;
  }

  case "pull": {
    if (!mpath) { console.error("no manuscript file for this document"); process.exit(1); }
    if (sids.size) {
      console.error(`${sids.size} unresolved suggestion(s) — resolve them first, or you will\n` +
                    `pull a half-reviewed chapter into git. (reject-all / accept-all)`);
      process.exit(1);
    }
    writeFileSync(mpath, htmlToManuscript(doc.content));
    console.log(`pulled live chapter -> ${mpath.replace(ROOT + "/", "")}`);
    console.log("review with: git diff --word-diff=color -- " + mpath.replace(ROOT + "/", ""));
    break;
  }

  case "suggest": {
    const draft = rest.find((a) => !a.startsWith("-"));
    const ri = rest.indexOf("--reason");
    if (!draft) { console.error("usage: suggest <n> <draft.txt> --reason \"...\""); process.exit(1); }
    const args = ["scripts/suggest-chapter.mjs", "--doc", doc.id, resolve(draft)];
    if (ri >= 0) args.push("--reason", rest[ri + 1]);
    try {
      execFileSync("node", args, { cwd: ROOT, stdio: "inherit", env: process.env });
    } catch { process.exit(1); }
    break;
  }

  default:
    console.error(`Unknown command "${cmd}". Try: status read diff suggest reject-all accept-all pull`);
    process.exit(1);
}
