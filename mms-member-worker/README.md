# MY MMS customer membership

Native customer accounts for LINE OA **Male Massage (@malemassage)**. This is
MY MMS; staff use MY THERAPIST. It owns a separate SQLite Durable Object namespace
and accepts only the existing MY MMS MINI App channels observed in LINE Console
on 17 October 2026 under provider MMS (`2005499394`).

The owner confirmed Messaging API channel `2011386859` and webhook
`https://mmdbkk.com/webhooks/line/mms`. That is the OA bot channel, not the MINI
App login audience. Therapist MINI App `2011425652-YqK1F6y8` remains separate.

| Stage | Channel | LIFF ID | Endpoint after deployment |
| --- | --- | --- | --- |
| Developing | 2011388355 | 2011388355-vspjKK62 | `https://www.mmdbkk.com/male-massage/member?stage=developing` |
| Review | 2011388356 | 2011388356-D15MQyj9 | `https://www.mmdbkk.com/male-massage/member?stage=review` |
| Published | 2011388357 | 2011388357-ft2o17gf | `https://www.mmdbkk.com/male-massage/member` |

`/male-massage/my-mms` remains the Webflow explanation page. The existing
`/male-massage/member/mms-booking` page remains origin-owned.

## Contract

All APIs below are under `/api/mms/app/membership/`, default to Published, and
accept only an optional `stage=developing|review|published` query. No browser
member ID, email, rename or LINE user ID is accepted as authentication.

| Method | Suffix | Purpose |
| --- | --- | --- |
| GET | config | Public LIFF configuration and account notice version |
| POST | line | Exactly one raw ID/access token, verified directly with LINE |
| GET | me | Session and own account; unregistered LINE session is explicit |
| POST | register | Explicit account acknowledgment + profile; idempotent |
| PUT | profile | Own display name, optional contacts, language, marketing choice |
| POST | logout | Revoke server-side session and expire cookie |

Optional contacts are self-reported and explicitly unverified. Marketing is
optional and off by default. Registering does not charge money or grant paid
entitlements. No MMD membership, payments, points, promotions or history is
copied. Existing customer BFF profile/booking identity now comes from this
Worker; an MMD cookie alone cannot unlock it. Older MMD-based customer account
links need a separately reviewed migration before historical bookings appear.

The client holds LINE tokens only in memory for verification. Storage contains
a stage-separated digest of the verified LINE subject, random account IDs,
profile/notice acknowledgment timestamp, and hashed 8-hour session tokens.
At most 8 device sessions remain per identity. A new login never changes an
existing customer profile. Logout revokes only the current device session.
The Worker uses no LINE channel secret and cannot send LINE messages.

## Validation and release

`npm ci`, `npm run check`, `npm test`, `npx wrangler deploy --dry-run`.
Tests exercise real SQLite for enrollment, persistence, duplicate registration,
logout/expiry, isolation between people/stages/roles, foreign channels, consent,
oversized bodies, and origin/method validation. They mock LINE network results;
they do not prove real-device login.

1. Merge through normal review. The existing member front-gate release first
   tests and deploys the route-free `mms-member-worker` and its own namespace,
   before uploading the gateway's version with the new service binding.
   No existing MMS or MMD Durable Object migration is performed. The standalone
   **MMS customer membership** manual deploy is available for recovery on main.
2. The front-gate release then deploys the gateway from the same source and its
   existing route-sync step adds the membership page/API routes without taking
   over conflicting routes.
3. Anonymous `GET .../me` must return 401; a foreign-origin login POST must return
   403. Native page and config must return 200, without customer data.
4. Set the Developing endpoint shown above in LINE Console. Its existing
   `profile` scope works via verified access tokens; ID tokens are supported
   when available. No additional permissions or channel secret is required.
5. Use an authorized developer LINE account on iPhone/Android: open Developing
   MINI App, enroll with marketing unchecked, edit, reopen, log out. Verify a
   second account cannot see the first. Confirm existing MY THERAPIST and MY MMD
   remain separate. Never create a real customer membership for testing.
6. Keep Review/Published endpoints and the December customer announcement as
   they are until the owner approves the customer launch. Only after acceptance
   configure Review/Published and add the real entry link to Webflow/rich menus.

Production endpoints are still LINE default pages until explicitly configured.
No production deployment or real LINE login is asserted by this source change.
