# status.vexoul.net

Service health for the vexoul.net sites: whether each service is up, its uptime and response times, and its
outages. Vue 3 + TypeScript on the shared [`@vex/ui`](https://github.com/vexouLuna/vex-ui) design, over the
API of a [Gatus](https://github.com/TwiN/gatus) instance, which keeps doing the checks. It replaces Gatus's own pages.

```bash
npm install
npm run dev         # http://localhost:5177 (proxies /api, see below)
npm run typecheck   # vue-tsc
npm test            # vitest
npm run build       # → dist/
git config core.hooksPath .conventions/githooks   # once per clone: branch-name rules, see CONTRIBUTING.md
```

`main` is merge-only and branches follow [Conventional Branch](https://conventional-branch.github.io/)
(`feature/…`, `bugfix/…`, `hotfix/…`, `release/…`, `chore/…`). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Pages

| path | what |
|---|---|
| `/` | one line for everything, Gatus's announcements, then every service by group: its state, and its uptime, average response and history over 1h / 24h / 7d / 30d (`?period=`). `?show=trouble` lists only the services that aren't plainly up |
| `/endpoints/:key` | one service: uptime and average response for every period, its last 100 checks as a bar and a response-time chart (pick a check to see its conditions and errors), and its outages |
| anything else | 404 |

`/endpoints/:key` is the same path as Gatus's own endpoint pages, so links to those keep working.

Gatus lists services by key, so the order is set here (`groupsOf` in `src/lib/health.ts`): groups `Websites`,
`API`, `Infrastructure`, (casing ignored), then any other group alphabetically; within a group, by where the checked host (the first
result's `hostname`, not the display name) sits in `@vex/ui`'s `SITES`, then by name, with other hosts last.

The front page's bars show the chosen period in slots: 60 × 1 min, 48 × 30 min, 42 × 4 h or 30 × 1 day. A slot is
down when one of Gatus's outages (its UNHEALTHY to HEALTHY events) overlaps it, unstable when a check in it failed
without making an outage (checks are only known for the latest hour or so), and grey from before checking began.

A service is **Down** when its latest check failed, **Unstable** when an earlier check in view failed, **Up**
otherwise. The pages reload every minute while the tab is visible (Gatus checks once a minute); a failed reload
keeps the last answer and says it's stale.

## Gatus, same origin

The site expects to share an origin with Gatus, which keeps serving `/api/*`. It reads:

- `GET /api/v1/endpoints/statuses`: every endpoint with its latest results.
- `GET /api/v1/endpoints/{key}/statuses`: one endpoint's results and events (the outages; the front page asks
  for one result, just for the events).
- `GET /api/v1/endpoints/{key}/uptimes/{1h,24h,7d,30d}` and `…/response-times/…`: the numbers.
- `GET /api/v1/config`: announcements.

Everything else is this site: a single-page app, so the server answers unknown paths with `index.html`. Being one
origin, there's no CORS. Gatus itself is unchanged; anything these pages would need that Gatus doesn't serve is a
Gatus setting (or a question), not something to work out in the browser.

In `npm run dev`, Vite forwards `/api` to `VITE_DEV_GATUS_TARGET` (see `.env.example`), by default the public
status.vexoul.net, so the dev server shows real checks without running Gatus. To use a local Gatus, set it to that
Gatus's address in `.env.local`.

## Publishing

`.github/workflows/publish.yml` builds and pushes `dist/` to the `deploy` branch on every merge to `main`.
`@vex/ui` is pinned to a git tag in `package.json`, and Renovate opens the bumps. The site stays out of the
other sites' navigation (`hidden: true` on its `SITES` entry in `@vex/ui`) until it's live.

## Infrastructure

This repo is host-agnostic: it builds and publishes, nothing more. Details about where or how the site is hosted
(machines, addresses, proxy or tunnel config, server paths, deploy scripts) belong in the private `homelab-docs`
repo and must never be committed here. `.gitignore` blocks `.env*` (except `.env.example`), `*.local.*` and
`/deploy.local/` so local host files can't slip in.

## Assets

No images of its own yet. `public/favicon.ico` is vexoul.net's; the header mark is `@vex/ui`'s placeholder
like the other sites'. Still needed: a status favicon and logo, if it should have its own.
