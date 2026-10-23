# MMD Partner Dashboard · hero / mobile first

Accepted direction, 2026-10-23: combine the Partner graphic pack V2 with the existing MMD Partner Dashboard. Use a photograph as the hero on every primary view. Keep the premium minimal black, ivory and champagne palette with comfortable spacing. Design for mobile first. This supersedes the earlier small artwork only direction.

LV10 refinement: keep the photographs as the anchor; add a restrained digital layer with fine grid lines, a view index, tabular KPI figures, precise navigation states and graphite glass surfaces. Show only real operational values. Avoid decorative trend arrows, fake live statuses, bright neon, dense gaming HUDs and long repeated headings. On mobile, the Hero and controls remain readable without horizontal page overflow. The interface remains calm and premium for the 34–39 audience.

2026-10-23 palette update: Partner surfaces move from cool graphite to burnt-brown `#160d08` with raised brown `#28180f`, golden headings `#f0cd83`, pale warm body copy `#ead9b9` and restrained brass `#e3b861`. The photo Hero and digital detail stay. Anuphan handles Thai, General Sans English and Satoshi numbers; short mobile rails are 10px or larger, regular copy stays readable, and primary gold buttons keep dark brown text. The Login and Worker Dashboard use the same palette; public Webflow pages are managed separately. This update supersedes the color wording above without changing the eight-view map or private data authority.

The authenticated Worker route remains `/partner/dashboard?t=…`. Webflow supplies public artwork and typography; Workers retain authentication, data, approvals, ledger and encryption authority. This is the MMD / SĪGIL Partner Division, separate from the MMS customer and spa Partner applications.

## Existing view mapping

| View | Photograph | Existing operation |
| --- | --- | --- |
| Home & Jobs | Yuki Partner 01 | Partner summary and calendar |
| Models | Yuki Partner 03 | Roster; profile and Sales Control editor |
| Agreements | Partner 01 | Existing agreement review and proposals |
| Earnings | Partner 01 | Existing payout ledger |
| Performance | Yuki Partner 01 | Existing verified operational summaries |
| Console | Yuki Partner 03 | Existing coordination requests |
| Activity | Partner 01 | Existing requests and financial status history |
| Private Vault | Partner 01 | Existing local encryption and unlock flow |

Jobs and Sales were separate mockup pages in the ten-page graphic pack. In the live application they remain Home & Jobs and the model editor, respectively. No unsupported API or synthetic dashboard records are introduced.

The public Webflow asset IDs and exact source URLs are recorded in `partners-worker/src/partner-dashboard-skin.ts`. Asset URLs never receive Partner tokens, identifiers or private fields; images explicitly use `referrerpolicy="no-referrer"`. The page already uses no-referrer and no-store. Decorative images have empty alt text; the accessible page heading remains real text and readable if an image cannot load.

Mobile: horizontally scrollable navigation, 44px minimum controls, 16px inputs, two-column summary cards, single-column forms and contained tables. Desktop: persistent sidebar and wider content grid. The shared hero updates with each existing view. Existing selectors, forms, action handlers and backend routes are retained. Skin styles are scoped to the MMD Partner Dashboard; recognition/review and MMS spa pages keep their previous presentation.

Source context: Google Drive “MMD System — Current Architecture & Access Flow — 2026-08-20”, document ID `17RxyAJBlkLpfpeH-V_ieyeAOzyT32wzTSPu2f0ugaf0`; Webflow SĪGIL System site `68f879d546d2f4e2ab186e90`, MMD Partner assets folder `6931fd899dd6085045ab0450`.

Validation: Partner Worker suite (98 tests), TypeScript, and Chromium view checks at 320, 390 and 1440 pixels. Browser previews use synthetic fixture data and approved local artwork copies. Production data and authenticated production writes are outside these visual checks.
