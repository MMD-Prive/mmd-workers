# CODEXMIN - PHASE 1A Route Inventory Normalization

Date: 2026-07-23
Source: current repo checkout only, no production route changes.
Branch observed: `hotfix/admin-kenji-knowledge-shell`
HEAD observed: `fa2e954d870a851deac32eb5a65176e96c73a9b8`

This is the single Phase 1A normalization pass for route truth. It classifies
known public routes, page routes, API routes, aliases, legacy surfaces, and
unresolved ownership conflicts. It does not approve owner moves, route deletion,
worker deployment, Webflow publishing, or alias removal.

## Status Key

| Status | Meaning |
| --- | --- |
| LIVE CONNECTED | Route has an explicit repo owner and connected route/API handling. |
| UI READY / BACKEND MISSING | Frontend or Webflow artifact exists, but backend owner is missing or not proven. |
| API READY / UI MISSING | Backend API exists, but canonical page/UI is missing or not proven. |
| ROUTE ONLY / REDIRECT | Front gate or route config only redirects, aliases, proxies, or protects path. |
| LEGACY | Existing surface kept temporarily for compatibility. |
| UNRESOLVED | Multiple owners, missing owner, or conflicting route truth. |
| DEPRECATED | Known old path retained only as compatibility marker. |
| REMOVE LATER | Candidate for removal only after Phase 6 proof and approval. |

## Priority Route Inventory

