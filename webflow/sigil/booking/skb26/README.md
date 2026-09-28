# SIGIL Booking SKB26 page code

These two files are the repository source for the page-level freeform head and footer code on Webflow page `69dfc48bf362a5a92612f00a` (`/sigil/booking`). The active page contains `[data-skb25-root]`; the footer script installs SKB26 into that section. The separate `HtmlEmbed` with `#sigil-booking-kenji` is hidden legacy content and is not this renderer.

Provenance: the starting head `<style>` and footer `<script>` blocks were copied byte-for-byte from the published page HTML captured on 2026-09-26 at `https://www.mmdbkk.com/sigil/booking` (`/private/tmp/sigil-webflow-booking.html`). This branch then changes only those two extracted blocks for approved public media rendering and result-strip width. The captured page and Webflow `get_page_freeform_code` establish the owner; these files alone do not establish that Webflow has been updated or published.

When integrating, replace only the matching SKB26 `<style>` block inside the page's freeform head code and the matching SKB26 `<script>` block inside its freeform footer code, after reviewing the current Webflow values for drift. Preserve all other page-level and site-wide code, the page element tree, and the hidden legacy Embed. Publishing and production verification are separate steps.
