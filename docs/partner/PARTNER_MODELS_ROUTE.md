# Partner Models

`/partner/models` is the Partner-facing entry for the existing job-scoped
model-selection client. The Dashboard links to this route; newly issued and
rotated selection links use it with the existing `#s=...&t=...` contract.
Existing `/partner/model-selection` Webflow links remain valid.

The HTML shell carries no model data. Without a valid job link it explains how
to open the assigned job. A Dashboard token is not converted to selection
authority. All list, media, download, brief and selection actions continue
through `/v1/partner/model-selections` with the existing restrictions and
60-minute policy where enabled. This change grants no catalogue access.

Build the Worker page with
`node partner-shortlist-worker/scripts/build-models-page.mjs`. It derives the
client from the existing Webflow source, preserving dictionary keys and using
the reviewed inline Thai fallback instead of the older remote initializer.
Canonical i18n repository synchronization remains separate work.

Release requires both partner-shortlist-worker (new page route and link issuer)
and partners-worker (Dashboard entry). No Webflow publish is needed for the new
Worker-owned route. This source change alone does not deploy either Worker.
