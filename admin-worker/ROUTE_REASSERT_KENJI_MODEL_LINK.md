# Kenji model-link route reassertion

This marker intentionally lives under `admin-worker/**` so a merge retriggers the production admin-worker deploy and the query-safe Kenji route guard.

Canonical owner review route:

- `/internal/admin/kenji?view=model-link`

Required Cloudflare Worker route patterns:

- `mmdbkk.com/internal/admin/kenji*`
- `www.mmdbkk.com/internal/admin/kenji*`

This file has no runtime effect.
