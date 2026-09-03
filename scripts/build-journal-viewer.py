#!/usr/bin/env python3
"""
Build the self-contained journal viewer from the transcripts and page photos.

Re-run this whenever a transcript changes; it regenerates the whole page.
Images are embedded as data URIs because a published Artifact is sandboxed
against external hosts, so nothing may be linked.

  python3 scripts/build-journal-viewer.py
  python3 scripts/build-journal-viewer.py --out /tmp/journal.html
"""
import argparse, base64, html, os, re, subprocess, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PHOTOS = os.path.join(ROOT, "notebook-photos")
TRANSCRIPTS = os.path.join(PHOTOS, "transcripts")
SPREADS = os.path.join(PHOTOS, "jpg")

# The opening spread's left page is a contact list — four people's full names,
# home addresses, personal emails and phone numbers. It stays in the on-disk
# transcript (it is Albert's own record) but is withheld from the viewer,
# which is a shareable artifact.
REDACT = {("IMG_9946", "left")}
REDACTION = ("[Withheld from this view: a page of contact details — names, "
             "street addresses, emails and phone numbers for four people. "
             "The full text is in the repository transcript.]")

IMG_PX, IMG_Q = 1500, 55
REDACT_INNER_TRIM = 0.09   # fraction to shave off the gutter edge of a kept half


def capture_time(stem):
    for ext in (".HEIC", ".jpg"):
        p = os.path.join(PHOTOS, stem + ext)
        if os.path.exists(p):
            out = subprocess.run(["sips", "-g", "creation", p],
                                 capture_output=True, text=True).stdout
            m = re.search(r"creation:\s*(.+)", out)
            if m:
                return m.group(1).strip()
    return stem


def parse(path):
    """Split a transcript into its left page, right page and notes."""
    txt = open(path).read()
    out, cur = {"left": "", "right": "", "notes": ""}, None
    for line in txt.splitlines():
        low = line.strip().lower()
        if low.startswith("## "):
            cur = ("left" if "left" in low else
                   "right" if "right" in low else
                   "notes" if "notes" in low else None)
            continue
        if line.startswith("# "):
            continue
        if cur:
            out[cur] += line + "\n"
    return {k: v.strip() for k, v in out.items()}


def render(text):
    """Transcript text -> HTML, keeping the transcriber's uncertainty visible."""
    s = html.escape(text)
    # The transcribers used a couple of inline tags; allow just those two back.
    s = s.replace("&lt;u&gt;", "<u>").replace("&lt;/u&gt;", "</u>")
    s = s.replace("&lt;s&gt;", "<s>").replace("&lt;/s&gt;", "</s>")
    s = re.sub(r"~~(.+?)~~", r"<s>\1</s>", s, flags=re.S)
    # Bracketed editorial marks: [?], [illegible], [sketch: …], [blank page]
    s = re.sub(r"\[(\?|illegible)\]", r'<span class="unread">[\1]</span>', s)
    s = re.sub(r"\[([^\]]{3,})\]", r'<span class="ed">[\1]</span>', s)
    s = re.sub(r"(\w)\[\?\]", r'\1<span class="unread">[?]</span>', s)
    paras = [p for p in re.split(r"\n\s*\n", s) if p.strip()]
    return "\n".join(
        "<p>" + p.strip().replace("\n", "<br>") + "</p>" for p in paras)


def find_date(txt):
    """A date the writer put on the page himself, for the header line."""
    m = re.search(r"\b(\d{2}/\d{2}/\d{2})\b", txt)
    if m:
        return m.group(1)
    m = re.search(r"\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*"
                  r"\.?\s+\d{1,2}(?:st|nd|rd|th)?)", txt)
    return m.group(1) if m else ""


def find_day(txt):
    m = re.search(r"\(\s*Day\s*([0-9IVXl]+)\s*\)", txt, re.I)
    return m.group(1) if m else ""


