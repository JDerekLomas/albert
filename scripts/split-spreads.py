#!/usr/bin/env python3
"""
Turn photos of an open notebook into clean single-page images.

Each source photo is a hand-held spread: bright paper against a dark table,
with the photographer's fingers at the edges, glare, and some perspective.
This finds the paper, crops to it, splits at the gutter, and lifts the
contrast so the handwriting reads clearly — both for a human viewer and for
transcription.

  python3 scripts/split-spreads.py                      # all spreads
  python3 scripts/split-spreads.py --only IMG_9946      # one, for tuning
  python3 scripts/split-spreads.py --no-enhance         # crop/split only

Output: notebook-photos/pages/IMG_XXXX_L.jpg and _R.jpg
"""
import argparse, os, sys
import numpy as np
from PIL import Image, ImageOps

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "notebook-photos", "jpg")
OUT = os.path.join(ROOT, "notebook-photos", "pages")

# Everything here runs on a lighting-flattened copy of the frame (see flatten),
# because raw brightness is not comparable across these photos: some spreads
# have one page in sun and the facing page in deep shadow.
PAPER_PERCENTILE = 82     # brightness percentile that marks paper vs table
INK_LEVEL = 0.88          # flattened value below which a pixel is ink
MIN_RUN_FRACTION = 0.45   # a paper row/col must be this covered across its span
MARGIN = 0.012            # trim this fraction inward after finding the block


