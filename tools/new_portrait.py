#!/usr/bin/env python3
"""Refresh the site's portrait from a new painting.

The site needs two assets in web/public/:
  portrait.jpg        the painting itself, 1000x1000
  portrait-mask.png   its figure/background segmentation, white-on-black

This script takes any square-ish image of the new painting, center-crops it
to a square, resizes to 1000x1000, and regenerates the mask with the same
model the current one came from (u2net_human_seg).

Usage:
  pip install rembg pillow          # one-time; pulls the model on first run
  python3 tools/new_portrait.py path/to/new-painting.jpg

Then eyeball the result: run the dev server and watch a full paint. If the
new painting's scene differs (no pool, different lighting), also revisit
classify() in web/src/scripts/portrait.js, whose color rules decide which
pigment pass paints which region, and the caption/pigment names in planAll().
"""

import sys
from pathlib import Path

try:
    from PIL import Image
    from rembg import new_session, remove
except ImportError:
    sys.exit("needs pillow and rembg:  pip install rembg pillow")

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "web" / "public"
SIZE = 1000


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    img = Image.open(src).convert("RGB")

    # center-crop to square, then the canvas size
    w, h = img.size
    side = min(w, h)
    img = img.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(PUB / "portrait.jpg", quality=85)
    print(f"wrote {PUB / 'portrait.jpg'}")

    # figure/background mask, same model as the original assets
    session = new_session("u2net_human_seg")
    mask = remove(img, session=session, only_mask=True)
    mask = mask.resize((SIZE // 2, SIZE // 2), Image.LANCZOS)  # plenty for the 250px cell grid
    mask.save(PUB / "portrait-mask.png")
    print(f"wrote {PUB / 'portrait-mask.png'}")

    print("\nnext: cd web && npm run dev, watch a full paint, and check the")
    print("region rules in classify() if the scene changed. Then regenerate")
    print("the social card (tools/make_og.mjs) and apple-touch-icon:")
    print("  sips -s format png -z 180 180 web/public/portrait.jpg --out web/public/apple-touch-icon.png")


if __name__ == "__main__":
    main()
