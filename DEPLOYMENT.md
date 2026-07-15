# Deploying the personal site

Same cast as worldfall.ink (see typhon/site/DEPLOYMENT.md for the long-form
explanations). Two deployables:

| piece | host | status |
| ----- | ---- | ------ |
| site (`web/`) | Cloudflare Pages, project `philipweiss` | live at https://philipweiss.pages.dev |
| custom domain | philipweiss.net + www | attached, pending the DNS records (below) |
| api (`api/`)  | Fly.io, app `philipweiss-api` | live at philipweiss-api.fly.dev |
| domain | philipweiss.net | Cloudflare Registrar, zone active, bought 2026-07-14 |
| code | GitHub | https://github.com/philipfweiss/pfw |

## The site (Cloudflare Pages)

The project was created by **direct upload** with wrangler (not the
git-connected build), so shipping a change is:

```bash
cd web
npm run build
npx wrangler pages deploy dist --project-name=philipweiss --branch=main
```

Wrangler is authenticated as p.f.witt11@gmail.com (same Cloudflare account as
worldfall). If deploys should instead happen automatically on every push to
`main`, either reconnect the project to the GitHub repo in the dashboard
(Workers & Pages → philipweiss → Settings → Builds; root `web`, build
`npm ci && npm run build`, output `dist`, `NODE_VERSION=22`) or add a GitHub
Action running the wrangler deploy with a `CLOUDFLARE_API_TOKEN` secret.

## The API (Fly.io)

`pfw-api` was taken, so the app is `philipweiss-api` (fly.toml agrees).
Deploys: `cd api && fly deploy`. The app sleeps when idle
(`min_machines_running = 0`), so it costs ~nothing until it's used.

There are no secrets yet. When the API grows a real feature, set its config with
`fly secrets set -a philipweiss-api KEY=value` and read it from `os.environ`.

## The domain (philipweiss.net)

`site` in `web/astro.config.mjs` and the API's CORS default already point at
https://philipweiss.net. Both `philipweiss.net` and `www.philipweiss.net` are
attached to the Pages project (done via API, 2026-07-15) but sit **pending**
until the zone has DNS records pointing at the project. The wrangler OAuth
token cannot write DNS, so this is the one remaining dashboard step:

1. Cloudflare dashboard → the `philipweiss.net` zone → **DNS** → add two
   records, both Proxied (orange cloud):
   - `CNAME` `philipweiss.net` → `philipweiss.pages.dev`
   - `CNAME` `www` → `philipweiss.pages.dev`
   (Or: Workers & Pages → philipweiss → Custom domains, where the pending
   entries offer to create these records with one click.)
2. HTTPS is automatic once the records exist; the pending domains flip to
   active on their own within minutes.
3. Optional, only when the API grows a real feature — a pretty API hostname:
   `fly certs add api.philipweiss.net -a philipweiss-api`, then add DNS-only
   (grey cloud) A/AAAA records pointing at the IPs from
   `fly ips list -a philipweiss-api`.

## The autoportrait playground (philipweiss.net/autoportrait)

The playground from github.com/philipfweiss/autoportrait is hosted as static
files under `web/public/autoportrait/`. To refresh it after engine changes:

```bash
cd ../autoportrait
BASE_PATH=/autoportrait/ npm run build
rm -rf ../pfw/web/public/autoportrait
cp -R demo/dist ../pfw/web/public/autoportrait
cd ../pfw/web && npm run build
npx wrangler pages deploy dist --project-name=philipweiss --branch=main
```

The site's security headers (including the CSP) apply to it; the playground
ships no inline scripts, so it runs clean under script-src 'self'.
