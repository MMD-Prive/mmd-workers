# SĪGIL Renewal Webflow Path

This folder is intentionally non-runtime.

The renewal payment page is production locked to the Cloudflare Worker renderer below:

```text
owner: member-dashboard-chat-worker
renderer: single-renewal-renderer
marker: mmd-renewal-single
```

Do not use Webflow as the runtime source for these routes:

```text
/pay/renewal*
/sigil/pay/renewal*
```

Do not proxy or fallback renewal routes to Webflow. Any UI, copy, CSS, JS, or logic changes must be made only in the canonical worker renderer.

The customer-facing principle for payment proof is:

```text
ส่งหลักฐานไว้ให้ MMD ตรวจรายการได้เลยครับ
สถานะสมาชิกจะอัปเดตหลังยอดจริงถูกตรวจสอบเรียบร้อยแล้ว
```

See:

```text
docs/locks/MMD_SIGIL_RENEWAL_PAGE_LOCK.md
```
