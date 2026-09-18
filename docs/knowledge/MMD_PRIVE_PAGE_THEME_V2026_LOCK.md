# MMD Privé Page Theme v2026 Lock

Status: Active memory lock
Source: `mmd-prive-page-theme-migration-v2026.md`
Updated: 2026-08-04
Scope: Webflow public pages, public acquisition pages, profiles, hall, public access, membership, trust pages, and customer-facing confirmation pages.

## 1. Core direction

MMD Privé public pages must use the new public white-world theme.

Canonical theme name:

```text
White / Ink / Stone / Wine / Legacy Red Accent
```

MMD Privé is not beige-gold hotel luxury, champagne wedding tone, black-gold SIGIL, nightclub, cyberpunk, lounge, or generic luxury.

Mood:

```text
clean / private / sharp / premium / editorial / discreet
not too sweet / not too beige / not gold-dominant
```

## 2. Global CSS requirement

All public Webflow pages should load the global theme CSS:

```html
<link rel="stylesheet" href="https://mmd-prive.github.io/mmd-i18n/assets/css/mmd-global.css?v=2026-world-03" />
```

Global font stack:

```css
--mmd-font-main:"LINE Seed Sans TH","Noto Sans Thai",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
--mmd-font-th:"LINE Seed Sans TH","Noto Sans Thai",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
```

## 3. Required world classes

Public / White World:

```html
<main class="mmd-prive mmd-page-light">
  ...
</main>
```

Profiles / Companion:

```html
<main class="mmd-prive mmd-profiles mmd-page-light">
  ...
</main>
```

Quick patch wrapper:

```html
<main class="mmd-prive mmd-page-light mmd-prive-theme-v2026">
  ...
</main>
```

Partner bridge or private trust pages may use SIGIL only when the page is genuinely private trust:

```html
<main class="sigil-system mmd-page-dark">
  ...
</main>
```

## 4. Canonical tokens

```css
:root{
  --prive-white:#ffffff;
  --prive-paper:#fbfaf8;
  --prive-ivory:#f8f7f5;
  --prive-stone:#efebe6;
  --prive-line:#dfdadd;

  --prive-ink:#18171b;
  --prive-charcoal:#2a2730;
  --prive-soft:#555158;
  --prive-muted:rgba(24,23,27,.58);

  --prive-wine:#941523;
  --prive-wine-deep:#68111c;
  --prive-legacy-red:#c91e35;
  --prive-rose:#f8eef0;

  --prive-gold-soft:#b98a3e;
}
```

## 5. Page colour balance

```text
60% White / ivory / paper / stone
25% Ink / charcoal / smoked glass
10% Wine red
3% Fresh legacy red
2% Soft gold accent
```

Gold is an accent only. Use it for tiny trim, thin logo lines, micro dividers, or subtle metallic reflections. Never let gold become the main mood of a public page.

## 6. Public page CSS patterns

Background:

```css
background:
  radial-gradient(circle at 92% 0%,rgba(148,21,35,.045),transparent 26rem),
  linear-gradient(180deg,#ffffff 0%,#fbfaf8 45%,#f8f7f5 100%);
```

Headline:

```css
.mmd-prive-heading{
  color:#18171b;
  font-family:var(--mmd-font-th);
  font-weight:600;
  letter-spacing:-.04em;
  line-height:1.02;
}
```

Body:

```css
.mmd-prive-copy{
  color:#555158;
  font-family:var(--mmd-font-th);
  font-size:16px;
  font-weight:400;
  line-height:1.78;
}
```

Legacy red cut:

```css
.mmd-red-cut{
  width:42px;
  height:2px;
  border-radius:999px;
  background:#c91e35;
}
```

Primary CTA:

```css
.mmd-btn-primary{
  color:#fff;
  background:linear-gradient(135deg,#c91e35,#8e1020);
  box-shadow:0 16px 34px rgba(148,21,35,.18);
}
```

Card:

```css
.mmd-prive-card{
  border:1px solid rgba(24,23,27,.10);
  border-radius:24px;
  background:rgba(255,255,255,.78);
  box-shadow:0 18px 48px rgba(25,20,23,.07);
  backdrop-filter:blur(18px);
  -webkit-backdrop-filter:blur(18px);
}
```

## 7. Red accent placement

Use legacy red only for controlled accents:

- primary CTA
- small divider under headline
- active nav underline
- card corner marker
- small icon stroke
- tiny dot beside label
- form focus ring
- selected package border
- hover detail

## 8. Footer rule

Public pages use:

```text
MMD Public Footer
components/webflow/mmd-public-footer.html
```

SIGIL / partner private trust pages use:

```text
SĪGIL Trust Footer
components/webflow/sigil-trust-footer.html
```

## 9. Migration checklist

```text
[ ] Page has correct world class
[ ] Global CSS uses ?v=2026-world-03
[ ] Main background is white / paper / stone
[ ] Text uses ink and soft ink
[ ] CTA uses wine-red / legacy red
[ ] Fresh red appears as small accent
[ ] Gold is secondary only
[ ] Footer is correct component
[ ] Mobile has readable contrast
[ ] No beige-gold hotel mood
[ ] No SIGIL black-gold mood on public pages
```

## 10. Current route notes

`/confirm/public-access-received` should be migrated from a near-theme page to a fully locked MMD Privé v2026 page by adding:

- `mmd-prive mmd-page-light mmd-prive-theme-v2026` to the root wrapper
- global CSS link if not already present
- legacy red CTA gradient `#c91e35` to `#8e1020`
- a small red cut under the headline
- MMD Public Footer style
- no visible internal/SIGIL language

The page may use the `HEro Sport.webp` asset for the hero when the older hero crop causes head cut-off.

## 11. Final rule

```text
MMD Privé = White world with memory of red.
White keeps it clean.
Ink keeps it private.
Stone keeps it premium.
Wine-red carries action.
Fresh legacy red preserves the first logo identity.
Gold stays quiet.
```
