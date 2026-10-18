@.conventions/CLAUDE.md

# vex-status

status.vexoul.net: service health, uptime, response times and outages, over the API of a Gatus
instance that keeps doing the checks. Published by `publish.yml` to the `deploy` branch.

- Gatus stays unchanged: data comes from its API as it is. Anything missing is a Gatus setting or a
  request there, not scraped or guessed here.
- Dev server (`.claude/launch.json` `status-dev`, :5177) proxies `/api` to the public Gatus;
  `VITE_DEV_GATUS_TARGET` points it elsewhere.
- Controls use the fixed heights (32px / 26px small) and the header stays 48px.
