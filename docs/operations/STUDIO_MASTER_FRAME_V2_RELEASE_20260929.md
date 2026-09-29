# Studio Master Frame V2 — Production Closure

## Already in source

Master Frame V2 is the canonical Model card direction:
- 1322 × 1200;
- metallic silver / graphite-gunmetal frame family;
- small category accent only;
- Travel cyan/blue cue; no TRAVEL word;
- Extreme red cue; no EXTREME word;
- small approved logo at lower right;
- height / weight are numbers only;
- Standard / Premium / Foreign / Travel / Extreme use the canonical visible Model ID/name from `working_name`;
- GWs / EMs keep assigned RUN identity.

## Remaining production closure

### 1. Webflow Studio publish

Publish the staged Studio page only after confirming the staged footer contains the current Master Frame V2 selector source.

Do not claim live until Webflow publish succeeds.

### 2. Genuine card pilot

Use one active real Model with:
- canonical `working_name`;
- height and weight;
- approved/public-safe profile main;
- valid category;
- no unresolved identity conflict.

Flow:

```text
select main profile photo
-> exactly one card job
-> draft reaches Studio review
-> preview
-> approve
-> finished material reference returned to Studio
```

### 3. Visual acceptance

Confirm:
- correct real Model ID/name;
- correct `178 / 65` style, without cm/kg labels;
- correct logo;
- correct small accent;
- no category role text;
- no old split-panel / diagonal-seam design;
- GWs/EMs use RUN identity where applicable.

### 4. Activation

`MODEL_CARD_AUTO_ENABLED` stays off until the genuine pilot passes.

After pilot acceptance:
- enable in a controlled release;
- keep daily limit;
- observe first production jobs;
- disable immediately if duplicate generation, identity drift, wrong source photo, or stale approval appears.

## Rollback

Turning the generation feature flag off must stop new automatic jobs without deleting prior approved material.