| Canonical route | Type | Normalized status | Current owner evidence | Current route behavior | Phase 1A decision |
| --- | --- | --- | --- | --- | --- |
| `/sigil/start` | Page / entry | ROUTE ONLY / REDIRECT | `mmd-redirect-worker/src/index.js` maps `/trust/inme`, `/inme`, `/login`, `/members`, `/trust` to `/sigil/start`; `immigrate-worker/src/index.ts` renders SIGIL System Access Gate copy. | Canonical target exists as entry concept, but owner is not fully normalized in route config. | Keep as priority unresolved owner lock item. Do not remove aliases. |
| `/sigil/booking` | Page proxy | LIVE CONNECTED | `workers/sigil-booking-proxy-worker/wrangler.toml`; `workers/sigil-booking-proxy-worker/src/index.js`; existing `docs/sigil-route-ownership-registry.md`. | `sigil-booking-proxy-worker` owns exact public route family and proxies Webflow page on `sigil.mmdbkk.com`; apex/www redirect to canonical `sigil.mmdbkk.com`. | Canonical owner candidate: `sigil-booking-proxy-worker`. Keep aliases temporarily. |
| `/sigil/apply` | Worker page | PARTIAL INTEGRATION | `mmd-redirect-worker/src/index.js` delegates to `SIGIL_WORKER`; `sigil-worker/src/index.js` has no matching `/sigil/apply` handler and falls through to `not_found`; `sigil-worker/wrangler.toml` declares no custom routes. | Front gate delegation exists, but target page handler and exact production route are not proven. | Keep unresolved. Candidate target: `sigil-worker`; Phase 4A must implement/prove GET/HEAD/slash/query behavior before lock. |
| `/sigil/member/apply` | Webflow UI + planned backend | UI READY / BACKEND MISSING | `webflow/member/apply/README.md`; `webflow/member/apply/member-apply.html`; `webflow/member/apply/member-application.contract.json`. | Webflow artifact says canonical frontend is `/sigil/member/apply` and posts to `/v1/member/applications`, but repo search does not show a proven backend route owner for that API. | Keep as UI-ready unresolved. Backend owner must be locked before production ready. |
| `/member/apply` | Webflow pass-through alias | ROUTE ONLY / REDIRECT | `mmd-redirect-worker/src/index.js` includes `/member/apply` in Webflow member page pass-through and never-redirect exact paths. | Alias/pass-through, not canonical per Webflow member apply docs. | Keep temporary alias. Do not delete in Phase 1. |
| `/member/dashboard` | Member page / dashboard | UNRESOLVED | `mmd-redirect-worker/src/index.js` delegates to `immigrate-worker`; `immigrate-worker/src/index.ts` has dashboard alias handling; `member-pages-worker/src/index.js` only links/gates access. | Live route is front-gated to `immigrate-worker`; target architecture mentions possible owner move out of legacy. | Owner not locked. Phase 3 owner decision required. |
| `/member/membership` | Worker page | LIVE CONNECTED | `mmd-redirect-worker/src/index.js` delegates member page paths to `member-pages-worker`; `member-pages-worker/src/index.js` renders membership package selection. | Member package page exists; payment proof stays evidence only; no auto-renewal redirect. | Canonical owner candidate: `member-pages-worker`, still fronted by `mmd-redirect-worker`. |
| `/member/payments` | Admin/member payment page | UNRESOLVED | `mmd-redirect-worker/src/index.js` delegates to `admin-worker`; no dedicated route config found. | Front gate sends page to admin worker; auth/member ownership needs Phase 3/5 decision. | Keep unresolved. Do not move during Phase 1A. |
| `/sigil/pay/renewal` | Worker page | PARTIAL INTEGRATION | `mmd-redirect-worker/src/index.js` delegates exact SIGIL renewal paths to `member-pages-worker`; `member-pages-worker/src/index.js` renders a manual legacy renewal safety page; `member-dashboard-chat-worker/wrangler.toml` currently declares only LINE webhook routes. | Renderer code exists, but exact direct route attachment and production winner are not proven. | Keep temporary pending renewal route acceptance audit. Candidate renderer: `member-dashboard-chat-worker`; current production owner remains unverified. |
| `/pay/renewal` | Alias page | UNRESOLVED | Historical renderer evidence exists, but current `member-dashboard-chat-worker/wrangler.toml` has no `/pay/renewal` route and current front-gate proof does not establish a direct owner. | Exact route attachment, production winner, GET/HEAD/slash behavior, and query preservation remain unverified. | Keep compatibility only. Do not assign direct owner until Phase 6 or renewal acceptance proof. |
| `/sigil/pay/membership` | Payment route lock / member page | ROUTE ONLY / REDIRECT | `mmd-redirect-worker/src/index.js` never-redirect exact path; `member-pages-worker/src/index.js` renders safety/fallback page. | Protected from auto-renewal redirects; not a final payment truth owner. | Keep route lock. Payment owner still belongs in Phase 2. |
| `/pay/membership` | Payment evidence page | LIVE CONNECTED | `mmd-redirect-worker/src/index.js`; `member-pages-worker/src/index.js`. | Member payment evidence page posts to payment verification flow; proof is not activation. | Canonical payment evidence page candidate: `member-pages-worker`; payment truth remains `payments-worker`/backend. |
| `/sigil/model/console` | Model console | UNRESOLVED | Priority plan lists `/sigil/model/console`; repo front gate currently has `/model/console` recovery shell, not `/sigil/model/console`. | Canonical SIGIL model console route not proven in route config. | Needs Phase 4 owner lock. |
| `/model/console` | Legacy model console shell | LEGACY | `mmd-redirect-worker/src/index.js` renders temporary model console recovery shell. | Temporary shell links to `/v1/model/session/dashboard`. | Mark legacy. Remove only after Phase 4 proves new console owner. |
| `/public/access` | Public access intake page | UNRESOLVED / UI MISSING | Plan lists route; repo evidence found `webflow/sigil/access/*` and `mmd-redirect-worker` public hall/trust links, but no exact visible `/public/access` owner or handler. `public-access-worker` separately implements the intake API. | Visible page owner remains unresolved; API implementation owner is separate and must not be used as page proof. | Phase 2 public access page audit, route attachment proof, CTA/form integration, and API live smoke required. |
| `/profiles` | Public browse page | UNRESOLVED | Plan lists route; no exact owner found in priority route search. | No canonical owner proven from current repo scan. | Phase 2 public browse owner required. |
| `/sigil/recovery` | Recovery / complaint family | UI READY / BACKEND MISSING | `immigrate-worker/public/sigil/recovery/*`; `mmd-care-intake-worker/src/index.js`; `sigil-worker/src/index.js`; README references `/sigil/recovery/complaint`. | Assets/API pieces exist, but exact canonical page owner is not normalized. | Keep unresolved. Do not collapse into generic recovery shell. |
| `/sigil/aftercare` | Aftercare page | UNRESOLVED | `webflow/sigil/access/sigil-access-os.js` references `/aftercare`; no exact `/sigil/aftercare` owner found. | No canonical owner proven. | Phase 2/6 decision required; no route action in Phase 1. |

