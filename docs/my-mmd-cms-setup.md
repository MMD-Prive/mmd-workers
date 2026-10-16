# MY MMD CMS secret setup

1. In repository Settings → Secrets and variables → Actions, add repository secret `WEBFLOW_CMS_TOKEN` with Webflow CMS read permission for the existing site/collection. Never paste the token into chat, PR, workflow inputs or source.
2. Existing `CLOUDFLARE_API_TOKEN` must permit editing the member-pages-worker secret. No token value needs to be read back.
3. After review/merge, run **Configure MY MMD CMS secret** on main. Supply the freshly inspected member-pages-worker version ID as `expected_worker_version` (not a credential).
4. Workflow checks current 100% deployment and Webflow published-items read permission before setting only `WEBFLOW_CMS_TOKEN`. It verifies the binding name/type and prints no credentials. The secret API creates a Worker version; no application source, route or CMS item is deployed/published by this workflow.
5. Full feed acceptance still requires the separate code deployment and authenticated member/browser checks from PR #2446. A successful secret configuration alone does not certify the feed.

The GitHub connector cannot create repository secrets; the single secure secret entry must be completed through GitHub Settings. An unavailable secret is a failed setup, never reported as configured.
