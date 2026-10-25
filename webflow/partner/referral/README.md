# Partner introduction / referral — LV15

Mobile-first source for `/partner/referral`, built on 25 October 2026. This is a Webflow page rebuild with a local LINE message composer. It does not create Partner records or send messages.

## Page ownership and placement

| Page | Intended reader | Purpose |
| --- | --- | --- |
| `/partner/referral` | A person introducing a model, a model manager, scout, or modeling agency | Explain the relationship, MMD reference compensation, responsibilities, and how to start a conversation with Per. |
| `/partner/model/recommend-model` | A model personally recommending a friend/model | The separate consent-led personal introduction, with its existing application flow. |
| `/partner/model/recommend-model/fee` | The seven introducer roles comparing compensation | The detailed reference matrix for compensation paid to introducers/Partners. |
| `/partner/model` | An outside manager/agency managing multiple models | Overview of roster, agreements, rates, work, and the Partner workspace. |
| `/partner/terms` | A Partner agreeing responsibilities and financial terms | The established authenticated agreement flow. |
| `/partner/apply?partner_type=modeling` | A prospective model-related Partner | The real Modeling Partner intake. |

The existing intake's `client_referral` lane means introducing clients. A customer who introduces a model still belongs in the modeling lane. The intake currently reads `partner_type`/`lane`, not `intent=recommend-model`.

## Confirmed reference rates

The source is the user's shared conversation, its later implementation/publication approvals, and the current published fee/Terms pages. These are **MMD reference ranges**, not a verified international tariff or an automatic entitlement.

| Tier | One-time consented introduction | Bridge with agreed ongoing duties |
| --- | --- | --- |
| Standard | ฿500–1,500 | 5–7% |
| Premium | ฿1,500–3,000 | 5–7% |
| GWs | Individual agreement | 5–10% |
| EMs | ฿3,000–5,000 or individual agreement | 5–10% |
| Secretive | Individual agreement | Individual agreement |

Actual rate, payment base, duties, eligible jobs/time window, and payment conditions must be confirmed in Agreement / MY Partner. The page does not calculate a payable amount.

Three collaboration structures remain distinct: Bridge, one bundled Co-Partner quote, and project-specific Profit Share. A one-time Direct Contact introduction is an additional choice. No fixed Co-Partner or Profit Share percentage is invented.

Public/Private are work types. Standard/Premium/GWs/EMs/Secretive are model tiers. Exclusive in the supplied policy means confidential handling, especially for GWs/EMs; it does not impose exclusive employment or representation.

The friend exception retains the first three qualifying jobs. The exact friend percentage and detailed deduction formula are left to the confirmed agreement rather than resolving differences between earlier drafts and the current fee page. No automatic 12-month entitlement is added.

### Confirmed owner context: model quotes and MMD Agency Fee

On 25 October 2026, the owner clarified that the previous Management table's large amounts are **model rates**. The original four Partner relationship types are confirmed: Management Partner, Contact Provider, Personal Referral, and High-profile Referral. They are presented in a compact disclosure, separately from the Direct Contact, Bridge, Co-Partner and Profit Share compensation choices and the seven possible introducer roles. High-profile handling can overlap other relationships.

The owner further explained that a Partner commonly includes their own compensation in the quoted model rate. For this arrangement, the public draft calls that quote **Model + Partner** and makes clear that the Partner and model agree their internal split. The agreed **MMD Agency Fee is retained by MMD**; it is not divided with the same Partner again. This describes the commercial arrangement without claiming corporate accounting net profit or inventing a percentage denominator.

The reference matrix is explicitly scoped to separately agreed one-time introduction or Bridge compensation. Co-Partner copy and the money FAQ distinguish the bundled quote, any separately agreed introduction payment, and MMD's Agency Fee, so the same Partner duties are not counted twice. Standalone Direct Contact, Bridge, and project-specific Profit Share remain valid separate arrangements.

The owner supplied internal pricing targets. They are not a public Partner tariff or a new automatic payout rule, so this page and its dictionary do not display those targets. Per-job amounts and scope continue to be agreed in writing. No calculator, fixed allocation across Partner types, or legacy tier-to-MMD-percentage mapping is introduced. The earlier numeric Management table remains in `original-webflow.json` as historical rollback content, not the current published pricing policy.

The previous valid-contact/onboarding/commission-share table is superseded in this draft by the later tier matrix above. Internal EMs job margins used during the historical discussion are not included in the page.

## Files and rebuild

- `referral.html`: Webflow HTML Embed.
- `referral.css`: page-scoped styles and final font/contrast guards.
- `referral.js`: accessible tabs, motion, loading progress, safe draft preparation and LINE handoff.
- `page-head.html`, `page-footer.html`: generated Webflow code blocks.
- `preview.html`: generated preview with inline page CSS/JS and existing asset URLs.
- `sync-derived.mjs`: rebuilds the three derived files.
- `original-webflow.json`: exact pre-edit Embed/Head/Footer rollback snapshot.
- `verification.json`: completed checks and their limits.

Run `node sync-derived.mjs` after editing source. Run `node sync-derived.mjs --check` to detect stale derived blocks. Thai strings are stored additively in the companion `MMD-Prive/mmd-i18n` change under `partner.referral.*`; HTML and runtime fallbacks work while that change is pending. The site retains its existing canonical i18n runtime.

## Preserved contracts

- Site `68f879d546d2f4e2ab186e90`, page `6a6affbb7583793304d749de`.
- Embed element `85f4da82-eac7-ebd5-4665-9a6b96eb2c05`.
- Root `mmd-referral-v7`, marked `data-referral-version="15"`.
- Existing anchors: `top`, `referral-types`, `referral-layers`, `referral-rules`, `referral-rates`, `referral-submit`.
- Existing form fields `dealType`, `modelLayer`, `brief` remain; role, work type and consent make the chosen context explicit. There is no backend form contract on this page.
- Prepared text remains in `sessionStorage.mmdReferralDraft`. It is displayed before the user copies it and opens the existing bare LINE URL `https://lin.ee/xRqsALs`.
- No automatic clipboard write or message send. Edits invalidate the generated preview and require preparing a new message.
- `t` is forwarded only to explicitly tagged, same-origin, allowlisted Partner destinations. It is never appended to LINE or media URLs.
- The original page is discoverable; no new noindex directive is added.
- The existing hero and three supporting story images are retained with responsive crops and progressive disclosure. The Partner header uses the explicitly requested unframed SĪGIL mark.

## Source references

- [User-shared Partner Fee conversation](https://chatgpt.com/share/6add42aa-b564-83ec-9ccf-ec65c440c927): revised tier matrix, whole-page implementation instruction, later publish approvals, naming and audience decisions.
- [Current fee reference](https://www.mmdbkk.com/partner/model/recommend-model/fee).
- [Current Partner Terms](https://www.mmdbkk.com/partner/terms).
- [Existing Modeling Partner overview](https://www.mmdbkk.com/partner/model).
- [Select Model Management booking conditions](https://www.selectmodel.com/london/booking-conditions), section 5.1: one actual agency fee structure; not a referrer tariff.
- [KULT London booking terms](https://www.kultlondon.uk/terms), sections 10(a)–(b): different agency structures by booking type; not MMD rate authorization.

The external examples support explaining why a percentage needs a defined payer, recipient and base. They do not establish that MMD's cash introduction amounts or tier labels are international standards.
