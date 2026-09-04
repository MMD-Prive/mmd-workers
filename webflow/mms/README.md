# MMS Webflow surfaces

Repository-backed source for the MMS customer and therapist journeys embedded in the SĪGIL System Webflow site.

## Routes

- `/therapists` — public service directory and entry point.
- `/member/mms-booking` — authenticated member pre-booking workflow.
- `/apply/mms-therapist` — public therapist application and private file uploads.
- `/male-massage/therapists/login` — private Therapist access entry; remains fail-closed until the dedicated MMS Therapist LIFF channel and backend gate are enabled.
- `/male-massage/therapists/me` — private Therapist profile/settings destination after verified access.

## Runtime ownership

- Browser-facing member calls use `/member/api/liff/mms/*`, reusing the existing same-origin LIFF route family.
- `member-dashboard-chat-worker` is the front gate for those member/customer paths.
- `member-pages-worker` verifies the rotated member LIFF session and injects the trusted member reference.
- `mms-worker` owns catalog, matching, pre-bookings, applications, Airtable coordination, private R2 uploads, and the dedicated MMS Therapist auth contract.
- Browser code must never call `mms.internal` or submit its own `member_ref`.
- Therapist Login does not use My MMD member LIFF authorization or the MMD Model Dashboard session. Approved Therapist identity is a separate authorization context.

## Release order

1. Deploy `mms-worker` if its contract changed.
2. Deploy `member-pages-worker` with the `MMS_WORKER` service binding when member/customer MMS contracts changed.
3. Deploy `member-dashboard-chat-worker` when member/customer MMS facade routes changed.
4. Publish the staged Webflow pages only after the relevant Worker health and route checks pass.

Pre-booking is request-only. The interface must not imply confirmed availability, payment, or appointment status before MMS coordination.

## `/apply/mms-therapist` canonical source

The application page has one repository-backed implementation. Do not reintroduce the live `mta4a`–`mta4f`, `mta4inject`, or `mta4h1`–`mta4h3` script chain.

| Webflow placement | Canonical file |
| --- | --- |
| Page HTML Embed | `apply-therapist/apply-therapist.html` |
| Page head custom code | `apply-therapist/apply-therapist.css` |
| Before `</body>` custom code | `apply-therapist/apply-therapist.js` |
| Site footer custom code | `../global/mmd-global-typography-voice-contrast.html` |

## `/male-massage/therapists/login` canonical draft source

| Webflow placement | Canonical file |
| --- | --- |
| Page HTML / visual source | `therapist-login/therapist-login.html` |
| Page styling source | `therapist-login/therapist-login.css` |
| LIFF token exchange + readiness gate | `therapist-login/therapist-login.js` |

The login visual uses the approved MMS hero artwork and image-based access card. The visual LINE control has a real accessible hotspot. Source is wired to the dedicated same-origin endpoint `POST /male-massage/therapists/api/auth/line`, but remains disabled while `data-auth-ready="false"` or `data-liff-id` is empty.

When enabled, browser flow is:

1. initialize the dedicated MMS Therapist LIFF channel;
2. request LINE login when needed;
3. obtain only `liff.getIDToken()` in the browser;
4. POST that ID token to the same-origin Therapist auth endpoint with credentials enabled;
5. let `mms-worker` verify the token and issue the role-scoped HttpOnly session;
6. continue only to `/male-massage/therapists/me` after a successful server response.

The browser must not submit `line_user_id`, display name, email, application LINE handle, therapist ID, or member reference as authentication authority. First-link invites, when present, are accepted from the URL fragment and removed from visible browser history before the token exchange.

The page must not simulate a successful login or profile save. Production activation requires the dedicated Therapist LIFF ID, the Worker auth secrets, canonical Therapist auth fields, a reviewed invite/link process, and same-origin routing.

The global footer file contains the corrected background-color counter. It replaces the malformed live postfix expression and must remain the only active Global Voice/Contrast runtime. World-gradient headings opt out with `data-mmd-contrast-skip="world-headline"`.

For a production release, deploy and verify the Worker contract first, stage the Webflow source, then run read-only browser checks before publishing. A real application, Airtable write, R2 upload, Telegram notification, Therapist login activation, or profile mutation requires its own reviewed backend contract.