def flatten(gray):
    """Divide out the lighting so shadowed paper reads like sunlit paper.

    Raw brightness is not usable across this set: in some frames one page is
    in full sun and the facing page in shadow, and any absolute or
    max-relative threshold then finds only the lit half.
    """
    h, w = gray.shape
    small = Image.fromarray(gray.astype(np.uint8)).resize(
        (max(1, w // 90), max(1, h // 90)), Image.BILINEAR)
    bg = np.asarray(small.resize((w, h), Image.BILINEAR)).astype(np.float32)
    return gray / np.maximum(bg, 1e-3)


def ink_profile(flat):
    """Per-column amount of handwriting, lighting-independent.

    Ink is what sits well below the local paper level. Counting it per column
    gives a profile that is high over text and near-zero over the fold —
    which is what actually locates the gutter, since the fold itself may be
    dark (shadowed) in one frame and bright (sunlit) in the next.
    """
    return (flat < INK_LEVEL).mean(axis=0)


def _span(profile, lo_pct=1, hi_pct=99):
    on = np.where(profile > MIN_RUN_FRACTION * profile.max())[0]
    if on.size == 0:
        return 0, len(profile)
    # Trim the extreme ends so a bright highlight on the table or a sunlit
    # finger doesn't drag the box outward.
    return int(np.percentile(on, lo_pct)), int(np.percentile(on, hi_pct)) + 1


def paper_bbox(gray):
    """Bounding box of the page block.

    Primary signal is raw brightness: paper is genuinely brighter than the
    table. Note this canNOT be done on the flattened image — flattening
    divides out local lighting, which makes the table look as 'bright' as the
    paper and returns the whole frame.

    Known limitation: on a spread with one page in full sun and the facing
    page in deep shadow, the shadowed half falls below threshold and the box
    collapses onto a single page — roughly 6 of 58 pages here. An ink-extent
    fallback was tried for those and made things worse overall (15 bad), because
    the wood grain of the table registers as ink. Left as-is deliberately: the
    viewer shows whole spreads, so these splits are a convenience, not load-
    bearing. Use --gutter to override a specific frame.
    """
    mask = gray > np.percentile(gray, PAPER_PERCENTILE) * 0.72
    y0, y1 = _span(mask.mean(axis=1))
    x0, x1 = _span(mask.mean(axis=0))
    return x0, y0, x1, y1


def gutter_x(gray, x0, x1):
    """Column of the fold: the emptiest column near the middle.

    Located by absence of ink rather than by darkness — see ink_profile.
    """
    mid = (x0 + x1) // 2
    hw = int((x1 - x0) * 0.18)              # search a band around the centre
    lo, hi = max(x0 + 1, mid - hw), min(x1 - 1, mid + hw)
    if hi <= lo:
        return mid
    h = gray.shape[0]
    # Ignore the top/bottom eighth, where fingers and shadow intrude.
    core = gray[h // 8: h - h // 8, lo:hi]
    prof = ink_profile(flatten(core))
    # Smooth so a single clean column between words doesn't win.
    k = max(3, (hi - lo) // 40)
    prof = np.convolve(prof, np.ones(k) / k, mode="same")
    return lo + int(np.argmin(prof))


def enhance(img):
    """Lift the handwriting off the paper without crushing it to bitonal."""
    g = ImageOps.grayscale(img)
    a = np.asarray(g).astype(np.float32)

    # Flatten uneven lighting: divide by a heavily blurred copy of itself.
    # The blur must stay much coarser than the strokes — at a tight radius the
    # background starts tracking the handwriting itself and cancels it out,
    # which reads as an embossed / relief effect rather than ink on paper.
    bg = np.asarray(g.resize((max(1, g.width // 90), max(1, g.height // 90)),
                             Image.BILINEAR)
                     .resize(g.size, Image.BILINEAR)).astype(np.float32)
    flat = a / np.maximum(bg, 1e-3) * bg.mean()

    # Stretch the ink-to-paper range gently. A hard stretch turns paper grain
    # into speckle that reads as ink, so keep the ends generous and leave
    # headroom at both ends rather than clipping to pure black and white.
    lo, hi = np.percentile(flat, 1), np.percentile(flat, 99)
    out = np.clip((flat - lo) / max(hi - lo, 1e-3), 0, 1)
    out = 0.10 + 0.88 * out
    return Image.fromarray((out * 255).astype(np.uint8))


def process(path, outdir, do_enhance=True):
    # Deliberately NOT exif_transpose. These frames carry EXIF orientation 6
    # (phone held rotated), but the stored pixels already show the spread
    # upright with a vertical gutter. Honouring the tag rotates them into a
    # sideways layout and the gutter detection then splits across the text.
    img = Image.open(path)
    gray = np.asarray(ImageOps.grayscale(img)).astype(np.float32)

    x0, y0, x1, y1 = paper_bbox(gray)
    gx = gutter_x(gray, x0, x1)

    w, h = img.size
    mx, my = int(w * MARGIN), int(h * MARGIN)
    top, bot = max(0, y0 + my), min(h, y1 - my)

    stem = os.path.splitext(os.path.basename(path))[0]
    made = []
    for side, (a, b) in (("L", (max(0, x0 + mx), gx)), ("R", (gx, min(w, x1 - mx)))):
        if b - a < w * 0.12 or bot - top < h * 0.12:
            print(f"  {stem}_{side}: region too small, skipped")
            continue
        # Re-find the paper edge within this half. The spread-wide box is
        # pulled outward by sunlit table beyond the outer edge, so each page
        # needs its own outer bound rather than the shared one.
        half = gray[top:bot, a:b]
        col = (half > np.percentile(half, PAPER_PERCENTILE) * 0.72).mean(axis=0)
        bright = np.where(col > MIN_RUN_FRACTION * col.max())[0]
        if bright.size:
            if side == "L":
                a = a + max(0, int(np.percentile(bright, 0.5)))
            else:
                b = a + min(b - a, int(np.percentile(bright, 99.5)) + 1)
        page = img.crop((a, top, b, bot))
        if do_enhance:
            page = enhance(page)
        dst = os.path.join(outdir, f"{stem}_{side}.jpg")
        page.save(dst, quality=92)
        made.append(os.path.basename(dst))
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=SRC)
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--only", help="process a single stem, e.g. IMG_9946")
    ap.add_argument("--no-enhance", action="store_true")
    a = ap.parse_args()

    os.makedirs(a.out, exist_ok=True)
    files = sorted(f for f in os.listdir(a.src) if f.lower().endswith(".jpg"))
    if a.only:
        files = [f for f in files if f.startswith(a.only)]
    if not files:
        sys.exit("no source images matched")

    total = 0
    for f in files:
        made = process(os.path.join(a.src, f), a.out, not a.no_enhance)
        total += len(made)
        print(f"{f} -> {', '.join(made) if made else '(nothing)'}")
    print(f"\n{total} page images -> {a.out}")


if __name__ == "__main__":
    main()