## API Inventory

| Canonical API route | Type | Normalized status | Current owner evidence | Notes |
| --- | --- | --- | --- | --- |
| `/sigil/api/client/resolve` | API | PARTIAL INTEGRATION | `sigil-booking-worker/src/index.js` implements `POST`; `sigil-booking-worker/wrangler.toml` has `workers_dev = true` and no custom-host `[[routes]]`; README route mapping is suggested only. | Booking helper API handler exists in repository, but `sigil.mmdbkk.com/sigil/api/*` route attachment is missing/unverified. Production owner remains unresolved until Phase 2B custom-host binding and acceptance. |
| `/sigil/api/models/search` | API | PARTIAL INTEGRATION | `sigil-booking-worker/src/index.js` implements `GET|POST`; `sigil-booking-worker/wrangler.toml` has no custom-host route. | Public/private model search handler exists, but custom-host reachability is not proven; workers.dev must not be treated as canonical production ownership. |
| `/sigil/api/booking/intake` | API | PARTIAL INTEGRATION | `sigil-booking-worker/src/index.js` implements `POST`; `sigil-booking-worker/wrangler.toml` has no custom-host route. | Booking intake handler exists; customer UI owner is separate, and production route owner remains unresolved pending exact binding and smoke. |
| `/sigil/api/private-model/apply` | API | PARTIAL INTEGRATION | `mmd-redirect-worker/src/index.js` delegates POST/OPTIONS to `SIGIL_WORKER`; `sigil-worker/src/index.js` has no matching private-model apply API handler and `sigil-worker/wrangler.toml` has no custom route. | Front-gate method/body delegation exists, but target API handler, auth contract, and production attachment are not proven. | Keep unresolved. Candidate target: `sigil-worker`; Phase 4A must implement/prove POST/OPTIONS/body preservation before lock. |
| `/v1/public-model/apply` | API | API READY / UI MISSING | `sigil-worker/src/index.js`. | Public model application API. Root `partners-worker` also exposes `/v1/apply/public-model`; names must remain distinct until owner lock. |
| `/public/api/access/intake` | API | API READY / UI MISSING | `public-access-worker/src/index.js`; `public-access-worker/wrangler.toml` routes `sigil.mmdbkk.com/public/api/*`. | Public access intake writes evidence/request records only; allowed-Origin, consent, file size/type, Airtable/R2, and Telegram notification behavior are implemented. Production smoke remains pending. |
| `/v1/apply/public-model` | API | UNRESOLVED | `partners-worker/wrangler.toml`; `partners-worker/src/index.ts`. | Overlaps conceptually with `sigil-worker` public model API. Needs Phase 4/partners owner decision. |
| `/v1/member/applications` | API | UNRESOLVED | Referenced by `webflow/member/apply/*`; no backend route found in current priority scan. | Required for `/sigil/member/apply`; backend owner missing. |
| `/v1/member/dashboard` | API | UNRESOLVED | No exact handler found in `admin-worker`, `mmd-redirect-worker`, `immigrate-worker`, `member-dashboard-chat-worker`, or `member-pages-worker` current source scan. | Backend API contract is separate from `/member/dashboard` page route. Phase 3 must implement/prove handler, auth, response contract, and route attachment before dashboard UI depends on it. |
| `/api/member/dashboard` | API alias | UNRESOLVED | No exact alias/rewrite found in `mmd-redirect-worker`; current `MEMBER_API_PATHS` only includes `/member/api/liff/identify`. | Intended alias/mapping is unproven. Do not claim redirect/proxy to `/v1/member/dashboard` until source and route evidence exist. |
| `/member/api/liff/identify` | API | LIVE CONNECTED | `mmd-redirect-worker/src/index.js`; `member-pages-worker/src/index.js`. | LIFF identity bridge; must not unlock dashboard/payment by itself. |
| `/v1/admin/access/grant` | API | API READY / UI MISSING | `auth-worker/src/index.js`; `auth-worker/README.md`. | Explicit `/v1/admin/*` namespace exception. `auth-worker` owns the MVP grant endpoint, guarded by `ADMIN_BEARER`, until moved behind or proxied by `admin-worker`. |
| `/v1/admin/ping` | API bridge | ROUTE ONLY / REDIRECT | `immigrate-worker/wrangler.toml` declares apex/www exact routes; `immigrate-worker/src/internal-routes.ts` forwards `/v1/admin/*` through the `ADMIN_WORKER` binding with cookie and bridge headers. | Explicit temporary `/v1/admin/*` bridge ingress exception. Path and query are preserved to the upstream admin-worker operation until direct canonical client migration is accepted. |
| `/v1/admin/clients/lineage-lookup` | API bridge | ROUTE ONLY / REDIRECT | `immigrate-worker/wrangler.toml` declares apex/www exact routes; `immigrate-worker/src/internal-routes.ts` forwards `/v1/admin/*` through the `ADMIN_WORKER` binding with cookie and bridge headers. | Explicit temporary `/v1/admin/*` bridge ingress exception for same-origin admin pages. Do not capture by wildcard before migration acceptance. |
| `/v1/admin/clients/recent` | API bridge | ROUTE ONLY / REDIRECT | `immigrate-worker/wrangler.toml` declares apex/www exact routes; `immigrate-worker/src/internal-routes.ts` forwards `/v1/admin/*` through the `ADMIN_WORKER` binding with cookie and bridge headers. | Explicit temporary `/v1/admin/*` bridge ingress exception for same-origin admin pages. |
| `/v1/admin/models/search` | API bridge | ROUTE ONLY / REDIRECT | `immigrate-worker/wrangler.toml` declares apex/www exact routes; `immigrate-worker/src/internal-routes.ts` forwards `/v1/admin/*` through the `ADMIN_WORKER` binding with cookie and bridge headers. | Explicit temporary `/v1/admin/*` bridge ingress exception. This is ingress ownership only; admin-worker remains the backend model-search owner. |
| `/v1/admin/job/draft` | API bridge | ROUTE ONLY / REDIRECT | `immigrate-worker/wrangler.toml` declares apex/www exact routes; `immigrate-worker/src/internal-routes.ts` forwards `/v1/admin/*` through the `ADMIN_WORKER` binding with cookie and bridge headers. | Explicit temporary `/v1/admin/*` bridge ingress exception. Path and query are preserved to the upstream admin-worker operation. |
| `/v1/admin/create-session` | API bridge alias | ROUTE ONLY / REDIRECT | `immigrate-worker/wrangler.toml` declares apex/www exact routes; `immigrate-worker/src/internal-routes.ts` rewrites to `/v1/admin/job/create`; tests prove `ADMIN_WORKER` service-binding forwarding and payload normalization. | Explicit temporary `/v1/admin/*` bridge exception. `immigrate-worker` owns ingress only; canonical backend operation remains `admin-worker` `/v1/admin/job/create`. |
| `/v1/admin/create-job` | API bridge alias | ROUTE ONLY / REDIRECT | `immigrate-worker/wrangler.toml` declares apex/www exact routes; `immigrate-worker/src/internal-routes.ts` rewrites to `/v1/admin/job/create`; tests prove `ADMIN_WORKER` service-binding forwarding and payload normalization. | Explicit temporary `/v1/admin/*` bridge exception. Do not treat this alias as directly implemented by `admin-worker`; remove only after direct canonical clients and acceptance migration. |
| `/v1/admin/jobs/create-session` | API bridge alias | ROUTE ONLY / REDIRECT | `immigrate-worker/wrangler.toml` declares apex/www exact routes; `immigrate-worker/src/internal-routes.ts` rewrites to `/v1/admin/job/create`; tests prove `ADMIN_WORKER` service-binding forwarding and payload normalization. | Explicit temporary `/v1/admin/*` bridge exception. Inbound Authorization is not forwarded; cookie and bridge headers are forwarded to the canonical backend. |
| `/v1/admin/line/push` | API bridge | ROUTE ONLY / REDIRECT | `immigrate-worker/wrangler.toml` declares apex/www exact routes; `immigrate-worker/src/internal-routes.ts` forwards `/v1/admin/*` through the `ADMIN_WORKER` binding with cookie and bridge headers. | Explicit temporary `/v1/admin/*` bridge ingress exception for same-origin admin pages. Backend ownership remains endpoint-specific behind admin-worker. |
| `/v1/admin/line/liff-renewal-queue` | API | UNRESOLVED | Prior inventory listed `member-pages-worker/src/index.js`, but exact handler was not found in the current source scan. | Keep as explicit `/v1/admin/*` exception candidate until source handler/route attachment is confirmed or removed from inventory. |
| `/internal/admin/liff-renewal-queue` | Internal UI | UNRESOLVED | exact-path repo search found no non-architecture handler or route attachment. | Internal UI path is not implemented/proven; keep separate from `/v1/admin/line/liff-renewal-queue` API exception candidate. |
| `/v1/admin/model/session/link` | API | LIVE CONNECTED | `admin-worker/src/index.js`. | Model session link issuer. |
| `/v1/model/session/current` | API | LIVE CONNECTED | `admin-worker/src/index.js`. | Signed model session runtime API. |
| `/v1/model/session/action` | API | LIVE CONNECTED | `admin-worker/src/index.js`. | Signed model session action API with server-side state checks. |
| `/v1/admin/job/create` | API | LIVE CONNECTED | `admin-worker/src/index.js`. | Admin create-job/session-adjacent backend. |
| `/v1/admin/members/list` | API | LIVE CONNECTED | `admin-worker/src/index.js`. | Admin member review/list. |
| `/v1/admin/members/update` | API | LIVE CONNECTED | `admin-worker/src/index.js`. | Admin member update; protected admin API. |
| `/v1/admin/models/list` | API | LIVE CONNECTED | `admin-worker/src/index.js`. | Admin model list. |
| `/v1/admin/models/search` | API | LIVE CONNECTED | `admin-worker/src/index.js`. | Admin model search. |
| `/v1/admin/models/upsert` | API | LIVE CONNECTED | `admin-worker/src/index.js`. | Admin model upsert. |
| `/v1/admin/payment/proof` | API | LIVE CONNECTED | `admin-worker/src/index.js`. | Admin payment proof handling; do not treat frontend proof as approval. |
| `/v1/admin/sigil/board/publish` | API | API READY / UI MISSING | `admin-worker/src/index.js`. | Admin board publish endpoint; Phase 5, not Phase 1 route owner. |
| `/sigil/board/runtime` | API | LIVE CONNECTED | `workers/sigil-board-worker/wrangler.toml`; `workers/sigil-board-worker/src/index.js`; existing registry. | Board runtime API; not the visible `/sigil/board` page. |
| `/sigil/board/actions/*` | API | LIVE CONNECTED | `workers/sigil-board-worker/wrangler.toml`; `workers/sigil-board-worker/src/index.js`. | Controlled queue action API. |
| `/sigil/board/audit*` | API | LIVE CONNECTED | `workers/sigil-board-worker/wrangler.toml`; `workers/sigil-board-worker/src/index.js`. | Controlled audit API. |
| `/member/api/recovery/complaint-evidence` | API | API READY / UI MISSING | `mmd-care-intake-worker/src/index.js`; `sigil-worker/src/index.js`. | Duplicate implementation evidence; owner must be locked before production route changes. |
| `/member/api/recovery/complaint-status` | API | API READY / UI MISSING | `mmd-care-intake-worker/src/index.js`. | Recovery status API. |
| `/member/api/recovery/coupon-status` | API | API READY / UI MISSING | `mmd-care-intake-worker/src/index.js`. | Recovery coupon status API. |
| `/api/recovery/coupon/status` | API | API READY / UI MISSING | `sigil-worker/src/index.js`. | SIGIL coupon status API. |
| `/api/recovery/coupon/ack` | API | API READY / UI MISSING | `sigil-worker/src/index.js`. | SIGIL coupon acknowledgment API. |
| `/v1/partner/upload` | API | LIVE CONNECTED | `partners-worker/wrangler.toml`; `partners-worker/src/index.ts`. | Partner upload API. |
| `/v1/partner/request` | API | PARTIAL INTEGRATION | `partners-worker/src/index.ts`; `partners-worker/wrangler.toml`; workers.dev references. | Partner request handler exists, but custom-host route config does not list this exact path; production owner remains UNRESOLVED and workers.dev is not canonical. |
| `/v1/partner/verify` | API | API READY / UI MISSING | `partners-worker/src/index.ts`. | Partner verify API. |
| `/v1/partner/dashboard` | API | API READY / UI MISSING | `partners-worker/src/index.ts`. | Partner dashboard API. |
| `/telegram/webhook` and `/v1/webhook` | API | PARTIAL INTEGRATION | `telegram-worker/src/index.js`; `telegram-worker/wrangler.toml`; internal consumers reference `telegram-worker.malemodel-bkk.workers.dev`. | Telegram webhook aliases are implemented, but production route owner remains unresolved because no custom-host route or service binding is proven. |
| `/telegram/internal/send`, `/v1/internal/send`, `/v1/send` | API | PARTIAL INTEGRATION | `telegram-worker/src/index.js`; `telegram-worker/wrangler.toml`; internal consumers reference `telegram-worker.malemodel-bkk.workers.dev`. | Internal notification APIs are implemented; workers.dev/internal consumer evidence is not canonical production route ownership. |
| `/internal/admin/jobs/create-session` | Internal UI | LIVE CONNECTED | `immigrate-worker/wrangler.toml`; `immigrate-worker/src/internal-routes.ts`; `immigrate-worker/src/internal-pages.ts`. | Implemented create-session page; temporary ingress owner `immigrate-worker`; backend bridge remains `admin-worker`. |
| `/internal/jobs/create-job` | Internal UI | LIVE CONNECTED | `immigrate-worker/wrangler.toml`; `immigrate-worker/src/internal-routes.ts`; `immigrate-worker/src/internal-pages.ts`. | Implemented separate create-job page; temporary ingress owner `immigrate-worker`; backend bridge remains `admin-worker`. |
| `/internal/admin/create-session` | Internal UI redirect | ROUTE ONLY / REDIRECT | `immigrate-worker/src/internal-routes.ts`. | Legacy redirect to `/internal/admin/jobs/create-session` with query preserved. |
| `/v1/rt/room/open` | API | API READY / UI MISSING | `realtime-worker/src/index.js`; `realtime-worker/wrangler.toml`. | Realtime room open API implementation exists; production route owner remains unresolved because no custom-host route or service binding is proven. |
| `/v1/rt/ws` | WebSocket API | API READY / UI MISSING | `realtime-worker/src/index.js`; `realtime-worker/wrangler.toml`. | Durable Object websocket implementation exists; workers.dev is not canonical production ownership. |

