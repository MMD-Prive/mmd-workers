# Internal UI Canon

## Favicon

All MMD internal browser surfaces under `/internal/*` use the canonical SIGIL-only favicon:

`https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0ea3f9421cae9dd223f50b_SIGIL%20only%20logo.webp`

This applies to Worker-owned admin surfaces (including Admin Login, Kenji and MMS) and is the expected icon for Webflow-owned internal presentation routes as well.

Public MMD and MMS favicon rules remain separate and must not overwrite `/internal/*`.

Internal HTML responses with Content Security Policy must allow `https://cdn.prod.website-files.com` in `img-src` so the canonical favicon is not blocked by the browser.

Production browser smoke must verify the canonical favicon URL and real admin DOM/API state, while ignoring only the expected `net::ERR_ABORTED` document navigation produced by the manual login redirect handoff.
