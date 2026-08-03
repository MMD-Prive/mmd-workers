# MMD Slip Extractor Privacy Review

Status: implementation review PASS; production approval remains an operational gate.

## Data flow and purpose

The authoritative LINE webhook downloads a candidate payment image, stores the original in its existing private evidence bucket, and sends the same bytes over HTTPS to this MMD-controlled extractor. The QR endpoint runs first. The OCR endpoint is called only when QR evidence is insufficient. Responses contain normalized evidence fields only and never a payment decision.

## Retention and deletion

The extractor does not write request images to R2, Netlify Blobs, a database, logs, caches, or application files. Request buffers exist only for one invocation and become unreachable when it completes. Packaged OCR language models are static software assets and contain no customer data. Evidence retention and deletion remain governed by the private intake R2 policy, outside this stateless service.

## Logging and audit

Raw images, OCR text, decoded QR payloads, tokens, and normalized payment fields are not logged. Responses include a request ID for operational correlation. Platform metadata may contain timestamp, route, status, duration, and network-level request metadata, but not application request bodies. Errors are reduced to stable codes.

## Access control and encryption

All extraction routes require a dedicated bearer secret compared through fixed-length SHA-256 digests with timing-safe equality. Health is public and discloses only service status. Netlify terminates HTTPS. The service has no customer identity input and no storage credential. Netlify path rate limits protect extraction cost and abuse; the webhook is the intended caller.

## Secrets

`MMD_SLIP_EXTRACTOR_TOKEN` is stored only as a scoped Netlify secret. It must be distinct between production and preview. It is never committed, documented by value, logged, or returned. Rotation invalidates the previous value and requires updating the webhook adapter context.

## Training and third parties

OCR runs locally inside the MMD-controlled Netlify Function using packaged Tesseract.js engine and Thai/English language data. Images are not submitted to an OCR vendor, model API, training system, analytics service, or CDN. Customer images are never used for model training. Open-source packages are build inputs, not runtime data processors.

## Incident response

On suspected token or platform compromise: disable extractor URLs in the webhook, rotate the extractor token, preserve request IDs and platform audit metadata, review access logs without copying image evidence, and follow the private-evidence incident process. Disabling the adapters leaves intake fail-closed in manual review.

## DPA and subprocessors

Netlify is the hosting subprocessor for transient image processing and must be covered by MMD's applicable service terms/DPA and regional requirements. Cloudflare remains the private evidence-storage subprocessor. No additional OCR data processor is introduced. Legal acceptance of those processor terms is the only non-programmatic privacy approval remaining after technical verification.

## Review conclusion

The implementation matches this document when deployed with packaged language data, body logging disabled, scoped bearer secrets, private intake R2, and the documented limits. Technical privacy review passes. Final organizational/DPA approval cannot be granted by code and remains external.