## Webflow / UI Artifacts

| UI artifact | Claimed route | Normalized status | Evidence | Phase 1A decision |
| --- | --- | --- | --- | --- |
| SIGIL booking Webflow page | `/sigil/booking` | LIVE CONNECTED | `workers/sigil-booking-proxy-worker` proxies `https://mmdprive.webflow.io/sigil/booking`. | Keep Webflow as display page, Worker as route owner. |
| SIGIL member application | `/sigil/member/apply` | UI READY / BACKEND MISSING | `webflow/member/apply/README.md`, HTML/JS/CSS artifacts. | Needs backend owner for `/v1/member/applications`. |
| SIGIL renewal Webflow bridge | `/sigil/pay/renewal` | ROUTE ONLY / REDIRECT | `webflow/sigil/pay/renewal/webflow-renewal-redirect-snippet.html`. | Bridge should redirect Webflow stale page to canonical worker route; not production renderer owner. |
| SIGIL access OS | Not normalized; likely trust/public access family | UI READY / BACKEND MISSING | `webflow/sigil/access/*`. | Requires Phase 2 public access route audit. |
| SIGIL private models | Private model page layer | UI READY / BACKEND MISSING | `webflow/sigil/private-models/*`. | Do not mix with customer route inventory beyond owner note. |
| SIGIL board visible page | `/sigil/board` | LIVE CONNECTED | Existing registry marks Webflow page surface. | Keep Webflow visible page; API owner remains `sigil-board-worker`. |

