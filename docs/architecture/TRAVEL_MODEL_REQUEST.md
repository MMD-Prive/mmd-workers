# TRAVEL_MODEL_REQUEST

## Purpose

This document defines the phase 3 **Travel Model Request** flow.

Travel requests are higher-risk than ordinary local requests because they combine client intent, model fit, schedule, city, cost, privacy, and safety into one controlled decision.

Rule:

**Travel model requests must be client-facing enough to collect intent, but protected enough to prevent direct-deal routing or exposed model visibility.**

---

## What the flow is

The Travel Model Request flow is a controlled client-facing request path for sessions that may require a model to travel or meet outside the ordinary local operating context.

It exists for:
- destination requests
- city-specific availability review
- trip companion evaluation
- event or booking context review
- travel-window planning
- manual operator review
- protected model matching after verification

It is not:
- a travel roster
- a direct booking shortcut
- a partner marketplace
- a public availability calendar
- a way to negotiate with models directly
- a way to bypass verification, payment, or official matching

---

## Lane ownership

Travel Model Request belongs to the **Client Lane** until a model-facing brief is created.

Primary voice:
- Kenji for client guidance, expectation setting, verification reminders, and next-step clarity

Supporting roles:
- TarT for model-facing preparation after the request becomes an internal or model-side brief
- Boss Per for short authority notes when policy, safety, or final approval needs a human standard
- HYPE only for status or signal support, not as the main concierge

Not default:
- Yuki, unless the request is explicitly partner-originated and belongs to Partner Division review
- Ewvon, unless the request touches Black Card or trusted access review

---

## Required request fields

The request form or guided chat should collect only what is needed to evaluate the request.

Recommended fields:
- destination city or area
- requested date window
- expected duration
- session type or context
- number of guests where relevant
- accommodation or transport responsibility
- budget class
- language preference
- client verification status
- special constraints
- consent to official review

Avoid asking for:
- unnecessary personal identity details before the proper trust stage
- direct model contact preferences
- private model handles
- payment proof as confirmation language
- sensitive information unrelated to safety or booking review

---

## Decision states

Travel requests should move through clear states.

Suggested states:
- `draft`
- `submitted`
- `needs_client_clarification`
- `needs_verification`
- `under_review`
- `model_fit_review`
- `travel_feasibility_review`
- `quote_pending`
- `awaiting_payment`
- `payment_under_verification`
- `matched`
- `declined`
- `expired`
- `cancelled`

Rule:

**A travel request is not matched until official review, verification, and model fit are complete.**

---

## Client-facing language boundaries

Allowed:
- "Your request is under review."
- "We may need to verify details before preparing options."
- "Travel availability depends on model fit, schedule, and official approval."
- "Proof is received as supporting evidence only."
- "Confirmation happens after official verification and matching."

Not allowed:
- "This model is confirmed" before official matching
- "Payment proof confirms the booking"
- "You can contact the model directly"
- "Partner can arrange it outside MMD"
- "Any model can travel if the budget is high enough"

---

## Protected model visibility

Travel requests must protect model visibility more strongly than ordinary requests.

Before approval:
- do not show protected model identity
- do not show exact availability
- do not show travel willingness as a public attribute
- do not reveal private location or movement patterns
- do not show model-side notes

After approval:
- reveal only the minimum needed for the client-facing stage
- keep direct contact system-mediated unless a separate approved policy allows otherwise
- preserve the audit trail for who approved the reveal

---

## Partner-originated travel requests

If a hotel, concierge, travel contact, or external relationship source submits the request, route it through Partner Division first.

Partner-originated requests may collect:
- partner identity
- business relationship context
- client relationship to the partner
- requested service scope
- location and date window
- review contact path

Partner-originated requests must not receive:
- protected roster access
- direct model handles
- private pricing logic
- internal approval notes
- Black Card authority logic

Yuki may evaluate partner value and request legitimacy, but Yuki does not grant Black Card authority or protected model exposure by default.

---

## Suggested route family

Examples:
- `/sigil/client/travel-request`
- `/sigil/client/travel-review`
- `/sigil/client/request-status?t=TOKEN`

Model-facing follow-up routes must stay under:
- `/sigil/model/client-brief?t=TOKEN`
- `/sigil/model/console?t=TOKEN`

Never put `?t=...` in the Webflow page name. Use token query parameters only in real system-generated links.

---

## One-line definition

**Travel Model Request is the controlled client-facing flow for destination or travel-based model requests, with official review protecting fit, safety, payment truth, and model visibility before any match is confirmed.**
