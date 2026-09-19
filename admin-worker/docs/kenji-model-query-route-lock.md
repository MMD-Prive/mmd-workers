# Kenji Models query-safe route lock

Status: production-verified 2026-09-04.

The Kenji Models admin API uses query parameters for search (`q`, `limit`) and for the admin-only primary-media preview (`preview_model_id`). Cloudflare Workers route matching includes the query string, so the route source must keep query-safe wildcard companions for both hosts:

- `mmdbkk.com/v1/admin/kenji/models*`
- `www.mmdbkk.com/v1/admin/kenji/models*`

Runtime dispatch remains pathname-exact inside `admin-worker`; the wildcard is a Cloudflare ingress compatibility route only. Browser access remains behind the credential-bound admin session gate.

Production smoke requirements:

- unauthenticated query route -> `401 unauthorized`
- authenticated `/internal/admin/kenji` -> `200`
- exact canonical Mek model lookup -> one record
- admin primary-media preview -> `200 image/*`
- preview response -> `Cache-Control: no-store, private`
- unauthenticated preview -> `401`
- browser model payload/UI must not expose raw R2 keys, prefixes, or signed URLs