## Alias / Legacy / Removal Candidates

| Route or pattern | Current class | Evidence | Keep temporarily? | Removal rule |
| --- | --- | --- | --- | --- |
| `/trust/inme` | Alias | `mmd-redirect-worker/src/index.js` maps to `/sigil/start`. | Yes | Remove only in Phase 6 after `/sigil/start` owner is live and approved. |
| `/inme` | Alias | `mmd-redirect-worker/src/index.js`. | Yes | Same as above. |
| `/login` | Alias | `mmd-redirect-worker/src/index.js`. | Yes | Same as above. |
| `/members` | Alias | `mmd-redirect-worker/src/index.js`. | Yes | Same as above. |
| `/trust` | Alias | `mmd-redirect-worker/src/index.js`. | Yes | Same as above. |
| `/member` | Alias | `mmd-redirect-worker/src/index.js` maps to `/member/dashboard`. | Yes | Remove only after member dashboard owner/auth are production ready. |
| `/membership` | Alias | `mmd-redirect-worker/src/index.js` maps to `/member/membership`. | Yes | Remove only after member flow is production ready. |
| `/member/membership/benefits` | Alias | `mmd-redirect-worker/src/index.js` maps to `/member/membership`. | Yes | Remove only after member flow is production ready. |
| `/membership/benefits` | Alias | `mmd-redirect-worker/src/index.js` maps to `/member/membership`. | Yes | Remove only after member flow is production ready. |
| `/renew` | Legacy alias | `mmd-redirect-worker/src/index.js` maps to `/sigil/membership`, not renewal payment. | Yes | Phase 6 only, after renewal/membership route contracts are proven. |
| `/renewal` | Legacy alias | `mmd-redirect-worker/src/index.js` maps to `/sigil/membership`, not renewal payment. | Yes | Phase 6 only, after renewal/membership route contracts are proven. |
| `/model/console` | Legacy shell | `mmd-redirect-worker/src/index.js`. | Yes | Remove after `/sigil/model/console` owner is live. |
| `/old-academy/*` | Deprecated redirect | `mmd-redirect-worker/src/index.js`. | Yes | Phase 6 redirect-rule migration candidate. |
| `/old-trust/*` | Deprecated redirect | `mmd-redirect-worker/src/index.js`. | Yes | Phase 6 redirect-rule migration candidate. |
| `mmdbkk.com/*`, `www.mmdbkk.com/*` front gate | Legacy/front gate catch-all | `mmd-redirect-worker/wrangler.toml`. | Yes | Do not remove until every new owner is live and Phase 6 proof is complete. |

