# MY THERAPIST profile coordination — draft review

This candidate coordinates profile writes and directory reads per Therapist, uses a durable operation journal and conditional R2 writes, and fails closed on ambiguous Airtable outcomes. **Not approved for merge or deployment.**

- [Airtable outcome/recovery policy](airtable-recovery-policy.md)
- [Binding, migration, activation and rollback plan](binding-migration-release-plan.md)
- [Unapplied proposed configuration diff](binding-migration.proposed.patch)
- [Machine-readable proposal](binding-migration-plan.json)

The actual Worker configuration remains unchanged. The new private binding/migration is not active, and the candidate must not be deployed as-is. Unknown Airtable operations remain quarantined; no provider-evidence verifier, settlement endpoint, force-unlock operation or production data write is introduced.

## Integration baseline

Prepared from main `32f4260760a0a65516ebcbf060986dfa273fc957`. This retains the existing shared 45-zone policy, account-context guard, operator review of unresolved zones, duplicate-zone normalization, no-op storage behavior, schema-before-progress validation and LINE login outage handling. Coordinator revisions replace the existing CAS-only race expectations; the previous two-writer/triple-writer cases remain covered with deterministic serialized-operation regressions.

Only synthetic accounts and storage are used by tests. Config guard validation is proposal-only; CI and local test results do not establish production or authenticated LINE acceptance. The live release workflow runs for relevant main pushes, so merge and deployment approvals must remain separate.

## Validation for this draft candidate

- 247 targeted tests passed, zero failed/skipped, across profile concurrency/contracts/photo validation, zones, frontend identity/auth/progress, and chat directory integration.
- 7 local workerd checks passed using SQLite-backed Durable Objects and R2 with synthetic Airtable interception. Cached Miniflare 4.20260611.0 uses compatibility date 2026-06-11, so this is not production-runtime equivalence with the unchanged 2026-08-21 configuration.
- Backend/frontend bundles and whitespace checks passed. The proposed configuration diff passes check-only application; the active configuration is not edited.
- Real LINE/account acceptance and production source/artifact equivalence remain open. CI status belongs to the PR's exact head commit and is reported separately.
