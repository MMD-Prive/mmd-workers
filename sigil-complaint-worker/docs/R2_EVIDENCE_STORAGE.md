# SIGIL Complaint Evidence R2 Storage

This worker can store raw complaint evidence files in a private Cloudflare R2 bucket when the `SIGIL_COMPLAINT_EVIDENCE_R2` binding is available.

## Bucket

Recommended bucket name:

```bash
wrangler r2 bucket create sigil-complaint-evidence
```

`sigil-complaint-worker/wrangler.toml` includes:

```toml
[[r2_buckets]]
binding = "SIGIL_COMPLAINT_EVIDENCE_R2"
bucket_name = "sigil-complaint-evidence"
```

## Upload path

Uploaded evidence is stored under:

```txt
sigil/complaints/v1/{complaint_id}/{side}/{ordinal}-{fingerprint}.{ext}
```

Examples:

```txt
sigil/complaints/v1/cmp_abc123/client/01-x7ch2p.png
sigil/complaints/v1/cmp_abc123/model/02-p4r9qk.pdf
```

The object key intentionally avoids the original filename where possible. The original filename is stored only in R2 custom metadata and the complaint metadata record.

## Accepted files

The form and worker allow:

- jpg, jpeg, png, webp, gif
- heic, heif
- pdf

Limits:

- 12 files per side
- 24 files total
- 15MB per file

## Response metadata

When R2 is bound and upload succeeds, each evidence item includes:

```json
{
  "name": "chat.png",
  "size": 12345,
  "type": "image/png",
  "extension": "png",
  "storage_status": "stored",
  "storage_provider": "cloudflare_r2",
  "r2_key": "sigil/complaints/v1/cmp_abc123/client/01-x7ch2p.png"
}
```

The complaint evidence summary will include:

```json
{
  "binary_storage": "cloudflare_r2",
  "storage_provider": "cloudflare_r2"
}
```

If the R2 binding is missing, the worker still accepts cases and stores metadata only:

```json
{
  "binary_storage": "metadata_only",
  "storage_provider": "metadata_only"
}
```

## Admin access

Do not expose raw R2 keys publicly. Admin UI should request a short-lived signed URL from an authenticated admin endpoint before showing evidence files.