## Duplicate / Conflict List

| Area | Conflicting evidence | Normalized decision |
| --- | --- | --- |
| Member dashboard | `mmd-redirect-worker` fronts route; `immigrate-worker` renders dashboard; target plan expects possible new owner. | UNRESOLVED. Phase 3 must decide canonical dashboard owner. |
| Member application | `/sigil/member/apply` UI exists, `/member/apply` alias/pass-through exists, `/v1/member/applications` backend not found. | UNRESOLVED. Lock canonical route and backend before publishing changes. |
| Public model apply | `sigil-worker` exposes `/v1/public-model/apply`; `partners-worker` exposes `/v1/apply/public-model` and `/apply/public-model`. | UNRESOLVED. Phase 4/partner route owner decision required. |
| Recovery / complaint | `mmd-care-intake-worker` and `sigil-worker` both contain recovery/complaint API handling. | UNRESOLVED. Pick one owner group before route changes. |
| SIGIL renewal Webflow page | Worker route owner exists, but Webflow stale page bridge is separate display cleanup. | ROUTE ONLY / REDIRECT bridge. Do not treat Webflow as canonical renderer. |
| Member dashboard page/API split | `/member/dashboard` has legacy page evidence through `mmd-redirect-worker` to `immigrate-worker`; `/v1/member/dashboard` and `/api/member/dashboard` have no exact handler or rewrite evidence. | Keep page route unresolved by owner; downgrade dashboard API to UNRESOLVED until Phase 3 handler and mapping acceptance. |
| SIGIL booking API attachment | `sigil-booking-worker` implements booking API handlers, but its Wrangler file only enables workers.dev and has no custom-host route. | PARTIAL INTEGRATION. Keep production route owner unresolved until Phase 2B adds/proves exact custom-host attachment and production acceptance. |
| Partners worker root vs nested/assets | Root `partners-worker` has API route patterns and R2 binding; nested assets worker exists separately. | UNRESOLVED unless already approved elsewhere. Do not delete/rename in Phase 1A. |
| `mmd-redirect-worker` catch-all | Still fronts many connected and unresolved routes. | LEGACY/front gate. Retire only in Phase 6. |

