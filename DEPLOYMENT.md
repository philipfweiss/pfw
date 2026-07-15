# Deploying the personal site

Same cast as worldfall.ink (see typhon/site/DEPLOYMENT.md for the long-form
explanations). Two deployables:

| piece | host | status |
| ----- | ---- | ------ |
| site (`web/`) | Cloudflare Pages → https://philipweiss.net | Pages project not yet created |
| api (`api/`)  | Fly.io, app `pfw-api` | live at pfw-api.fly.dev |
| domain | philipweiss.net | bought 2026-07-14 |
| code | GitHub | https://github.com/philipfweiss/pfw |

## The site (Cloudflare Pages)

Connect the GitHub repo in Cloudflare → Workers & Pages → Pages → import repo.

- Root directory: `web`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Environment variables: `NODE_VERSION` = `22`

Every push to `main` rebuilds. No content pipeline, no gating — this site is
all public, so the build is just Astro.

## The API (Fly.io)

One-time:

```bash
brew install flyctl   # if needed; already installed for worldfall
fly auth login        # p.f.witt11@gmail.com (same account as worldfall-api)
cd api
fly apps create pfw-api    # if the name is taken, pick another and update fly.toml
fly deploy
```

After that, `cd api && fly deploy` ships changes. The app sleeps when idle
(`min_machines_running = 0`), so it costs ~nothing until it's used.

There are no secrets yet. When the API grows a real feature, set its config with
`fly secrets set -a pfw-api KEY=value` and read it from `os.environ` in main.py.

## The domain (philipweiss.net)

`site` in `web/astro.config.mjs` and the API's CORS default already point at
https://philipweiss.net. Remaining dashboard steps once the Pages project exists:

1. Pages → the project → Custom domains → add `philipweiss.net` and
   `www.philipweiss.net` (HTTPS is automatic).
2. Optional, only when the API grows a real feature — a pretty API hostname:
   `fly certs add api.philipweiss.net -a pfw-api`, then add DNS-only (grey
   cloud) A/AAAA records pointing at the IPs from `fly ips list -a pfw-api`.
