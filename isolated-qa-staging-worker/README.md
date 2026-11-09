# Isolated QA staging for Auth, Payment, Kenji and LINE LIFF

Review only. The proposed URL is `https://mmd-isolated-qa-staging.malemodel-bkk.workers.dev/member/liff`. This change creates no remote resource or deployment. Both public Worker hostnames are disabled in the config, and the application stays closed unless `QA_ENABLED=true` is separately configured.

## Bindings for review

| Name | Target / purpose |
| --- | --- |
| `QA_AUTH` | Service binding to `mmd-auth-worker-staging`. Before enabling, read back the deployed Auth configuration and confirm that its `AIRTABLE_HTTP` targets `auth-staging-airtable-fixtures-worker-staging`, its base is `app_auth_staging_fixture`, and reconciliation/notification bindings are absent. |
| `QA_STORAGE` | Private R2 bucket `mmd-isolated-qa-staging`, to be provisioned separately. Holds short-lived opaque QA sessions under `session/` and one synthetic receipt under `payment/`. Configure expiration for `session/` and reset the synthetic payment object between acceptance rounds. |
| `QA_AUTH_RESOLVER_SECRET` | Staging-only secret for the internal member-status resolver. It must match `MEMBER_STATUS_RESOLVER_SECRET` on the verified Auth staging Worker. |
| `QA_LINE_SUBJECT` | Exact verified LINE subject for the one approved test account, stored as a QA secret. The Worker checks it before creating a session and sends only the fixed synthetic LINE ID to Auth. |
| `QA_LINE_CHANNEL_ID`, `QA_LIFF_ID`, `QA_ENABLED` | Dedicated test channel and LIFF public identifiers and explicit enable switch. Leave unset in review. |

The sole external runtime API call is LINE's ID-token verification endpoint. Payment accepts only the provided synthetic file, uses a conditional R2 put for deduplication and exposes status readback. Kenji accepts one exact QA prompt and returns a deterministic fixture reply. These flows cover the browser-to-QA contracts. Production OTP, slip verification, live Kenji generation and messaging are outside this harness.

## LINE input for a later release review

- The public Channel ID of the separate LINE Login test channel and its LIFF ID.
- The LINE provider/channel to verify, an approved test account with Tester access if required, and its verified subject for that same provider. Set the subject directly in QA secret configuration.
- The proposed HTTPS endpoint above and permission to configure it on the **test** LIFF app only. Enable `openid`; profile/email scopes and channel secret are unnecessary for this gateway.
- A tester who can open the LIFF URL inside LINE and complete consent. Keep passwords, OTPs, ID/access tokens and any channel secrets out of GitHub and chat.

Before enabling, verify all deployed binding targets against the QA inventory, configure Cloudflare Access for the approved tester and verify its sign-in flow inside LINE, then open the staging hostname under separate approval. Stop if a host, service, redirect, bucket or LINE channel points to production. Run signed-out denial, LINE login and return to MY MMD QA, Auth fixture read, payment submit/replay/readback, Kenji reply and logout with revoked session. Record the Worker version and preserve evidence without tokens or personal identifiers.

Run locally with `node --test isolated-qa-staging-worker/gateway.test.mjs`. The local test uses an injected LINE verifier and in-memory services. Actual LINE app login, deployed bindings, and R2 behavior require later staging acceptance.
