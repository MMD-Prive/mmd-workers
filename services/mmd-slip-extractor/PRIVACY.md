# MMD Slip Extractor Privacy Review

Status: technical privacy review PASS; Cloudflare preview processor/DPA acceptance APPROVED; production approval remains PENDING.

## Data flow and purpose

The preview intake path may send a synthetic or redacted candidate payment image over HTTPS to the dedicated `mmd-slip-extractor-staging` Cloudflare Worker. The Worker authenticates the caller, removes the bearer token, and forwards the image through a Container binding. QR runs first and OCR is an explicit fallback. Responses contain normalized evidence fields only and never a payment decision.

The extractor is not the LINE webhook owner and has no LINE, Airtable, R2, Telegram, payment, member, points, session, or entitlement binding.

## Retention and deletion

The extractor does not persist request images to R2, a database, logs, caches, or durable Container storage. Request buffers exist only for one invocation and become unreachable when it completes. Packaged OCR language models are static software assets and contain no customer data.

Private evidence retention remains the responsibility of the separate intake layer and its dev R2 bucket. The staging extractor itself has no R2 binding.

## Logging and audit

Raw images, OCR text, decoded QR payloads, bearer tokens, and normalized payment fields are not logged. Structured error logs contain only a request ID, route, and stable status. Responses use `cache-control: no-store`.

## Access control and isolation

- Public extraction routes require `MMD_SLIP_EXTRACTOR_TOKEN`, stored only as a Cloudflare secret.
- The Worker compares fixed-length SHA-256 digests and fails closed when the secret is missing or invalid.
- The bearer token and browser identity headers are not forwarded to the Container.
- The Container accepts extraction calls only from the staging edge marker.
- Container outbound internet access is disabled.
- The Worker is staging-only, uses its workers.dev hostname, and has no custom production route.
- The configuration permits one active staging Container instance.

## Secrets

`MMD_SLIP_EXTRACTOR_TOKEN` must be unique to staging. It must never be committed, printed, logged, returned, placed in a command argument, or reused as a LINE, Airtable, Telegram, payment, or internal-worker credential.

## Training and third parties

QR and OCR run locally inside the MMD-controlled Cloudflare Container using `jsQR`, `sharp`, Tesseract.js, and packaged Thai/English language data. Images are not submitted to an OCR vendor, model API, analytics service, training system, or external CDN. Customer images are never used for model training.

## DPA and processor decision

Cloudflare is the approved processor/runtime platform for the locked preview scope. Privacy/DPA for Cloudflare preview is PASS and organizational processor/DPA acceptance is APPROVED. This approval covers only dedicated Cloudflare staging resources with synthetic or redacted data.

Production deployment, customer-data smoke testing, production webhook integration, and production evidence processing remain separately gated and are not authorized by this review.

## Incident response

On suspected token or platform compromise: disable the staging Worker, rotate `MMD_SLIP_EXTRACTOR_TOKEN`, preserve request IDs and Cloudflare audit metadata, review logs without copying image evidence, and keep intake fail-closed in manual review.

## Review conclusion

The Cloudflare staging design passes technical privacy review when deployed with the committed scope lock, packaged language data, outbound internet disabled, body logging disabled, and a staging-only bearer secret. `payments-worker` remains Money Truth. Extraction cannot mark paid or verified, award points, extend membership, confirm sessions, or grant entitlements.
