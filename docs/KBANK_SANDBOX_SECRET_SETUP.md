# KBank sandbox credential setup (step 1)

The existing `payments-worker` owns these server-side credentials. `admin-worker` already has a private `PAYMENTS_WORKER` service binding; do not duplicate bank credentials on it or Webflow.

Secret names:
- `KBANK_SANDBOX_CONSUMER_ID`
- `KBANK_SANDBOX_CONSUMER_SECRET`

Run from a current checkout after merging:

```sh
npx --yes wrangler@4 login
python3 scripts/setup-kbank-sandbox-secrets.py
```

Enter freshly generated sandbox credentials at the hidden prompts. Do not paste credentials into chat, GitHub, command arguments, environment files, or Webflow. The helper validates the canonical config, targets the same Cloudflare account as the deploy workflow, checks access before prompting, uploads both values through stdin, and confirms secret names only. It will request explicit REPLACE if either existing sandbox key would be replaced.

Wrangler `secret bulk` updates the deployed Worker's secrets using its existing deployed code. No application source deployment is performed by this helper. If upload succeeds but read-back fails, check Cloudflare before retrying.

This only provisions credentials. It does not implement OAuth, change payment routes, schedule payouts, call a bank API, or enable real transfers. Production credentials require separate names and a separate rollout.
