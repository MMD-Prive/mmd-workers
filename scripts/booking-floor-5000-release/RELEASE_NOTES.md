# SIGIL Public floor 5,000: offline candidate (not deployed)

Scope: make the deployed `sigil-booking-worker` enforce the decided Curated (Public) minimum budget of **5,000 THB**. Source on `main` already says 5,000 (#3087); the deployed bundle still says 4,500.

## What this directory is

- `build-floor-overlay.mjs`: pure, offline string patch of the **exact deployed bytes**. No network, no Cloudflare calls, no repository entrypoint rebuild.
- `build-floor-overlay.test.mjs`: fixture tests (always run) and integration tests against the real deployed bytes (run when `SIGIL_BASELINE` points at them).

## Pins

| | sha256 | bytes |
|---|---|---|
| Deployed baseline (`sigil-booking-worker` / `runtime-index.js`) | `4ce2dd1c1573fa1d5babced3764b1c5c7c77e024c24303b7ba9534fd3f5b19b0` | 239064 |
| Candidate | `cc092790b18521a8ee78c08ddd29134b8a9050a07a0026ed85bf67f69ac64b68` | see proof |

The baseline hash is the `booking-identity-release` SIGIL candidate hash, read back from the live Worker on 2026-11-06 (read-only). The builder refuses any other input and refuses to emit any other candidate hash.

## The whole delta (2 lines)

1. `var PUBLIC_MODEL_MIN_BUDGET_THB = 4500;` -> `5000`
2. Legacy `4500_10000` / `4_5_10` / `4_5k_10k` band tokens (cached clients) now return `min_thb: 5e3`, label `5000_10000` instead of a 4,500 minimum. They are still accepted, not rejected.

Every other byte is identical; the builder proves the candidate reverses exactly to the baseline. `publicBudgetFloorError` is shared by public search and public intake, so both pick up the new floor.

## Reproduce

```
node scripts/booking-floor-5000-release/build-floor-overlay.mjs --baseline <deployed runtime-index.js> --output-dir <dir outside the repo>
SIGIL_BASELINE=<deployed runtime-index.js> node --test scripts/booking-floor-5000-release/build-floor-overlay.test.mjs
```

Compiled-candidate behaviour checked on public search: 4,499 / 4,500 / 4,999 / `under_10000` are rejected with `public_budget_below_minimum` and cause no Airtable read; 5,000, `5000_10000`, legacy `4500_10000` and `10000_20000` are accepted. Intake sits behind the member login in the deployed bundle, so it was not exercised on the compiled bytes.

## Release path (written, never run)

Same safety model as `scripts/booking-identity-release`, SIGIL only (`member-pages-worker` is not touched). The workflow `.github/workflows/deploy-sigil-public-floor-5000.yml` is dispatch-only and runs only for the owner on `main`, first attempt, exact SHA, behind the existing protected environment `member-pages-code-only-owner`.

1. **Capture (read-only).** Dispatch with `mode=capture`. It verifies the owner gates, reads the live Worker through a GET allowlist, checks the live module is exactly the pinned baseline, and prints the live version id, deployment id and configuration fingerprint. No writes.
2. **Seal (a separate PR).** The owner copies those values into `floor-release-contract.json` together with `approval_ref_sha256` (the sha256 of the owner approval reference; the reference itself is not stored). Until all four fields are filled the contract is unsealed and `release` fails closed before any request.
3. **Release.** Dispatch with `mode=release`. Fresh owner approval, offline tests, read-only baseline fetch (re-verified against the sealed values), offline build, candidate tests against the exact baseline bytes, then one strict-inherit version upload, readback, and one 100% deployment, each write preceded by its own fresh owner gate and journalled first. No PUT, migration, settings change, retry or rollback; an uncertain outcome stops.

Transport is allowlisted: GET on this Worker's snapshot endpoints, POST `versions?bindings_inherit=strict` and POST `deployments` on this Worker only.

Tested only against in-memory fakes of the Cloudflare and GitHub APIs. It has never run against either service. The first real use is the read-only capture.

## Not included

- `member-pages-worker` is untouched; older release tooling is unchanged.
- The sealed values, which only a real capture can provide.

## Before anyone releases this

- Decide the NIGHT OUT 3h package (shown at 4,500): once live, a 4,500 budget is rejected.
- Publish the Webflow booking pages separately (they still show 4,500 until published from `main`).
