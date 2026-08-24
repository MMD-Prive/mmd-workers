# MMS Webflow surfaces

Repository-backed source for the MMS customer and therapist journeys embedded in the SĪGIL System Webflow site.

## Routes

- `/therapists` — public service directory and entry point.
- `/member/mms-booking` — authenticated member pre-booking workflow.
- `/apply/mms-therapist` — public therapist application and private file uploads.

## Runtime ownership

- Browser-facing member calls use `/member/api/liff/mms/*`, reusing the existing same-origin LIFF route family.
- `member-dashboard-chat-worker` is the front gate for those paths.
- `member-pages-worker` verifies the rotated LIFF session and injects the trusted member reference.
- `mms-worker` owns catalog, matching, pre-bookings, applications, Airtable coordination, and private R2 uploads.
- Browser code must never call `mms.internal` or submit its own `member_ref`.

## Release order

1. Deploy `mms-worker` if its contract changed.
2. Deploy `member-pages-worker` with the `MMS_WORKER` service binding.
3. Deploy `member-dashboard-chat-worker`; MMS calls reuse its existing `/member/api/liff/*` routes.
4. Publish the staged Webflow pages only after the Workers health and route checks pass.

Pre-booking is request-only. The interface must not imply confirmed availability, payment, or appointment status before MMS coordination.
