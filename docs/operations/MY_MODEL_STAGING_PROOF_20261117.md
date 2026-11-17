# MY MODEL staging proof — 17 Nov 2026

This branch adds evidence automation only. It does not deploy or change MY MODEL production.

Source owner:
- `model-dashboard-presentation-worker`
- canonical production route: `/sigil/model/dashboard`
- model identity remains separate from MY MMD member identity.

Proof method:
- existing `scripts/preview-model-lv15.mjs`
- local loopback only
- `fixture_state=auth` (401/session-required), never confirmed/en-route
- preview blocks external API calls and credentials
- 390px TH + EN captures for HOME, JOBS, YOU, PROFILE, AVAILABILITY
- production request count must remain zero.

No model action, acknowledgement, availability update, payout, media write or production request is allowed by this proof branch.
