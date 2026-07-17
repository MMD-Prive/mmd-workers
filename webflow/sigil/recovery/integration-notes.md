# SIGIL Recovery Room V2

Mobile-first Webflow split code for `/sigil/recovery`.

## Files

- `recovery.html` - paste into Webflow Embed body
- `recovery.css` - paste into Page Settings > Inside Head
- `recovery.js` - paste Before `</body>` or final Embed

## Backend

Default direct worker endpoint:

```text
https://sigil-complaint-worker.malemodel-bkk.workers.dev/member/api/recovery/complaint-evidence
```

The page posts multipart form data to `sigil-complaint-worker`.

Backend flow:

```text
complaint form -> sigil-complaint-worker -> R2 evidence storage -> Google Drive webhook mirror -> telegram-worker /v1/internal/complaint
```

## Production route note

When `sigil.mmdbkk.com/member/api/recovery/complaint-evidence` is routed/proxied to `sigil-complaint-worker`, change the root attribute in `recovery.html`:

```html
data-api-base="https://sigil.mmdbkk.com"
```

and keep:

```html
data-recovery-endpoint="/member/api/recovery/complaint-evidence"
```

## Privacy rule

Do not expose raw R2 keys publicly. Admin evidence viewing must use authenticated admin flow and signed access only.
