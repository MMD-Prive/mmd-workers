# MY MODEL presentation handoff — 2026-10-17

## Delivery and ownership

- `my-model-tokens.css`: exact base semantic colors from `src/styles.css`, 520px frame, 44px touch minimum, safe-area dock, typography, focus and disabled styles.
- `gallery.html`: static, explicitly DESIGN PREVIEW. No scripts, API requests, login, persistence or lifecycle writes. Live reference at `/design/gallery.html`; matching public CSS/HTML copies are maintained together.
- Production normal `/sigil/model/dashboard` remains Webflow-owned inside `model-dashboard-presentation-worker` in **MMD-Prive/mmd-workers**. Port CSS/classes into its existing shell; do not embed this React root or a second LIFF bootstrap.
- Production markers remain `mmd-app-digital-v3` / `lovable-vnext` where the canonical Worker expects them; this reference keeps its existing `lovable-model-dashboard` marker. This delivery does not activate production.

## Route mapping

| Reference | Production destination / owner |
|---|---|
| HOME `/` | `https://mmdbkk.com/sigil/model/dashboard` — Webflow shell |
| JOBS `/jobs` | `https://mmdbkk.com/sigil/model/dashboard/jobs` — canonical Worker routing |
| CONSOLE | `https://mmdbkk.com/sigil/model/console` — existing Console, no local clone |
| YOU `/more` | Reference links hub; port into the existing approved Webflow destination, do not assume a new production `/you` route |
| Profile / Photos / Availability / Support | Existing local tool routes are preserved; production mapping must retain the canonical shell's approved destinations |

Console links use absolute apex and retain `lang` and `liff_env`; internal router links retain their current query parameters. Signed return URLs are handled only by the existing exact-path validator. `/sigil/*`, `/rules/*`, `/v1/*` and asset URLs must not receive a dashboard prefix.

## Data and component mapping

| UI | Existing source / contract | Presentation rule |
|---|---|---|
| Header + dock | `AppShell` | MY MODEL neutral header; exact HOME/JOBS/CONSOLE/YOU; TH/EN/中文 |
| Current command | `CurrentJobSurface`; `useCurrentSession` | Only recognized normalized Worker status, unchanged Job Day gate, one existing Console CTA |
| ETA | Existing `EtaControl` | Only `send_eta` plus acknowledged guide and not wrap-up |
| Reconfirm | Existing `ReconfirmCard` | Preserve Worker support and `acknowledge_reconfirm` action gate |
| Activation / review | Existing activation + LINE verification hooks and `BootStatus` | 202 review is never ready or a signed-return redirect |
| Loading | `LoadingProgress` | 10 on start; 45 while an actual model query fetches. Never timers, 70% uploads or invented completion; remove when operation finishes |
| Errors | `ErrorBlock` | Retain existing unauthorized/unavailable retry rules |
| Media / profile / safety / Wish | Existing components and mutations | No policy, field, approval or endpoint changes |

The current session adapter **does not supply job title, job fee, place, time or `model_work_lane`**. Do not populate these from profile minimum rate, URL tokens or sample data. The port may render the five operational facts only from existing canonical authorized Worker fields. No adapter/API contract was expanded here. Historical earnings/history APIs and My Card were not resurrected from the rollback because that would exceed a presentation-only delivery.

## Brand and asset mapping

- Neutral/unresolved job lane: MY MODEL, no SĪGIL logo or implied Private status. The live reference intentionally does not choose a lane.
- Confirmed canonical public job lane: MMD PRIVÉ white job treatment. Confirmed canonical private job lane: SĪGIL black job treatment with existing 24px mark and 8px name gap. Map the actual Worker enum values; never invent enums or infer from profile, URL or `/sigil` prefix.
- Dashboard: Rainy Glass, 10% opacity behind readable surfaces. Source provenance: Webflow `Midnight Bangkok Through Rainy Glass.webp`.
- Console only: Rooftop Skyline. It appears only in the static Console reference, not a new Console route. Source provenance: Webflow `Midnight Bangkok Rooftop Skyline.webp`.
- Both originals were downloaded and uploaded into this project's asset CDN; pointers are in `src/assets`. Existing SĪGIL pointer belongs to this same project and was recovered without changing Git history. Verify asset serving for the production port; use the existing Webflow asset URLs or rehost through the canonical Worker asset process, not copied project-relative CDN pointers on another domain.
- Published Webflow contains competing mobile photo overrides; resolve those CSS overrides when porting the user-selected Rainy Glass treatment. Do not assert source-image presence proves its current effective mobile appearance.

## Acceptance / blockers

- Run existing mock regression tests and event-only loading tests; inspect 320/390/430px and desktop, EN/ZH, reduced motion, unavailable states and navigation. No real LINE login or acknowledgement is part of this check.
- Lovable build/typecheck is harness-managed; do not substitute a test run for its production build result.
- The desktop `Webflow — MMD` connector is currently errored. Production port remains blocked until it is reconnected and the current shell can be inspected. No production CSS/embed/routing was changed.
- LINE developer settings, authenticated model data and actual production action flow remain unverified. Keep published LIFF `2010864854-N34SgCqq`, apex host-only cookie, and the existing Workers/Webflow acknowledgement flow.
- No publication, deployment, credentials, backend provisioning or real job mutations.

## Verification results

- `bunx vitest run`: **140/140 tests, 11 files passed**. Includes LINE rejection/202 review/signed-return regressions, activation/media/safety/Wish, explicit language defaults, event-only 10/45 loading, and shared ETA permission checks. React test-environment `act` warnings are present but no failed assertions.
- Harness production build/typecheck: latest validation **build OK, 2026-10-17 13:07:23 UTC**. No manual build/typecheck was invoked because the harness owns those checks.
- Playwright: HOME → JOBS → YOU, TH → EN → ZH, canonical Console href and source/visual dock order at **320, 390, 430, 1280px**, reduced motion; no horizontal overflow or page errors. Gallery images (Rainy Glass, Rooftop, existing SĪGIL) loaded. Screenshots inspected at 390px.
- These checks verify the real reference's unavailable-session state and the static presentation gallery. Authenticated production jobs, branding lane, native LINE picker and acknowledgement are **not verified**; no credentials were fabricated and no live writes were performed.

### Changed files

- Shell/status: `src/styles.css`, `src/components/mmd/AppShell.tsx`, `States.tsx`, `BootStatus.tsx`, new `CurrentJobSurface.tsx`.
- Pages: `src/routes/index.tsx`, new `jobs.tsx` and `more.tsx`; `profile.tsx`, `photos.tsx`, `availability.tsx`, `support.tsx`, `__root.tsx` head/name updates. Photos' fixed 70% upload indicator replaced with actual loading events. Router tree regenerated automatically.
- Copy/language: `src/lib/app-copy.ts`, `src/lib/i18n.tsx`, `i18n.test.ts`; explicit-choice Thai default restored without changing identity logic.
- Tests: new `src/components/mmd/current-job-surface.test.tsx`, `src/lib/api/loading-progress.test.tsx`.
- Assets: same-project existing SĪGIL pointer plus new Rainy Glass/Rooftop pointers under `src/assets`.
- Handoff: `docs/worker-design-export/{README.md,my-model-tokens.css,gallery.html}`, mirrored gallery/CSS under `public/design`, `README.md`, `AGENTS.md`, `roadmap.md`.

Preview paths: `/` (operational reference, fails closed without Worker session), `/jobs`, `/more`, and `/design/gallery.html` (static presentation). Published site remains unchanged.