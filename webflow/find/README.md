# /find · Find Your MMD

Status: Webflow source snapshot + UX lock
Updated: 2026-09-19
Webflow page id: `6a8353dd80f489e8f8bd6fca`

## Canonical customer experience
`/find` is the public discovery/request front door.

### Voice
Customer-facing copy uses affirmative Per Voice:
- lead with what the customer can do;
- say what MMD will do next;
- avoid sentence structures led by `ไม่`, `ยังไม่`, `อย่า`, or `ห้าม`;
- validation/error states point to the next useful action in natural Thai.

### Mobile-first
- LINE Seed Sans TH
- compact Hiro hero
- 2×2 service-intent cards on standard mobile widths
- 2×2 duration choices
- full-width thumb-friendly actions
- compact review/success sections
- swipeable 4:3 Bangkok mood rail

### Authority boundary
This page collects preferences only. It must not invent availability, entitlement, booking confirmation, Model confirmation, or payment state. Existing server-side request authority remains unchanged.

## Webflow source files
- `page.html` — primary Find Your MMD embed
- `bangkok-mood.html` — Bangkok mood visual rail
- `head.html` — page-scoped styles including mobile-first V2 contrast layer
- `footer.html` — request-flow runtime and customer-facing validation/status copy
