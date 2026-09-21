# MY MMD LIFF warm standby

This Worker is an independent, dormant customer front door for MY MMD. It does
not duplicate member records, Points, history, tiers, entitlement decisions or
payment truth.

## Standby routes

- `/member/liff-backup` — secondary LIFF shell
- `/member/api/liff-backup/*` — path-mapped canonical LIFF APIs
- `/api/member-backup/app/*` — path-mapped canonical MY MMD reads
- `/v1/member-backup/payments` — customer-safe payment status/history
- `/my-mmd-backup/*` — browser handoff into the secondary LIFF shell
- `/my-mmd-backup/health` — no-PII readiness probe

The secondary shell includes status, tier, Points, package and service history,
payment history, coupons, Public Membership, Private Membership and private
renewal entry points. Membership and payment links stay on their canonical
owners.

## Authority boundary

```text
secondary LIFF / standby routes
-> my-mmd-standby-worker
-> MEMBER_PAGES_WORKER service binding
-> member-pages-worker
-> Airtable / entitlement resolver / payments-worker authority
```

The standby has no Airtable token, payment secret, session secret, KV namespace
or member database of its own. The host-only MY MMD session cookie remains on
`mmdbkk.com` / `www.mmdbkk.com` and is validated only by the canonical backend.

## Deploy prerequisite

The dedicated backup LIFF app is in LINE Login channel `2011691294`:

- Name: `MY MMD Backup`
- Size: `Full`
- LIFF ID: `2011691294-GCxAQ2yW`
- Endpoint: `https://mmdbkk.com/member/liff-backup`
- Scope: `openid` only
- Permanent link: `https://liff.line.me/2011691294-GCxAQ2yW`

`member-pages-worker` verifies the dedicated audience `2011691294` alongside
the fixed CARE BACK and primary Dashboard audiences. Every other audience
continues to fail closed. The standby deploy runs after the production member
backend deploy succeeds; it can also be dispatched manually with `DEPLOY`.