def img_data_uri(stem, keep_side=None):
    """Embed the spread photo — or, where half the spread is withheld, only
    the page that may be shown. Redacting the transcript while still showing
    a photograph of the same text would achieve nothing."""
    src = os.path.join(SPREADS, stem + ".jpg")
    if keep_side:
        half = os.path.join(PHOTOS, "pages", f"{stem}_{keep_side.upper()}.jpg")
        if not os.path.exists(half):
            return ""          # fail closed: no image beats leaking one
        src = half
    if not os.path.exists(src):
        return ""
    tmp = os.path.join("/tmp", f"_jv_{stem}.jpg")
    subprocess.run(["sips", "-Z", str(IMG_PX), "-s", "formatOptions", str(IMG_Q),
                    src, "--out", tmp], capture_output=True)
    if keep_side:
        # The gutter split lands a little inside the facing page, leaving a
        # readable sliver of it along the inner edge — enough to show the
        # very text being withheld. Trim that edge off.
        im = Image.open(tmp)
        cut = int(im.width * REDACT_INNER_TRIM)
        box = (cut, 0, im.width, im.height) if keep_side.upper() == "R" \
            else (0, 0, im.width - cut, im.height)
        im.crop(box).save(tmp, quality=IMG_Q + 25)
    with open(tmp, "rb") as fh:
        b = fh.read()
    os.remove(tmp)
    return "data:image/jpeg;base64," + base64.b64encode(b).decode()


def build(outpath):
    stems = sorted(f[:-3] for f in os.listdir(TRANSCRIPTS) if f.endswith(".md"))
    if not stems:
        sys.exit("no transcripts yet")
    items = []
    for stem in stems:
        d = parse(os.path.join(TRANSCRIPTS, stem + ".md"))
        redacted = False
        for side in ("left", "right"):
            if (stem, side) in REDACT:
                d[side] = REDACTION
                redacted = True
        if redacted:
            # The transcriber's notes quote the page they annotate — on the
            # contact page they repeat the email domains — so notes travel
            # with the redaction rather than being handled separately.
            d["notes"] = ""
        # Which page survives redaction, if any; drives the image choice below.
        kept = None
        if redacted:
            kept = "R" if (stem, "left") in REDACT else "L"
        both = d["left"] + "\n" + d["right"]
        items.append({
            "stem": stem, "t": capture_time(stem),
            "date": find_date(both), "day": find_day(both),
            "left": render(d["left"]), "right": render(d["right"]),
            "notes": render(d["notes"]) if d["notes"] else "",
            "img": img_data_uri(stem, kept),
        })
    items.sort(key=lambda i: i["t"])

    slides = []
    for n, it in enumerate(items, 1):
        meta = " · ".join(x for x in (
            it["date"] or "undated",
            f"Day {it['day']}" if it["day"] else "",
        ) if x)
        notes = (f'<details class="notes"><summary>Transcriber\'s notes</summary>'
                 f'{it["notes"]}</details>') if it["notes"] else ""
        slides.append(f"""
<section class="spread" id="s{n}" data-n="{n}" data-meta="{html.escape(meta, quote=True)}">
  <div class="marker"><span class="seq">{n:02d}</span><span class="mline"></span>
    <span class="mmeta">{html.escape(meta)}</span></div>
  <figure class="plate">
    <img src="{it['img']}" alt="Photograph of the open journal, spread {n}" loading="lazy">
    <figcaption>{html.escape(it['stem'])}</figcaption>
  </figure>
  <div class="text">
    <div class="page"><h2>Left</h2>{it['left'] or '<p class="ed">[no text]</p>'}</div>
    <div class="page"><h2>Right</h2>{it['right'] or '<p class="ed">[no text]</p>'}</div>
    {notes}
  </div>
</section>""")


    doc = TEMPLATE.replace("{{SLIDES}}", "\n".join(slides)) \
                  .replace("{{COUNT}}", str(len(items)))
    with open(outpath, "w") as fh:
        fh.write(doc)
    mb = os.path.getsize(outpath) / 1e6
    print(f"{len(items)} spreads -> {outpath}  ({mb:.1f} MB)")
    if mb > 15.5:
        print("WARNING: near the 16 MB artifact ceiling; lower IMG_PX or IMG_Q")


