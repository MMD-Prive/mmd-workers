# MMD ME Member Dashboard Webflow Assets

Page: `/member/dashboard`

These files are the repo-owned source for the Phase 1 Webflow presentation shell.
Webflow must provide the visual layout and these existing hooks:

- `data-member-summary="tier"`
- `data-member-summary="points"`
- `data-member-summary="history"`

The browser script calls `GET /api/member/dashboard` with only these preserved
query parameters:

- `t`
- `code`
- `promo`
- `source`
- `invite`

Membership, points, and history truth comes from the active member runtime. The
frontend must not unlock membership locally, infer member status, calculate SVIP,
or replace unknown values with `0`.
