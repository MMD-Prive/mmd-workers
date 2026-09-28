# PARTNER_ACCESS_POLICY

## Purpose

This document defines the phase 3 **Partner Access Policy** for MMD.

The policy protects model visibility, client trust, and MMD authority when hotels, concierges, travel contacts, event partners, brand collaborators, or trusted introducers interact with the system.

Rule:

**Partner access should create controlled business opportunity without becoming a backdoor to protected models, direct deals, or internal authority.**

---

## Relationship to Partner Lane

This policy extends `PARTNER_LANE.md`.

Partner Lane defines the route and relationship category.

Partner Access Policy defines:
- what partner-side users may see
- what partner-side users may request
- what must remain hidden
- how protected model visibility is limited
- how direct-deal attempts are blocked
- when partner requests require manual review

---

## Canonical character alignment

### Yuki

Yuki owns partner-facing evaluation.

Use Yuki for:
- partner approval
- partner review
- partner gatekeeping
- partner value checks
- collaboration boundaries
- controlled negotiation tone

Yuki should be polite but sharp, evaluative, and value-focused.

### Ewvon

Ewvon owns Black Card and trusted access oversight.

Do not use Ewvon for ordinary partner access, payment flow, or normal member support.

If partner access touches Black Card-level trust, Ewvon may protect the deeper access layer, but Yuki remains bounded to Partner Division review.

### Kenji

Kenji may explain SĪGIL core routing, booking expectations, and client-lane next steps.

Kenji should not become the partner evaluator.

### TarT

TarT may support model-side readiness after an approved partner request becomes a model-facing brief.

TarT should not own partner approval.

---

## Partner access classes

Partner access should be classed before any visibility is granted.

Suggested classes:
- `lead`
- `unverified_partner`
- `verified_partner`
- `approved_partner`
- `restricted_partner`
- `suspended_partner`
- `internal_only`

### Lead

May submit interest and basic business context.

May not see model visibility, pricing logic, protected routes, or request status beyond acknowledgement.

### Unverified partner

May answer screening questions.

May not receive curated model options, direct contact, or availability signals.

### Verified partner

May submit structured requests and receive controlled follow-up.

May see generalized service categories and approved request status.

### Approved partner

May receive partner-facing coordination paths and curated outcome options.

May not receive raw roster visibility or protected model details unless separately approved.

### Restricted partner

May be limited to manual review only.

Use when the partner has incomplete trust, unclear source, direct-deal risk, or inconsistent request behavior.

### Suspended partner

May not submit new requests or receive model-related visibility.

Use when a partner violates access boundaries, attempts direct deals, misuses information, or creates safety risk.

---

## Allowed partner visibility

Approved partner surfaces may show:
- relationship status
- approved request scope
- controlled contact path
- generalized service categories
- high-level city or request coverage
- approved business-facing information
- curated outcome options
- manual review status
- next required action

Partner surfaces should be useful, but not revealing.

Rule:

**Partner usefulness should come from controlled service, not raw model visibility.**

---

## Restricted partner visibility

Partner surfaces must not show:
- protected model roster
- private model faces or identities
- direct personal handles
- direct contact details
- private model availability
- model-side console data
- exact travel willingness
- protected pricing logic
- admin notes
- operator notes
- Black Card authority logic
- internal exception workflows
- client private data unrelated to the partner request

Partners should not be able to infer hidden model supply from filters, empty states, timing patterns, filenames, image URLs, or route names.

---

## Anti-direct-deal rules

Direct-deal attempts must be treated as policy violations.

Direct-deal signals include:
- asking for a model's personal contact
- requesting off-platform negotiation
- attempting to bypass MMD payment
- asking a staff member to reveal private availability
- asking for a lower price outside official scope
- trying to continue a request without MMD mediation
- using partner status to pressure protected visibility

System response should:
- refuse direct contact exposure
- keep communication system-mediated
- move the request to manual review where needed
- flag repeated behavior
- restrict or suspend partner access for serious violations

Allowed framing:
- "MMD keeps model coordination inside the official review path."
- "We can continue through the approved partner channel."
- "Direct model contact is not available through this access level."

Not allowed:
- "Here is his private contact."
- "You can settle directly."
- "Partner status unlocks the model."
- "Payment can happen outside MMD."

---

## Protected model visibility limits

Protected models require stronger visibility limits.

Before explicit approval:
- do not show identity
- do not show face-first cards
- do not show private handles
- do not show direct contact
- do not show exact availability
- do not show movement patterns
- do not show internal suitability notes

After explicit approval:
- reveal only the minimum needed for the approved partner-facing action
- keep the audit trail of who approved the reveal
- keep contact mediated by MMD unless separately authorized
- avoid creating reusable links that expose protected identity beyond the approved window

Rule:

**Protected-model visibility is granted by approval, not by partner status alone.**

---

## Partner-originated request flow

Recommended flow:

```txt
Partner inquiry
-> partner screening
-> Yuki review
-> request scope approved or declined
-> client lane or travel request created
-> model fit review
-> protected visibility decision
-> official confirmation only after verification and matching
```

The partner may receive:
- request acknowledgement
- clarification questions
- approved scope
- next step
- manual review status
- controlled outcome

The partner must not receive:
- raw matching list
- internal ranking
- protected model details
- unofficial confirmation
- private client or model notes

---

## Escalation rules

Escalate to manual or founder-level review when:
- request involves protected model visibility
- partner asks for direct contact
- partner asks for off-platform payment
- request involves travel or unusual location
- request creates brand, legal, safety, or reputation risk
- partner tries to use relationship pressure
- request touches Black Card or trusted access authority

Boss Per may be used only for a short authority note or final standard-setting moment.

Ewvon may be used only when the request touches Black Card-level trusted access.

---

## Suggested route family

Examples:
- `/partner`
- `/partner/inquiry`
- `/partner/apply`
- `/partner/status`
- `/partner/request`
- `/partner/review`

Do not use Model Lane routes for partner access.

Model-facing follow-up routes must stay under:
- `/sigil/model/client-brief?t=TOKEN`
- `/sigil/model/console?t=TOKEN`

Never put `?t=...` in the Webflow page name. Use token query parameters only in real system-generated links.

---

## One-line definition

**Partner Access Policy lets MMD work with external business relationships while blocking direct deals, preserving protected model visibility, and keeping authority inside controlled review.**
