"""pfw-api: the small dynamic half of the personal site.

The site itself is fully static (web/, on Cloudflare Pages); this API exists
so there's a place to put anything a static page can't do later (a contact
form, a guestbook, ...). Today it only answers healthchecks.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

SITE_URL = os.environ.get("PFW_SITE_URL", "https://philipweiss.net")

app = FastAPI(title="pfw-api", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    # localhost for dev; the production domain joins via PFW_SITE_URL once bought
    allow_origins=[o for o in ["http://localhost:4321", SITE_URL] if o],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"service": "pfw-api"}


@app.get("/healthz")
def healthz():
    return {"ok": True}
