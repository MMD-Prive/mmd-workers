# MMD Repository Consolidation

## Canonical workspace

`MMD-Prive/mmd-workers` is the canonical engineering workspace for MMD Privé.

New production code, shared documentation, Webflow integration code, internal tools, API adapters, and deployment configuration should be added here unless there is a documented operational reason to keep a separate repository.

## Target structure

```text
mmd-workers/
├── workers/        Cloudflare Workers and API services
├── apps/           Admin Console and other standalone operator applications
├── webflow/        Webflow HTML, CSS, JS, bridges, and page integrations
├── packages/       Shared JavaScript/TypeScript packages and schemas
├── locales/        TH, EN, ZH, and JP content and translation resources
├── docs/           Architecture, operating rules, migration records
├── scripts/        Maintenance, audit, and deployment utilities
└── archive/        Read-only snapshots from retired repositories
```

## Existing repositories

The following repositories are migration sources and should not receive new production work after their content has been reviewed and imported:

### Personal account: `mmdprive`

- `MMDPrive`
- `mmd-priv-api-hub`
- `MMDAdminConsole`
- `Memberdashboard`
- `mmd-platform`
- `mmd-webflow-ui`
- `mmdprive.github.io`
- `mmdbkk-dummy`
- `mmd-scripts`
- `exclusive-enrollment`
- `BlackCard`
- `model-connect-hub`
- `priv-payment-elite`
- `mmd-priv-confirmation-suite`

The unrelated `linear` mirror is excluded from MMD consolidation.

### Organization: `MMD-Prive`

- `mmd-i18n`
- `demo-repository`

## Migration rules

1. Never overwrite a production worker blindly.
2. Import each source into a dedicated migration branch and pull request.
3. Preserve source commit history when practical. Otherwise record the source repository, source branch, and source commit SHA in the import commit.
4. Keep secrets, `.dev.vars`, tokens, API keys, and private exports out of Git.
5. Preserve current deployment boundaries and Cloudflare Worker names.
6. Treat `t` as the canonical access-token query parameter.
7. Keep Airtable as the back-office source of truth unless an approved architecture decision changes it.
8. Archive or transfer old repositories only after the imported code has passed validation and production references have been updated.

## Initial mapping

| Source repository | Destination |
|---|---|
| `mmdprive/MMDAdminConsole` | `apps/admin-console/` |
| `mmdprive/Memberdashboard` | `apps/member-dashboard/` or the existing member-dashboard worker area after audit |
| `mmdprive/mmd-priv-api-hub` | `workers/api-hub/` or shared API packages after audit |
| `mmdprive/mmd-webflow-ui` | `webflow/` |
| `MMD-Prive/mmd-i18n` | `locales/` and shared locale tooling |
| `mmdprive/mmd-platform` | `docs/architecture/legacy-platform/` after deduplication |
| Prototype and legacy repositories | `archive/<repository-name>/` only when still useful |

## Completion criteria

Consolidation is complete when:

- active production code is maintained from this repository;
- deployment documentation points to this repository;
- duplicate source repositories are archived or clearly marked read-only;
- no production secret has been copied into Git;
- tests and deployment checks pass for every imported component.
