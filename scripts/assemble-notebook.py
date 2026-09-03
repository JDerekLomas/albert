#!/usr/bin/env python3
"""
Stitch the per-spread notebook transcripts into one chronological document.

Each transcript in notebook-photos/transcripts/IMG_XXXX.md covers one photographed
two-page spread. This orders them by the photo's EXIF capture time (the order the
pages were shot, which is the order they appear in the notebook), and emits a
single markdown file for use as memoir source material.

  python3 scripts/assemble-notebook.py
  python3 scripts/assemble-notebook.py --out /tmp/journal.md
"""
import argparse, os, re, subprocess, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PHOTOS = os.path.join(ROOT, "notebook-photos")
TRANSCRIPTS = os.path.join(PHOTOS, "transcripts")


def capture_time(stem):
    """EXIF capture time for a spread, via sips. Falls back to filename order."""
    for ext in (".HEIC", ".jpg"):
        p = os.path.join(PHOTOS, stem + ext)
        if os.path.exists(p):
            try:
                out = subprocess.run(["sips", "-g", "creation", p],
                                     capture_output=True, text=True, timeout=20).stdout
                m = re.search(r"creation:\s*(.+)", out)
                if m:
                    return m.group(1).strip()
            except Exception:
                pass
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(PHOTOS, "journal-transcript.md"))
    a = ap.parse_args()

    if not os.path.isdir(TRANSCRIPTS):
        sys.exit(f"no transcripts at {TRANSCRIPTS}")
    files = sorted(f for f in os.listdir(TRANSCRIPTS) if f.endswith(".md")
                   and f != os.path.basename(a.out))
    if not files:
        sys.exit("no transcript files found")

    rows = []
    for f in files:
        stem = f[:-3]
        rows.append((capture_time(stem) or stem, stem,
                     open(os.path.join(TRANSCRIPTS, f)).read().strip()))
    rows.sort(key=lambda r: r[0])

    parts = [
        "# Albert Lin — handwritten journal",
        "",
        "Transcribed from photographs of the original notebook. Each section below is "
        "one photographed two-page spread, ordered by the time the photo was taken — "
        "which is the order the pages were turned.",
        "",
        "`[?]` marks a word the transcriber could not read with confidence; "
        "`[illegible]` marks a longer unreadable stretch. Spelling, punctuation and "
        "grammar are the writer's own and have not been corrected.",
        "",
        f"{len(rows)} spreads. Source images: `notebook-photos/`.",
        "",
        "---",
        "",
    ]
    for ts, stem, body in rows:
        parts.append(f"<!-- {stem} — photographed {ts} -->")
        parts.append("")
        parts.append(body)
        parts.append("")
        parts.append("---")
        parts.append("")

    with open(a.out, "w") as fh:
        fh.write("\n".join(parts))

    words = sum(len(b.split()) for _, _, b in rows)
    print(f"assembled {len(rows)} spreads (~{words:,} words) -> {a.out}")


if __name__ == "__main__":
    main()
