## Scope

Follow-up to merged #2992 for the membership recovery release only.

This patch makes the supported full-script PUT path fail closed unless the post-deploy version readback preserves the reviewed bindings, Durable Object class/migration, runtime metadata, and script-level settings. It also refreshes the admin baseline immediately after the member migration deploy to prevent concurrent admin drift.

## Validation

- `node --test scripts/member-pages-recovery-artifact-release.test.mjs scripts/member-pages-recovery-artifact.test.mjs webflow/sigil/member/recovery-liff-resume.test.mjs`
- 17/17 local tests passed.
- No Cloudflare or customer data writes performed.
- Webflow embed staging changes are separate and remain unpublished pending coordinated release.

Production deployment remains gated on this follow-up review and the approved coordinated frontend/backend rollout.
