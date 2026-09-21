# MY MMD LIFF Standby — 2026-09-21

Status: LIFF CREATED · ACTIVATION REQUIRES DEPLOY + REAL LINE E2E

Owner: Per

## Decision

Maintain a second MY MMD LIFF entry as a warm standby. The standby is a second
front door, not a second source of truth.

The standby must show and preserve:

| Capability | Standby path / owner |
| --- | --- |
| Member status and lifecycle | canonical LIFF profile / Member Resolver |
| Membership Tier | backend-verified profile only |
| Confirmed Points and ledger | canonical member projection |
| Customer-safe history | canonical 360/history projection |
| Package and payment history | canonical member projection / payments BFF |
| Public signup | `/pay/membership` |
| Private signup | `/sigil/member/membership?source=line&intent=signup` |
| Private renewal | `/sigil/member/membership?source=line&intent=renew` |
| Entitlement / Actual Access | `my_mmd_entitlement_resolver_v1` only |
| Money truth | `payments-worker` / Official Verify only |

## Hard locks

1. Airtable remains canonical. Do not create a backup member base.
2. KV remains runtime/cache state only. Do not promote it to membership truth.
3. The standby never calculates Points, Tier, expiry, access or coupon value.
4. The standby never marks a payment paid and never issues entitlement.
5. Public and Private membership remain separate customer lanes.
6. The secondary LIFF app uses the dedicated LINE Login channel `2011691294`.
   The backend allowlist contains this audience plus the fixed CARE BACK and
   primary Dashboard audiences; every other audience must fail closed.
7. Primary routes, Rich Menu and the published primary LIFF ID remain unchanged
   until the standby passes a real-device E2E.

## Activation

1. Merge the standby Worker after CI passes.
2. In LINE Developers, open LINE Login channel `2011691294` and add:
   - name `MY MMD Backup`
   - Full view
   - LIFF ID `2011691294-GCxAQ2yW`
   - endpoint `https://mmdbkk.com/member/liff-backup`
   - scope `openid` only
   - permanent link `https://liff.line.me/2011691294-GCxAQ2yW`
3. Deploy `member-pages-worker` with `LINE_BACKUP_CHANNEL_ID=2011691294`.
4. Deploy `my-mmd-standby-worker` after the backend deploy succeeds.
5. Confirm `/my-mmd-backup/health` is HTTP 200 and reports the unauthenticated
   canonical session boundary as HTTP 401.
6. Run real LINE E2E with at least:
   - active Public member;
   - active Private member;
   - expired member requiring renewal;
   - new/unmatched identity requiring signup or review;
   - VIP/SVIP/Black Card account to prove displayed Tier never grants access.
7. Verify status, Tier, Points, ledger/history, payment history, Public signup,
   Private signup and renewal handoff.

## Break-glass use

When the primary MY MMD presentation/front gate is unavailable but canonical
member services are healthy:

1. Check `https://www.mmdbkk.com/my-mmd-backup/health`.
2. Open the secondary LIFF permanent link returned by LINE Developers.
3. Send that link only as the temporary MY MMD entry.
4. Keep the primary Rich Menu unchanged unless Per explicitly authorizes a
   switch after the real LINE smoke.
5. Return to the primary link after recovery. Keep the standby deployed and
   dormant for the next incident.

If the health endpoint is not green, fail closed. Do not use cached member
values, invent zero Points, infer Tier, or bypass payment/member authority.
