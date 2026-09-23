# MMD Admin Namespace and Webflow Inventory

**Date:** 27 July 2026  
**Status:** Migration in progress  
**Tracking:** Issue #219  
**Canonical namespace:** `/internal/admin/*`

## Purpose

This document records the current browser-facing admin inventory across Webflow and Workers. It prevents legacy operator pages from being mistaken for canonical authentication or backend ownership.

## Core rules

```text
GitHub = source of truth
Workers = runtime and authentication authority
R2 = production asset delivery
Webflow = presentation and fallback surface only
```

The only real admin login route is:

```text
/internal/admin/login
```

Session actions remain:

```text
POST /internal/admin/login/session
DELETE /internal/admin/login/session
```

Legacy login routes are redirect-only:

```text
/sigil/admin/login
/sigil/internal/admin/login
/admin/login
```

PR #218 merged the Worker implementation for these login redirects. The merge commit is:

```text
847c6e2ba0cfbf8720ceb2ce4191377e98c06d7b
```

## Canonical Webflow page inventory

The following static pages currently exist under `/internal/admin/*` in Webflow. Their existence does not grant Webflow authentication authority.

```text
/internal/admin/login
/internal/admin/dashboard
/internal/admin/console
/internal/admin/control-room
/internal/admin/kenji-knowledge
/internal/admin/member-intelligence
/internal/admin/membership-access
/internal/admin/access/invite
/internal/admin/jobs/create-session
/internal/admin/jobs/create-job
/internal/admin/jobs/prefill
/internal/admin/owner/setup
/internal/admin/shop-stock-room
/internal/admin/sitemap
/internal/admin/invoice
/internal/admin/line-invoice
```

All listed pages were removed from the generated Webflow sitemap on 27 July 2026.

## Legacy SIGIL admin surfaces

### `/sigil/admin`

Current Webflow state before cleanup:

- Empty page body
- No embed
- No head or footer custom code

Cleanup applied:

- `noindex,nofollow,noarchive`
- Canonical URL points to `/internal/admin/dashboard`
- Webflow fallback bridge redirects to `/internal/admin/dashboard`
- Search and hash are preserved by JavaScript fallback
- Worker redirects remain the preferred runtime behavior

### Routes requiring Worker compatibility decisions

```text
/sigil/admin/dashboard
/sigil/admin/control-room
/sigil/control-room
```

Expected canonical targets where ownership is confirmed:

```text
/sigil/admin/dashboard    -> /internal/admin/dashboard
/sigil/admin/control-room -> /internal/admin/control-room
```

`/sigil/control-room` must be classified before redirecting because it may represent a distinct historical SIGIL operations surface rather than an admin alias.

## CEO operator pages

The following pages exist in Webflow and were removed from the generated sitemap:

```text
/ceo
/ceo/dashboard
/ceo/admin-preview
/ceo/payment-slip-inbox
/ceo/relink-review
/ceo/audience
/ceo/models
/ceo/line-to-telegram-migration
/ceo/telegram-alias
/ceo/telegram-preview
/ceo/telegram-brief
/ceo/line-notes-import
/ceo/kenji-ai
```

These pages must be mapped one by one. They must not be bulk-redirected because some may retain CEO-only operational meaning.

Suggested classifications:

| Legacy route | Candidate canonical route | Status |
|---|---|---|
| `/ceo/dashboard` | `/internal/admin/dashboard` | review |
| `/ceo/admin-preview` | `/internal/admin/dashboard` or archive | review |
| `/ceo/payment-slip-inbox` | `/internal/admin/payments` | canonical page missing |
| `/ceo/relink-review` | `/internal/admin/migration-inbox` | canonical page missing |
| `/ceo/audience` | `/internal/admin/member-intelligence` | review |
| `/ceo/models` | `/internal/admin/models` | canonical page missing |
| `/ceo/line-to-telegram-migration` | `/internal/admin/migration-inbox` | canonical page missing |
| `/ceo/telegram-alias` | `/internal/admin/settings` or migration tools | review |
| `/ceo/telegram-preview` | retain or move under content operations | review |
| `/ceo/telegram-brief` | retain as HYPE operations or move | review |
| `/ceo/line-notes-import` | `/internal/admin/migration-inbox` | canonical page missing |
| `/ceo/kenji-ai` | `/internal/admin/kenji-knowledge` or separate AI console | review |

## Shop admin pages

The following pages exist and were removed from the Webflow sitemap:

```text
/shop/admin/stock
/shop/admin/supplier
```

Do not redirect them until commerce ownership is confirmed. Candidate options:

```text
/internal/admin/shop-stock-room
/internal/admin/shop-suppliers
```

The supplier canonical page does not currently exist.

## Webflow indexing cleanup

On 27 July 2026, `includeInSitemap=false` was applied to:

- 16 canonical `/internal/admin/*` pages
- `/sigil/admin`
- `/shop/admin/stock`
- `/shop/admin/supplier`
- 13 `/ceo/*` pages
- `/sigil/control-room`

Total updated pages: **33**.

This is a staged Webflow change until the site is published.

## Missing canonical pages

The inventory shows likely gaps in the intended internal admin IA:

```text
/internal/admin/payments
/internal/admin/models
/internal/admin/migration-inbox
/internal/admin/settings
/internal/admin/shop-suppliers
```

Do not create these pages solely from route naming. Confirm backend owner, data source, access rules, and page purpose before implementation.

## Migration phases

### Completed

- Canonical login and signed browser session in `admin-worker`
- Legacy login redirect implementation merged through PR #218
- Full Webflow inventory of 261 pages
- Webflow Codexmin route rule created
- Empty `/sigil/admin` fallback bridge prepared
- Internal and legacy operator pages removed from sitemap staging

### Next

1. Implement safe browser redirects for confirmed `/sigil/admin/*` aliases.
2. Classify `/sigil/control-room`.
3. Map each `/ceo/*` page to retain, migrate, archive, or redirect.
4. Classify `/shop/admin/*` ownership.
5. Audit page links and custom code for stale admin paths.
6. Publish Webflow only after checking unrelated staged site changes.
7. Deploy the merged Worker change and run production smoke tests.

## Completion statement

Do not use the following statement until Worker deploy, Webflow publish, link audit, and production smoke tests all pass:

```text
MMD ADMIN NAMESPACE CLEANUP COMPLETE
```
