# Owner Review Gallery · Access Code

**Status: draft code, NOT DEPLOYED.**

The owner requested one convenient place to inspect pages that require login.
This first PR is a secure *synthetic visual review foundation*, not a universal
production login or an actual pixel-accurate rendering of every protected app.
Its route catalog contains 70 candidate paths from Webflow and Worker sources;
the list is not proof that every listed path requires authentication.

## Included

- Dedicated isolated Worker: mmd-owner-review-gallery.malemodel-bkk.workers.dev
- One private Access Code unlocks only this gallery of synthetic examples.
- Six lanes: Internal Admin, MY MMD, MY MODEL, Partner, confirmations/payment, MMS.
- Each route offers normal, empty, loading, error and denied preview states.
- Real-system links still require the normal LINE/admin/signed-link identity.
- All business actions and API connections are disabled.

The content is labelled MOCK / ILLUSTRATIVE ONLY. No personal data, real
sessions, Partner/Model access, payment proof, credentials or bank records are
used. A preview adapter with approved current-source screenshot or offline
render must be added for each page before claiming full visual parity.

## Safety contract

- No Cloudflare routes on mmdbkk.com, no service/database bindings, no database,
  storage, identity connector, scheduled job or live API.
- No way to set production authentication or entitlement with review code.
- Only GET/HEAD plus form POST for unlock/logout. All other writes return 405.
- CSP prohibits scripts, network connections, frames and external form posts.
- 20-minute HMAC-signed session cookie; Secure, HttpOnly, SameSite=Strict.
- Strict hostname; missing config fails closed with HTTP 503.
- Server checks SHA-256 digest of a high-entropy Access Code.
- No code or session token in URLs, logs or browser storage.
- Origin guard on form submissions; security/no-cache/noindex headers.
- Before deploying externally, configure Cloudflare bot/rate limiting for unlock.

## Setup (requires separate owner approval to deploy)

Nothing in this PR automatically publishes or deploys. To deploy this
isolated Worker, review wrangler.toml first and configure TWO DIFFERENT
high-entropy secrets directly in Cloudflare, never in this repository or chat:

1. OWNER_REVIEW_CODE_SHA256: lowercase hex SHA-256 of a fresh random
   24+ character code. The raw code is given to the owner privately.
2. OWNER_REVIEW_SESSION_HMAC_KEY: different random value, 32+ characters.

Generate code locally with a password manager or a cryptographic random source.
Example using Node on a trusted machine:

    node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"

Hash the code locally (do not paste it into terminal history):

    node -e "const c=require('node:crypto');const v=process.env.OWNER_REVIEW_CODE;if(!v||v.length<24)throw Error('missing');console.log(c.createHash('sha256').update(v).digest('hex'))"

Put only the digest and separate HMAC key in Cloudflare Worker secrets.
Never add them to wrangler.toml. Rotating the signing key invalidates all
existing gallery sessions. No production service secrets should be copied.

## Tests

An isolated Cloudflare Rate Limiting API binding protects /unlock (8 requests per 60 seconds, approximate per POP). The deploy entry fails closed if the limiter is not configured. This binding cannot access databases or other production services.\n\nRun from the repository root on Node 22+:

    node --check owner-review-gallery-worker/src/index.mjs
    node --check owner-review-gallery-worker/src/deploy-entry.mjs
    node --check owner-review-gallery-worker/src/ui.mjs
    node --check owner-review-gallery-worker/src/catalog.mjs
    node --test owner-review-gallery-worker/test/*.test.mjs

The tests cover route isolation, code failures, signed cookie tampering,
expiry, CSRF checks, read-only methods, no live APIs, and visual preview states.
PR-only CI never deploys or accesses production services.

## To reach the user's full goal (separate follow-on PRs)

Every app must publish a safe source-backed review artifact derived from
its current code, or an explicitly approved screenshot bundle with redacted
and synthetic content. Do not scrape private routes with service credentials
or rewrite production auth to accept this code.

Priority: Internal Admin / Create Job / Payments; MY MODEL TarT Console;
MY Partner Guided Board; MY MMD LIFF; My MMS / MY Therapist;
role-scoped confirmations and payment flows.

Each adapter must show current UI with synthetic data, no production API,
no write/notification/payment path, and mobile checkpoints 390/430/768/1280px.
Only then upgrade its catalog entry from illustrative_only to
source_backed_preview and claim full visual coverage.

This PR neither changes production login gates nor authenticates a real
role. Actual account E2E testing still uses the original authorized login.

## Rollback

No production routes or data are touched. Stop here without merging/deploying,
or disable only the dedicated staging Worker after an explicitly approved
deployment.
