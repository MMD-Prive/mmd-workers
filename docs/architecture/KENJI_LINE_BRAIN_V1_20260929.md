# Kenji LINE Brain V1 — 2026-09-29

Status: owner-authorized consolidation  
Owner: Boss Per  
Runtime: `member-dashboard-chat-worker`

## Purpose

Close the five remaining LINE intelligence gaps without widening any protected authority.

The canonical order is:

```
LINE ingress
  -> bounded message aggregation / dedupe
  -> canonical Model intent resolver
  -> Conversation Matrix continuity resolver
  -> explicit owner / Per takeover gate
  -> deterministic truth / approved Knowledge / guarded model canary
  -> second owner takeover check immediately before send
  -> proven delivery history
  -> post-turn Conversation Matrix write
```

Payment, membership, entitlement, points, booking, availability, pricing, access, private identity and approval remain owned by their current canonical backends.

## 1. One context resolver before reply

Every active direct LINE reply resolves `resolveKenjiLineContinuity` before customer copy.

The resolver supplies:

- current Conversation Matrix;
- effective intent;
- active Model context where still fresh;
- open-loop continuity;
- stale-state protection;
- canonical conversation hash.

The effective intent, not an isolated keyword result, is used for the final reply path.

After the turn, `writeKenjiLineMatrixTurn` persists the resulting state. Matrix memory is context only and cannot confirm protected truth.

## 2. Canonical conversation history

Actual customer messages remain separately stored in Console Inbox even if multiple messages are combined into one reasoning turn.

A Kenji/MMD outbound turn is conversation history only after LINE delivery succeeds.

When the guarded LLM lane is enabled for a canary, it may receive:

- at most the existing bounded Conversation History;
- only the last six proven turns in the model prompt;
- a bounded continuity summary;
- bounded open loops;
- a semantic relation such as continuation / correction / comparison / referential follow-up.

History never becomes payment, membership, booking, availability, pricing or access authority.

The full legacy LINE OA archive is still not replayed into every prompt.

## 3. Owner takeover / Per-is-speaking

Automatic replies are suppressed across ordinary, campaign and supplier lanes when an explicit human takeover is active.

Current evidence sources:

- Console Inbox customer thread in `processing`;
- `MMD — Kenji Conversation Controls` latest state:
  - `active` / `paused` -> suppress;
  - `released` / `resumed` -> clear;
- explicit human-takeover markers in Conversation Matrix.

Generic protected-truth handoff is **not** automatically treated as Per-is-speaking. This avoids silencing useful deterministic guidance simply because current truth requires a backend authority.

The takeover state is read a second time immediately before LINE send so a late Per takeover wins the race.

## 4. Message aggregation + dedupe

Production configuration:

- enabled: true
- wait: 650 ms
- burst window: 2,200 ms
- maximum messages per burst: 4

Same-webhook text fragments from one LINE user are combined immediately and only the last reply token may answer.

Cross-request bursts use the existing `KENJI_MODEL_DEDUPE` Durable Object with a hashed user key. Earlier events are suppressed if a later message arrives before claim. The latest event receives the bounded aggregate.

Raw customer messages are still persisted separately. Aggregation changes the reasoning turn, not the audit/history evidence.

## 5. Universal Model intent resolver

`resolveKenjiModelIntent` is the shared front door for:

- LINE card campaign Model triggers;
- GWs / EMs codes;
- ordinary Model codes;
- RUN syntax;
- working names / aliases supported by the guarded Model-access resolver.

Campaign operations may still have campaign-specific queue side effects, but identity lookup uses the same canonical Model query before access checks.

## Adaptive Brain

The production model remains GPT-5.6 and remains behind `LINE_KENJI_MODEL_ENABLED=false` until a separate owner activation.

Reasoning effort is selected per turn:

- simple standalone conversation -> low;
- correction, comparison, referential follow-up, continuation with meaningful context, longer input or multiple open loops -> medium.

This avoids making every LINE turn slower while giving contextual turns more reasoning budget.

## Delivery lock

This V1 does not enable model replies.

Current delivery authority remains separate:

- deterministic/approved reply gates operate as already authorized;
- model generation stays disabled in production;
- owner takeover and global runtime kill switches remain higher-priority than any generated answer.

## Regression expectations

CI must cover:

- same-user burst aggregation;
- cross-user separation;
- Durable Object latest-message claim;
- duplicate burst input;
- universal Model resolver;
- global owner takeover silence on non-campaign replies;
- adaptive reasoning selection;
- bounded conversation context;
- existing protected-authority and campaign guards.
