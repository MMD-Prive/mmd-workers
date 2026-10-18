# MY MMD · LIFF Compact Atelier V4 — 2026-10-18

## Incident and actual ownership

Authenticated customer screenshots showed a full-height dark **ENTER →** welcome
and a large **ข้อมูลยังแสดงไม่ครบ** card floating above the Digital Home,
followed by the existing MMD TODAY / tier / MMD NOW / four-item dock.
These exact strings and structures originate from
`member-pages-worker/src/liff-member-shell.js`, served from canonical
`/member/liff?intent=status` via the `member-dashboard-chat-worker`
service binding to `member-pages-worker`. Publishing the Webflow gateway
`/member/dashboard` or merging the Lovable client app branch does **not**
replace the Worker-owned LINE Digital Home.

## Root causes

1. `minimal-member-display` was a root-level sibling **before** the Home
   and outside the `body:not(.app-entered) #profile` privacy/visibility guard.
   Quick membership/history reads unhid it independently, so it could appear
   under ENTER or above the actual member dashboard and repeat expiry.
2. `readQuickMembershipStatus` showed the partial-data card for any readable
   membership expiry even when the complete member home was verified.
3. MMD NOW appeared expanded as an extra tall Home block by default.
4. A timer added fake percentage progress independent of authentication reads.
5. The existing auto-enter decision required a successful profile read.
   A returning, LINE-verified identity with a Worker-confirmed existing
   audience but a temporarily incomplete profile could still show redundant ENTER.

## Changes — scoped presentation, not data/rights

- Retain `data-mmd-liff-digital="v3"` for existing tested contract; add
  `data-mmd-liff-compact="v4"` to signal this release.
- Add a presentation-only CSS source
  `src/liff-member-compact-v4-style.js` loaded **after** existing
  Worker/Lovable design CSS. Midnight Bangkok charcoal/graphite, minimal
  Bangkok architectural line drawing, 520px mobile-first reading column,
  short intro for visitors needing explicit identity action, 44px+ controls,
  safe-area four-tab dock. Signup CSS/behavior remains unchanged.
- Move `minimal-member-display` **inside verified Home** under the
  member snapshot as an accessible native `details`, initially closed.
  Only a trusted history-preview recovery read may reveal it; a standalone
  expiry read cannot. Raw status/diagnostic text is hidden from normal users,
  and verified Points remain strictly the original Worker values.
- Fold MMD NOW into native details while preserving `digital-news-feed` and
  `digital-unread` backend bindings; preserve Needs You, Model/ETA
  authority, approved customer actions, CARE, membership, Kenji and routes.
- For an existing signed-in LINE user with a Worker-verified returning
  audience and a successful `/member/api/liff/start` ID-token preflight,
  allow auto-entry even if the initial complex profile lookup is temporarily
  incomplete. The Worker still performs its normal signed-session boot.
  Do **not** auto-run `liff.login` during the preflight; new/unverified
  visitors still use manual ENTER and the existing handoff.
- Remove the fake progress interval; page-opening milestones now come
  from context, profile and ready-to-enter decisions. Loading progress never
  grants membership or entitlement.
- Hide redundant success app-status text after a verified profile render,
  while letting later failures show their actionable status.

## Release & acceptance

- Code does not touch signup package amount, Payment, Points calculation,
  protected Media, model actions, AIRTABLE keys, LINE credentials, R2,
  LIFF ID or customer identity resolver.
- Run `node --test member-pages-worker/test/liff-member-compact-v4.test.mjs`
  and the existing LIFF, member-session, navigation and My MMD tests.
- Check 320/390/430/1280 widths; native Android/iPhone LIFF signed-in
  returning, unresolved, new and signup paths; no horizontal scroll and no
  extra member floating card on loading/ENTER.
- Webflow requires no further publish to fix the signed-in LINE screen.
  The model/customer app branches are separate.
- Production `member-pages-worker` live version at discovery was
  `a18a4c83-b0df-4d4a-b213-f58763721dd5`; source SHA for that runtime
  was not yet attested. **Do not blindly overwrite an unknown live Worker
  script.** Before deployment, verify exact source and bindings, source SHA,
  test results and other uncommitted live differences. Merge alone is not
  deployment.
- Physical LINE mobile acceptance requires actual authenticated check; do
  not claim it from static headless rendering or synthetic fixtures.

Expected release receipt: PR, CI, deployed script version/source SHA
attestation, live LIFF HTML V4 marker, unchanged signup and APIs, and
an explicit phone-verification state.
