<!-- conventions:begin: synced from vexouLuna/conventions; edit it there, then run `conventions sync` -->
## What changed

## Checklist
- [ ] The branch is named per [Conventional Branch](../CONTRIBUTING.md#branches) (`feature/`, `bugfix/`, `hotfix/`, `release/`, `chore/`).
- [ ] New behaviour has a test, and docs that describe the changed behaviour are updated in this PR.
- [ ] Nothing synced from vexouLuna/conventions was edited by hand (`.conventions/`, managed blocks).
- [ ] **No private infrastructure**: no machine hostnames, private IPs, server paths, proxy/tunnel config or deploy scripts. Those belong in the private infrastructure repo.
- [ ] No secret values anywhere in the diff, the description or the commit messages.
<!-- conventions:end -->

## vex-status
- [ ] **Mobile has the same functions as desktop.** Checked at ~390px: controls reflow or scroll, nothing is hidden.
- [ ] Controls use the fixed heights (32px / 26px small); the header stays 48px.
- [ ] Images, logos and icons are placeholders until real assets exist.
- [ ] Data comes from Gatus's API as it is; anything missing is a Gatus setting or a request there, not scraped or guessed here.
