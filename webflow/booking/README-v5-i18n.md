# /booking v5 editorial i18n

Additive visual and localization layer on top of the existing `booking-v4.html` runtime.

- TH / EN / ZH across hero, role-specific hero states, mood cards, service choices, fields, FAQ, status, summary and LINE clipboard text.
- `?lang=` is authoritative, then `localStorage.mmd_lang`, then document language / Thai fallback.
- Existing `role`, `package`, `model` and Medical Professional handoff semantics stay intact.
- Package names/prices remain owned by booking-v4; v5 localizes presentation detail only.
- No new fetch, payment, entitlement or booking-confirmation behavior.
- Motion respects `prefers-reduced-motion`.
