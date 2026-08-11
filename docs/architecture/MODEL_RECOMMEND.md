# MODEL_RECOMMEND

## Purpose

This document defines the phase 3 **Model Recommend** surface.

Model Recommend exists to help the client lane make a better next decision without turning protected talent into an open catalog.

Rule:

**Recommendation is a client-lane decision-support surface, not an open roster browser.**

---

## What Model Recommend is

Model Recommend is a controlled interpretation layer.

It may help a client understand:
- which type of model may fit the request
- what kind of session energy is appropriate
- which constraints need clarification
- whether manual review is needed
- whether the request should move to booking, travel, or support

It is not:
- a public roster
- a searchable model directory
- a popularity ranking
- a partner-facing shortlist
- a way to reveal protected models
- a way to bypass official booking or verification

The recommendation output should guide the next step, not expose the full supply side.

---

## Lane ownership

Model Recommend belongs primarily to the **Client Lane**.

It may read model-side signals, but it should not become a model-side console.

Allowed alignment:
- Kenji guides the client through fit, expectation, and next step
- TarT may inform model-side readiness logic behind the surface
- Boss Per may appear only as a short authority note when standards or final approval need emphasis

Not allowed:
- Yuki owning the recommend surface by default
- Ewvon being used for ordinary recommendations
- partner users receiving raw recommendation visibility
- clients seeing protected internal ranking logic

Rule:

**Kenji explains the fit. TarT helps prepare the model lane. The client never receives raw internal selection logic.**

---

## Input signals

The recommendation layer may consider:
- client intent
- desired city or travel need
- schedule window
- budget class
- session type
- language needs
- comfort and safety constraints
- membership status
- verification status
- previous client context where approved
- model availability class
- manual operator notes where approved

The surface should avoid collecting unnecessary personal details before the client has reached the proper trust or verification stage.

---

## Output rules

Recommended outputs should be abstracted and useful.

Good outputs:
- fit category
- recommended next step
- suggested request refinement
- availability class
- manual review needed
- "we can prepare a suitable option after verification"
- "this request should be routed to travel review"

Restricted outputs:
- full protected model identity
- direct personal contact
- private model handle
- internal model score
- private availability pattern
- model-side notes
- protected image sets
- partner-only assumptions

Rule:

**The client should receive confidence and direction, not unrestricted model visibility.**

---

## Protected model handling

Some models must remain protected even when they are a strong fit.

For protected models:
- do not expose identity by default
- do not show face-first cards in ordinary recommend surfaces
- do not expose exact availability
- do not expose direct contact
- do not make the model reachable through partner or concierge shortcuts
- route matching through official review

Allowed client-facing framing:
- "A protected option may fit this request."
- "This request needs private review before confirmation."
- "We can prepare a suitable match after verification."

Not allowed:
- "Here is the protected model."
- "Contact him directly."
- "This model is free at this exact time."
- "Partner access can unlock this model."

---

## Confirmation boundary

Recommendation is not confirmation.

A recommendation can say:
- likely fit
- possible fit
- needs review
- request mismatch
- route to booking

A recommendation must not say:
- officially confirmed
- model assigned
- payment verified
- proof accepted
- travel locked

Confirmation happens only after official verification and matching.

---

## Suggested route family

Examples:
- `/recommend`
- `/sigil/recommend`
- `/sigil/client/recommend`
- `/sigil/client/match-review`

Model-facing follow-up routes must stay under the Model Lane route family:
- `/sigil/model/console?t=TOKEN`
- `/sigil/model/client-brief?t=TOKEN`

Never put `?t=...` in a Webflow page name. Use token query parameters only in real system-generated links.

---

## One-line definition

**Model Recommend helps the client understand fit and next step while keeping protected talent, internal logic, and final confirmation inside controlled MMD review.**
