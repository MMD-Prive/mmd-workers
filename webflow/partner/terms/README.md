# SĪGIL Partner Terms · V4 / Design 7.1

Live route: https://www.mmdbkk.com/partner/terms
Webflow page: 69eeb9805a1922a3cf7418f9
Published: 2026-09-21, both mmdbkk.com custom domains and Webflow staging.

## Source placement
- `terms.html`: existing page HtmlEmbed.
- `terms.css`: scoped CSS compiled into `page-head.html`.
- `terms.js`: existing consent/API logic plus `motion.js`, compiled into `page-footer.html`.
- `baseline.json` and `original-*`: pre-change rollback source.

## Verification
- All existing visible agreement text retained. Agreement version is `modeling_partner_terms_v4_2026-09-21`.
- Partner Structure, Bridge, and Profit Share use the approved 3:4 Yuki image set; Hero and Co-Partner imagery remain unchanged.
- Verification endpoint, acceptance payload, token propagation, and dashboard redirect logic preserved.
- JavaScript syntax checked; no duplicate IDs or broken internal anchors; one H1.
- Webflow staging inspected at desktop and 320/390px iframe viewports (305/375px content width with scrollbars). No horizontal overflow.
- Nested chapter navigation, previous/next, Escape, focus return, and scroll unlock exercised.
- Anchor scrolling clears the sticky header; page-level handler avoids competing Webflow scrolling.
- Reduced-motion CSS removes decorative movement; live device preference toggling was not exercised.
- No-token consent remains disabled. No real agreement was accepted during visual QA.
- Production HTML confirms design 7.1, Terms V4, and removal of the temporary staging responsive wrapper.
- Production image smoke test confirms all five page images load; the three new assets resolve at 1086 × 1448 with no horizontal overflow.
- Production menu opened and closed. Additional geometry reads hit browser tooling timeouts; staging layout checks and production screenshot completed.

Webflow has no page branching entitlement on this site. Before full-site publishing, all 329 static pages were checked; only /partner/terms had changed since the last production publish. Existing unrelated Worker changes in this checkout were not part of this task.
