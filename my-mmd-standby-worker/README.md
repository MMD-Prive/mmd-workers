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

Create a second LIFF app in the existing LINE Login channel `2010862595`:

- Name: `MY MMD Backup`
- Size: `Full`
- Endpoint: `https://www.mmdbkk.com/member/liff-backup`
- Scopes: `openid`, `profile`
- Permanent link pattern: `concat`

Store its public LIFF ID in the GitHub repository variable
`MY_MMD_BACKUP_LIFF_ID`, then manually dispatch
`Deploy MY MMD Standby Worker` with confirmation `DEPLOY`.

Do not create the backup LIFF app in another LINE Login channel. The existing
backend verifies audience `2010862595` and must continue to fail closed for any
other audience.
