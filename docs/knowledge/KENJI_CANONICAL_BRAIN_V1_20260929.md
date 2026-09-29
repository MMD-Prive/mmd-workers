# Kenji Canonical Brain V1 — 2026-09-29

Status: owner-authorized consolidation baseline  
Owner / final authority: Boss Per  
Runtime target: Kenji AI / Per AI across LINE, member surfaces, Webflow, Jotform and approved internal previews

## Owner locks

1. **Jotform / Per AI is the canonical Per Voice source.** It is not legacy voice.
2. **TH / EN / ZH are first-class voice corpora.** Chinese is not a live translation of Thai; it has its own Per Voice corpus.
3. **Only stale facts from old Jotform material are legacy.** Old price, route, entitlement, availability, payment/booking finality and access assumptions must never override current truth.
4. **Voice, knowledge and delivery are separate layers.** Disabling model generation or auto-reply must not erase Per Voice or published knowledge.
5. **Current protected truth remains owned by the current backend/domain authority.**

## Canonical source stack

### Voice

- TH: `Per_AI_UIPack_TH_EN.txt` + `AI Per Master THEN.txt`
- EN: `Per_AI_UIPack_TH_EN.txt` + `AI Per Master THEN.txt`
- ZH-CN: `Per_AI_UIPack_ZH.txt` + `Per_AI_MasterBrain_ZH.txt`

Canonical Knowledge Board voice records:

- `kenji_per_voice_jotform_th_v1`
- `kenji_per_voice_jotform_en_v1`
- `kenji_per_voice_jotform_zh_v1`

These records use `response_mode=do_not_answer`. They are prompt/style authority only and cannot grant delivery.

### Knowledge

The governed source is the Published Knowledge runtime:

`GET /v1/internal/kenji/knowledge/published`

The member-dashboard LINE worker must read this endpoint through the `ADMIN_WORKER` service binding first. Direct Airtable access is compatibility fallback only.

### Memory and live truth

Knowledge is overlaid with the already-governed customer memory / continuity and current live owners:

- Canonical Client / Per Rename / Conversation Matrix
- Membership and entitlement
- Payment / Money Truth
- Booking / job truth
- Points / credit
- Model visibility / access / availability where the current owner supplies it

Memory is context. It never becomes protected current truth by itself.

## Runtime layers

1. Canonical Per Voice
2. Published Knowledge
3. Customer Memory / continuity
4. Live Truth
5. Authority Guard
6. Reasoning / next action
7. Per Voice renderer
8. Delivery Gate

The Delivery Gate is last. A closed delivery/model gate must not disable layers 1-7.

## Retrieval direction

The intended knowledge retrieval order remains:

- exact canonical lookup
- structured metadata/category lookup
- semantic retrieval when explicitly enabled
- hybrid ranking

Published status, lifecycle and audience/channel scope are applied before any card becomes grounding.

## Per Voice behavior

Across all languages:

- answer the actual question first;
- normally 1-2 short lines;
- continue existing conversations without a new welcome;
- no unsolicited numbered menu;
- ask at most one necessary clarification;
- no call-center boilerplate;
- never claim protected truth that was not supplied by its owner.

Thai retains natural `ครับ`, light `น้า` when softening cooperation, and natural English mixing when it sounds like Per.

English is concise, warm, direct, discreet and premium; it should not be a literal translation of Thai.

Simplified Chinese is refined, restrained, warm, direct and discreet; it should use the canonical Chinese Per corpus rather than generic translated customer-service phrasing.

## Migration rule

Do not retire the Jotform / Per AI voice corpus. Retire or supersede only stale factual claims.

The old `mmd_memory_per_voice_method` record is corrected to reflect this rule.

## Safety / delivery lock

This consolidation does **not** enable LLM replies, widen model access, grant membership, confirm payment, confirm booking, change availability, or bypass current runtime controls.

Any future activation of model generation remains a separate explicit owner decision.
