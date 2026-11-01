# MY MMD Renewal — CARE BACK / Premium signup correction

Owner clarification: 25 October 2026, following the merge of PR #2733.
Base source: 944350c20285b73d48411d1e5809ea5668c281ce.

## Confirmed commercial distinctions

- Premium signup is 2,999 THB for a normal two-year membership, not 2,999 THB per year. These two years must not be presented as a one-year signup plus a CARE BACK renewal bonus, or increased to three years by this UI change.
- Premium renewal retains one purchased year plus one CARE BACK year when the canonical offer qualifies: two years total.
- Standard renewal retains one purchased year plus 180 CARE BACK days when qualified. The existing 1,000 / 2,500 renewal amounts and spend qualification are unchanged here.
- Public campaign announcements currently run through 31 October 2026, Bangkok. The existing backend honors eligible canonical paid times strictly before 1 January 2027, Bangkok (through 31 December 2026). Marketing visibility must not gate payment eligibility.
- Do not disclose the internal year-end honoring boundary in customer copy. Do not hard-code the poster's relative five-day countdown into the page.
- The wish-related coupon is up to 10% off eligible services, separate from signup/renewal fees. The new CTA only opens the existing in-app Care view; it does not submit a wish, create a coupon, apply a discount or grant membership.

## Source edits

- Correct signup comparison labels in the existing Renewal view.
- Add a compact CARE BACK announcement and in-app Care CTA, visible only in the public announcement window.
- Display purchased renewal term, canonical bonus and resulting expiry separately. Footer and Premium total reflect the server offer; no bonus is invented for unknown history or an offer without bonus.
- Add a pure `isPrivateCareBackAnnouncementVisible` helper using existing canonical window constants. No existing payment, eligibility, promotion calculation or settlement function is changed.

## Verification

13 focused Node tests passed, covering October/November and December/January Bangkok boundaries, normal two-year Premium signup, one-plus-one Premium renewal, Standard +180 days, customer copy, zero/missing bonus and unknown-history guards.
Offline Chromium exercised the updated UI with synthetic data, checked campaign copy, unchanged amount, bonus total, Care navigation, no internal cutoff exposure, and no horizontal overflow at 320/360/390/430/768/1280 pixels. No page errors.
No real LINE mobile login, real payment or full repository suite is claimed. Tests and offline preview were executed without production bindings.

No merge, deploy, purchase-flag change, customer notification, payment creation, Points update, membership write or historic-record change is authorized/performed by this patch. Below-threshold pricing and tier-switch review remain unchanged.
