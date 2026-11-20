# CODEXMIN V10 — Adaptive GPT Model Route Ledger

**This record is not a model-switch claim.** Routing logic is requested by the owner, but no active model selection or automated per-phase orchestrator is exposed in this ChatGPT-connected GitHub execution. This run used the current assistant for all phases; no GPT model was changed. The known assistant family is GPT-6; independent runtime model ID and reasoning effort are NOT_VERIFIED.

| Phase | Trigger | Preferred model (only if actually available) | Requested effort | Actual verified switch | Outcome |
|---|---|---|---|---|---|
| A Evidence inventory | GitHub/Airtable/Drive/Cloudflare search | GPT-6 Luna | Medium | MODEL_SWITCH_UNAVAILABLE | Source and runtime metadata gathered through read-only connectors |
| B Root cause | Production/source drift, Cookie trust boundary, conflicting campaign revisions | Strongest available security/reasoning model, e.g. Astra | High | MODEL_SWITCH_UNAVAILABLE | Causal paths separated; alternate hypotheses recorded |
| C Source implementation | Two-repo, server and QA guard changes | Strongest available coding model, e.g. Sol | High | MODEL_SWITCH_UNAVAILABLE | Review branches, tests, docs prepared |
| D Visual | No screenshot acceptance authorized in current task | Visual model only when available and needed | Medium | NOT_REQUESTED | No visual or authenticated acceptance claim |
| E Adversarial review | Forged approvals, origin/session isolation, wrong source SHA | Security reasoning model when available | High | MODEL_SWITCH_UNAVAILABLE | Fail-closed source guards and adversarial fixtures |
| F Report | Reviewed source + CI/readback summaries | Fast available model | Medium | MODEL_SWITCH_UNAVAILABLE | Honest status with unresolved evidence |

For every future automatic switch record:

```text
PHASE_ID:
EVIDENCE_TRIGGER:
REQUESTED_MODEL:
REQUESTED_REASONING:
ACTUAL_MODEL_ID_FROM_RUNTIME: NOT_VERIFIED | exact output
ACTUAL_REASONING_FROM_RUNTIME: NOT_VERIFIED | exact output
SWITCH_METHOD: unsupported | interactive | new Codex CLI/SDK invocation
SWITCH_CONFIRMED: NO until verified by supported metadata
CHECKPOINT_REF:
RESULT:
```

**Safe implementation concept:** a local Codex CLI/SDK orchestrator may launch a **new invocation per phase** with a model from the actual model catalog, passing a redacted checkpoint. A natural-language prompt cannot swap the model within an already running inference. Do not invent model IDs, log an unsupported switch as successful, or change live Kenji AI Worker model settings.

**Escalate** when multiple source owners conflict, auth/cookies/payment/privileges are involved, CI twice fails for same cause or evidence revisions disagree. **Downgrade** only after the causal issue is resolved. Speed and reasoning effort are separate controls. No high-cost parallel swarm or undisclosed automated work was launched.