TEMPLATE = r"""<title>In Transitory</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<style>
/* Light is the base set; both dark paths below only re-point these tokens. */
:root{
  --ground:#EEF1F5; --surface:#FFFFFF; --plate:#E4E9EF;
  --ink:#141A22; --muted:#5C6B7A; --rule:#CBD5DF;
  --accent:#1B4FA8; --flag:#A6472E;
  --shadow:0 1px 2px rgba(20,26,34,.06),0 8px 24px rgba(20,26,34,.08);
  --mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;
  --serif:"Source Serif 4",Georgia,"Times New Roman",serif;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#0E141B; --surface:#161E27; --plate:#0A0F15;
    --ink:#DCE4EC; --muted:#8496A6; --rule:#2A3745;
    --accent:#6E9BE8; --flag:#D08A6E;
    --shadow:0 1px 2px rgba(0,0,0,.5),0 8px 28px rgba(0,0,0,.45);
  }
}
:root[data-theme="dark"]{
  --ground:#0E141B; --surface:#161E27; --plate:#0A0F15;
  --ink:#DCE4EC; --muted:#8496A6; --rule:#2A3745;
  --accent:#6E9BE8; --flag:#D08A6E;
  --shadow:0 1px 2px rgba(0,0,0,.5),0 8px 28px rgba(0,0,0,.45);
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:var(--serif); line-height:1.6;
  -webkit-font-smoothing:antialiased;
}

/* Transit-board header: the journal is self-timestamped, so the metadata
   line carries real data rather than decoration. */
header{
  position:sticky; top:0; z-index:10;
  display:flex; align-items:center; gap:1.25rem; flex-wrap:wrap;
  padding:.75rem clamp(1rem,3vw,2.5rem);
  background:var(--surface); border-bottom:1px solid var(--rule);
}
.wordmark{font-family:var(--mono); font-weight:600; letter-spacing:.08em;
  text-transform:uppercase; font-size:.8rem; color:var(--accent)}
.sub{font-family:var(--mono); font-size:.75rem; color:var(--muted);
  letter-spacing:.04em}
.spacer{flex:1 1 auto}
nav{display:flex; align-items:center; gap:.5rem}
button{
  font-family:var(--mono); font-size:.78rem; color:var(--ink);
  background:var(--surface); border:1px solid var(--rule); border-radius:2px;
  padding:.4rem .7rem; cursor:pointer;
}
button:hover{border-color:var(--accent); color:var(--accent)}
button:focus-visible{outline:2px solid var(--accent); outline-offset:2px}
#counter{font-family:var(--mono); font-size:.78rem; color:var(--muted);
  font-variant-numeric:tabular-nums; min-width:5.5ch; text-align:center}

/* Reading progress, filling as the page scrolls. */
.rail{position:sticky; top:0; z-index:9; height:2px; background:var(--rule)}
.rail i{display:block; height:100%; width:0; background:var(--accent)}

main{padding:0 clamp(1rem,3vw,2.5rem); max-width:1500px; margin:0 auto}
.spread{display:grid; gap:clamp(1.25rem,3vw,2.5rem);
  grid-template-columns:minmax(0,1.05fr) minmax(0,1fr); align-items:start;
  padding:clamp(2rem,5vw,4rem) 0; border-top:1px solid var(--rule)}
.spread:first-of-type{border-top:0}
@media (max-width:900px){.spread{grid-template-columns:1fr}}

/* Sequence marker: the spreads are one continuous journey, so numbering
   them encodes real order rather than decorating the page. */
.marker{grid-column:1/-1; display:flex; align-items:center; gap:.75rem;
  margin-bottom:.25rem}
.seq{font-family:var(--mono); font-size:.72rem; font-weight:600;
  letter-spacing:.1em; color:var(--accent); font-variant-numeric:tabular-nums}
.mline{flex:0 0 2.5rem; height:1px; background:var(--rule)}
.mmeta{font-family:var(--mono); font-size:.72rem; letter-spacing:.06em;
  color:var(--muted)}

.plate{margin:0; position:sticky; top:4.5rem}
@media (max-width:900px){.plate{position:static}}
.plate img{
  width:100%; height:auto; display:block; border-radius:2px;
  background:var(--plate); box-shadow:var(--shadow); cursor:zoom-in;
}
.plate figcaption{
  margin-top:.6rem; font-family:var(--mono); font-size:.72rem;
  color:var(--muted); letter-spacing:.03em;
}

.text{display:flex; flex-direction:column; gap:1.75rem}
.page{background:var(--surface); border:1px solid var(--rule); border-radius:2px;
  padding:clamp(1rem,2.2vw,1.6rem)}
.page h2{
  margin:0 0 .9rem; font-family:var(--mono); font-size:.7rem; font-weight:600;
  letter-spacing:.14em; text-transform:uppercase; color:var(--muted);
  padding-bottom:.5rem; border-bottom:1px solid var(--rule);
}
.page p{margin:0 0 .85rem; max-width:62ch}
.page p:last-child{margin-bottom:0}
u{text-decoration-thickness:1px; text-underline-offset:2px}
s{color:var(--muted); text-decoration-color:var(--flag)}
.unread{color:var(--flag); font-family:var(--mono); font-size:.85em}
.ed{color:var(--muted); font-style:italic}

.notes{background:var(--surface); border:1px solid var(--rule); border-radius:2px;
  padding:.75rem 1rem}
.notes summary{font-family:var(--mono); font-size:.72rem; letter-spacing:.08em;
  text-transform:uppercase; color:var(--muted); cursor:pointer}
.notes p{margin:.75rem 0 0; font-size:.92rem; color:var(--muted); max-width:62ch}

.legend{max-width:1500px; margin:0 auto; padding:0 clamp(1rem,3vw,2.5rem) 3rem;
  font-family:var(--mono); font-size:.72rem; color:var(--muted); line-height:1.8}
.legend b{color:var(--flag); font-weight:500}

/* Full-bleed zoom for inspecting the handwriting. */
dialog{border:0; padding:0; background:transparent; max-width:96vw; max-height:96vh}
dialog::backdrop{background:rgba(8,12,17,.9)}
dialog img{max-width:96vw; max-height:96vh; width:auto; height:auto;
  border-radius:2px; cursor:zoom-out}

@media (prefers-reduced-motion:no-preference){
  .spread:not([hidden]){animation:in .28s ease-out}
  @keyframes in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
}
</style>

<header>
  <span class="wordmark">In Transitory</span>
  <span class="sub">Albert Lin · journal · Beijing &amp; the trans-Siberian, 2006</span>
  <span class="spacer"></span>
  <span class="sub" id="counter">{{COUNT}} spreads</span>
</header>
<div class="rail"><i id="bar"></i></div>

<main id="main">
{{SLIDES}}
</main>

<p class="legend">
  Transcribed verbatim from photographs of the original notebook — spelling,
  punctuation and grammar are the writer's own.
  <b>[?]</b> marks a word the transcriber could not read with confidence;
  <b>[illegible]</b> a longer unreadable passage; struck-through text is the
  writer's own deletion. Click a page to enlarge it. Arrow keys page through.
</p>

<dialog id="zoom"><img id="zoomimg" alt="Enlarged journal page"></dialog>

<script>
const spreads=[...document.querySelectorAll('.spread')];
const bar=document.getElementById('bar');
const counter=document.getElementById('counter');

// Progress bar + "which spread am I in", both derived from scroll position.
let ticking=false;
function onScroll(){
  const h=document.documentElement;
  const max=h.scrollHeight-h.clientHeight;
  bar.style.width=(max>0 ? (h.scrollTop/max)*100 : 0)+'%';
  const mid=h.scrollTop+h.clientHeight*0.35;
  let n=1;
  for(const s of spreads){ if(s.offsetTop<=mid) n=+s.dataset.n; else break; }
  counter.textContent=n+' / '+spreads.length;
  ticking=false;
}
addEventListener('scroll',()=>{
  if(!ticking){ ticking=true; requestAnimationFrame(onScroll); }
},{passive:true});
onScroll();

const dlg=document.getElementById('zoom'), zi=document.getElementById('zoomimg');
document.getElementById('main').addEventListener('click',e=>{
  const img=e.target.closest('.plate img'); if(!img) return;
  zi.src=img.src; dlg.showModal();
});
dlg.addEventListener('click',()=>dlg.close());
</script>
"""


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(PHOTOS, "in-transitory.html"))
    build(ap.parse_args().out)
