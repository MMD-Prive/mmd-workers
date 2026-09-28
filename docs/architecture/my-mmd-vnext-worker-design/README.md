# MY MMD — Worker design export

**DESIGN PREVIEW ONLY.** The default member experience is the Worker-rendered Digital LIFF Home. This folder is a visual handoff for `MMD-Prive/mmd-workers` and Webflow, not an app runtime or a source of member truth. Preview `gallery.html` locally, or use the isolated `/design-preview/gallery.html` copy on the Lovable preview host. Never link this gallery from the customer dock.

## Implementation map

| Design Lab surface | Worker HTML/CSS pattern | State boundary |
| --- | --- | --- |
| AppShell / dock | `.mmd-preview-frame`, `.mmd-preview-header`, `.mmd-preview-dock` | Worker owns LIFF session before rendering; HOME / HISTORY / WALLET / KENJI are visual destinations. |
| Home Member Snapshot | `.mmd-preview-card`, `.mmd-preview-row`, `.mmd-preview-chip` | Only render verified Worker membership projection; unknown stays checking. |
| YourCompanion / PerWelcome | `.mmd-preview-card`, `.mmd-preview-eyebrow` | Only explicit selected/welcome readback. No browser preference as authority. |
| CompanionChooser / Confirm | `.mmd-preview-button`, `.mmd-preview-card` | Required state + complete choices + approved session-bound write contract first; currently disabled. |
| NEEDS YOU / Kenji | `.mmd-preview-card--raised` | Show only Worker-approved actions and safe URLs; critical payment/booking/recovery bypasses Companion. |
| MMD NOW/NEWS / TMIB STORY | `.mmd-preview-card` | Slots only. Do not render until reviewed customer-safe editorial fields exist. |
| History timeline | `.mmd-preview-line` | `/api/member/app/history`; checking/recovery is never empty. No frontend history reconstruction. |
| Wallet / coupons | `.mmd-preview-card`, `.mmd-preview-chip` | Worker-confirmed wallet, approved discounts and CTA only; no cross-ledger arithmetic. |
| Points | `.mmd-preview-card` | Backend-provided balance/expiry only; no derived numbers or expiry. |
| Loading / recovery | `.mmd-preview-chip--checking`, `.mmd-preview-card--raised` | Explicit checking/recovery copy and accessible status; no implied entitlement. |

`my-mmd-tokens.css` is a **standalone scoped** CSS source for the gallery and handoff. Its values mirror the `.mmd-app-vnext` tokens in `src/styles.css`: #080907 base, #1c1d1b graphite, #d8b26a champagne gold, #f6f1e7 warm ivory; 4–20px spacing, 8px cards, 12/14/20px type. The customer app uses semantic tokens; Worker/Webflow may map these into their own stylesheet without importing any client-side business logic. Desktop content stays at or below 520px; mobile target is 390–430px. Keep focus visible, targets at least 44px, safe-area padding and reduced-motion support.

## Boundaries and activation gaps

- Normal journey: LINE/Rich Menu → LIFF verified session → Worker-rendered `/my-mmd/`. This design lab is secondary reference only.
- Worker owns identity, history recovery, points, membership, entitlement, payment, booking, and Companion state. Readback is same-origin `/api/member/app/*`; history is `/api/member/app/history` plus recovery endpoints. No Airtable or LINE access from Lovable.
- Companion requires explicit `companion_decision` readback (`checking|required|selected|welcome`, `selection_allowed`, exact HITO/HIMA/HIEI/HIRO choices, selected `name`, approved `welcome_label`), plus an agreed same-origin session-bound idempotent write endpoint, CSRF protection, response/readback and transition contract. Until then, chooser/confirm are disabled and Home remains usable. The gallery's states are fictional layout samples only.
- MMD NOW/NEWS and TMIB STORY need approved customer-safe content, visibility and safe action URL contracts. Empty editorial slots appear **only in this gallery**.
- Do not copy gallery placeholders, simulated statuses or member values into production. This export contains no business truth, access decision, API call, storage, or write endpoint.