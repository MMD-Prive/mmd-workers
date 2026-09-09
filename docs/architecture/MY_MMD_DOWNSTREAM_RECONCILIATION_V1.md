# My MMD Downstream Reconciliation V1

Status: implementation contract.

## Authority

`MMD — Member Entitlements` is resolved by `my_mmd_entitlement_resolver_v1`. The resolver snapshot is the only authorization input for new Telegram or Drive access.

Google Drive and Telegram are downstream enforcement / observation systems. Their existing permissions or room membership never create, upgrade, renew, or reactivate an MMD entitlement.

## Lifecycle

- Active / Expiring Soon: current resolver capabilities may produce downstream grants.
- Grace: existing compatible downstream grants may be retained; no new Drive or Telegram grants are created.
- Expired / Blocked / Suspended / Revoked / unknown: downstream private/protected access is reconciled closed.
- Guest Pass, Public Member and Red Card alone never create private Drive access or protected Telegram room access.

## Drive

Only the known Standard and Premium package folders are managed by this reconciler. Drive permissions are inspected to calculate current state, then changed to match the resolver plan. Legacy Drive-to-membership bootstrap is disabled by default and both caller and auth endpoint fail closed unless an explicit migration-only flag is enabled.

## Telegram

Identity is `telegram_user_id`, not username/display name. Protected room mapping is capability-driven. Black Card maps to the configured Black Room; SVIP maps to the configured Inner Chamber. VIP has no default room ID and fails closed until its room canon/configuration is explicitly approved. No room ID is guessed.

## Reconciliation flow

1. Auth reads canonical entitlement records.
2. Auth runs `resolveMemberEntitlements`.
3. Auth asks Drive/Telegram only to observe current downstream state.
4. Auth builds `my_mmd_downstream_reconciliation_v1`.
5. Auth sends explicit grant/retain/revoke actions to downstream workers.
6. Missing bindings, secrets, identity, or downstream observation fail closed; no inferred entitlement is written.
