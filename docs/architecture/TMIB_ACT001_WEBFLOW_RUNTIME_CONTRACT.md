# TMIB ACT 001 Webflow reader runtime contract

The published `/tmib/act-001` page is a public teaser shell plus hidden Long Story reader.

Frontend rules:

- Public images 01-03 may load normally.
- Protected images 04-20 are represented only by `data-frame="04"` ... `data-frame="20"`; no protected Webflow CDN URL is embedded in the page.
- On load the page requests `GET /member/api/liff/tmib/episodes/act-001/access` with same-origin credentials.
- When `granted=true`, the returned `media` map is assigned to the matching protected image elements and all `[data-long-story]` blocks are revealed.
- The returned identity-bound `watermark` is shown in the private reader.
- The 299 THB CTA calls `POST /member/api/liff/tmib/episodes/act-001/purchase`; the browser follows only the backend-provided signed `/pay/checkout?t=...` redirect.
- The frontend does not independently infer membership eligibility or payment completion.
