# /member/kenji · NEXT LV — MMD member theme and approved Kenji assets

Date: 2026-11-08 (Asia/Bangkok). Scope: presentation and accessible asset metadata only.

## Route ownership

- **Canonical customer route:** `/member/kenji`, rendered by `member-dashboard-chat-worker/src/kenji-next-lv-page.js` via `kenji-member-app.js`.
- **Member chat:** authenticated same-origin `POST /api/member/kenji/chat` with `{ message }` only; the BFF verifies Member Session before calling AI Worker.
- Webflow page `/member/kenji` is a compatibility Designer/page record; the Worker owns the active app document. Do **not** paste another copy of the chat app into Webflow or initialize duplicate member APIs.
- Webflow is the approved visual-asset source. This update does not change LINE OA reply categories, Kenji knowledge, entitlement, membership, Points, payments or Model/booking authority.

## Webflow assets selected

Site ID: `68f879d546d2f4e2ab186e90`.

| Use | Approved Webflow folder | Asset display name | Asset ID |
| --- | --- | --- | --- |
| Desktop hero | Kenji AI 20 / Concierge | Kenji Alove.webp | `6abd5f961e79f94a6c988e03` |
| Phone hero | Kenji AI 20 / Concierge | Kenji CC 02.webp | `6aa4b6b02b82617e25beaa4c` |
| Kenji chat avatar | Kenji AI 20 / Concierge | Kenji CC 01.webp | `6aa4b6b0c8e3decbef9bbd99` |
| Header mark | MMD Logo | transparent-gold-white-240px.webp | `6aec945d0a09b10a4799ebda` |

Images use Webflow's returned hosted URLs and remain within the existing asset library. Alternative portrait assets are not embedded. The site asset alt text was updated for the selected three portraits and MMD logo.

## MMD member-world design

- Member app atmosphere: matte charcoal + champagne + ivory, with restrained MMD burgundy `#A21E39`; not a SIGIL-only black/gold private page.
- Small official MMD logo (not recreated as text), unobtrusive Kenji title, one editorial portrait per breakpoint.
- Compact first viewport with two interaction modes: Q&A and promotions. Prompts **prefill** only; a dedicated send is required.
- No unsupported current promotion claims. The promotion tab navigates to verified MY MMD Coupons.
- Mobile phone hero uses a different approved portrait from desktop; chat input respects safe-area padding. Existing reduced-motion, accessible labels, local ephemeral message display and same-origin action validation remain.
- Replaced compatibility `/member/my-mmd` presentation links with canonical `/my-mmd/` links.

## CSP and regression

- CSP stays nonced for inline `style` and `script`, and keeps `connect-src 'self'`.
- `img-src` additionally allows `https://s3.amazonaws.com`, the exact origin of Webflow's `hostedUrl` responses. No new browser API authority or external data transport.
- Focused tests: `node --test member-dashboard-chat-worker/test/kenji-member-app.test.mjs`.
- Before production release, review responsive screenshots on iPhone-class widths and desktop, verify the four hosted assets load, and perform authenticated member chat and session-expired checks. Updating code in GitHub is **not** evidence that Cloudflare Worker was deployed.

## Deployment gate

Do not merge or deploy any customer-facing production change solely because the asset metadata update succeeded. PR review and current member-route acceptance remain separate from Webflow asset changes.
