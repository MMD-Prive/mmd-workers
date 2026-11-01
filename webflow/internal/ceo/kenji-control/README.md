# Kenji owner flow

Webflow page `6a96df132b2ea7a1c8e7a19a`, `/internal/ceo/kenji-control`.

Apply `head.html` and `footer.html` to the corresponding page freeform blocks. The head includes `owner-flow.css`. Do not publish unrelated Worker changes.

The old brief URL `/v1/internal/ceo/brief` renders the site's 404. The replacement reads `/v1/admin/dashboard`, the same authenticated endpoint used by CEO Dashboard, and uses its `todos`, `boss`, and `generated_at` fields. Only same-origin normalized internal action links are rendered. No new write endpoint is introduced.

The injected LINE control element is moved, not cloned or recreated, preserving its handlers, disabled state, authorization, confirmation and version checks. Plain status copy distinguishes removal of the LINE stop command from proven end-to-end replies. The model stop command remains separate.

Both navigation collections remain available in collapsible sections. Page-scoped CSS fixes sidebar contrast, removes the competing fixed columns and provides a single-column mobile layout. Matrix keeps the deployed inspector's read endpoint and mounts after the host exists to avoid its former early-return race. Existing tab names and structural classes remain compatible with registered scripts.

Validation on 2026-10-25: script syntax; jsdom scenarios for populated, empty, 401, 503, network failure and non-JSON responses; retained internal query strings; rejection of external and normalized-outside paths; HTML escaping; Matrix tab switching; loading completion; unchanged disabled LINE button; no non-GET requests. Live audit confirmed the broken old brief route and working Dashboard data source. No production recipient, LINE control or message was changed during testing.

Webflow draft is prepared separately from publication. Mobile CSS is prepared; visual validation on staging/live remains a release check.