## Canonical Owner Candidates

| Route/API family | Candidate owner | Confidence | Notes |
| --- | --- | --- | --- |
| `/sigil/booking` page | `sigil-booking-proxy-worker` | High | Current registry and route config agree. |
| `/sigil/api/*` booking APIs | `sigil-booking-worker` handler candidate | Medium | Exact handlers exist, but custom-host `sigil.mmdbkk.com/sigil/api/*` attachment is missing/unverified in current route config; page owner is separate. |
| `/sigil/apply` | `sigil-worker` candidate target | Low | Front gate delegates, but current sigil-worker handler and exact route attachment are missing/unverified. |
| `/sigil/pay/renewal` | `member-dashboard-chat-worker` renderer candidate | Low | Renderer evidence exists, but current route config does not prove direct ownership and production winner is unverified. |
| `/member/membership` | `member-pages-worker` | High | Front gate delegates member page path to member-pages worker. |
| `/pay/membership` | `member-pages-worker` page, backend payment truth elsewhere | Medium | UI exists; final payment truth remains backend/payment worker concern. |
| `/member/dashboard` page | TBD | Low | Current page route uses `mmd-redirect-worker` to `immigrate-worker`; target architecture wants non-legacy owner decision. This does not prove `/v1/member/dashboard`. |
| `/v1/member/dashboard` API | TBD | Low | No exact handler or `/api/member/dashboard` mapping found in current source scan; Phase 3 must define and prove the backend API contract. |
| `/member/payments` | `admin-worker` currently, TBD for member surface | Low | Front gate delegates to admin worker, but member surface ownership not locked. |
| `/sigil/member/apply` | TBD | Low | UI exists; backend route missing. |
| `/sigil/model/console` | TBD | Low | No exact canonical route owner found. |
| `/public/access` | TBD page owner; `public-access-worker` API owner | Medium | Visible page owner is unresolved; `POST /public/api/access/intake` handler and route config are repo-proven, with live smoke pending. |
| `/sigil/recovery` | TBD | Low | Assets and APIs exist, owner not normalized. |
| `/sigil/aftercare` | TBD | Low | No exact route owner found. |

## Stop Line

Phase 1A produced a normalized route inventory only.

No source behavior was changed.
No workers were deployed.
No Cloudflare routes were modified.
No Webflow publish was performed.
No aliases, catch-all routes, or legacy workers were removed.

Next recommended CodexMin task:
`CODEXMIN - PHASE 1B - CANONICAL OWNER LOCK`
