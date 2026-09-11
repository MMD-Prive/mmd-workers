# My MMD canonical truth production refresh — 2026-09-11

Purpose: trigger the canonical `mmd-auth-worker` production deployment after the merged My MMD member-truth repair.

The deployed runtime must include the current backend-only identity and customer truth chain:

- exact verified LINE identity -> canonical Client / Member recovery
- `my_mmd_entitlement_resolver_v1` remains entitlement authority
- canonical Membership tier and lifecycle status
- verified Points balance and dedicated Points ledger history
- verified Client-linked service/payment history fallback
- fail-closed `checking` / 503 behavior for unavailable canonical reads; never fabricate zero balances or grants

This marker does not change customer records, Points, membership, entitlement, or history. Runtime validation remains owned by `.github/workflows/deploy-auth-worker.yml` before deployment.
