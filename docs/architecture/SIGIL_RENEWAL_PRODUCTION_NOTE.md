# SIGIL Renewal Production Note

- `/pay/renewal` live depends on `https://sigil.mmdbkk.com/assets/inme/renewal-r6.js`.
- Do not remove or rename this asset route without updating Webflow.
- Renewal proof upload hotfix is production verified on worker version `1a1f19e7-5451-4f87-8627-aeea17a0e87f`.
- Test Airtable inbox record: `recWOYItriR1DBYH4`.
- R2 binding was temporarily removed for deploy because Cloudflare R2 bucket `mmd-sigil-evidence` is not enabled/available yet.
- Follow-up task: enable R2 or create bucket `mmd-sigil-evidence` before turning on recovery evidence upload full mode.
