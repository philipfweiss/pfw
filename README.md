# pfw

Personal website. A watercolor self-portrait paints itself on the left;
who I am and where to find me on the right. Same structure and typographic
hand as worldfall.ink: an Astro static site plus a small FastAPI backend.

```
web/   Astro static site (Cloudflare Pages). The whole site; needs no server.
api/   FastAPI app (Fly.io). Empty shell today — healthcheck only — kept for
       anything a static page can't do later.
```

## Dev

```bash
cd web && npm install && npm run dev     # site on localhost:4321
cd api && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt \
  && .venv/bin/uvicorn main:app --port 8001   # api on localhost:8001
```

## The portrait

`web/public/portrait.jpg` is the painting; `web/public/portrait-mask.png` is its
figure/background segmentation (u2net_human_seg), precomputed. Everything else —
the graphite sketch, the region segmentation, the brush planning — happens in the
browser (`web/src/scripts/portrait.js`). To swap the photo, replace both files
(1000×1000; the mask is white-on-black figure silhouette) and adjust the region
classifier's color rules if the scene changes.

See [DEPLOYMENT.md](DEPLOYMENT.md) for hosting.
