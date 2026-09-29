# Studio compcard finished material smoke checklist

Owner requirement: when a model selects a main profile photo, Studio should create/review finished compcard material using the selected photo, the canonical model name, and numeric height/weight formatting.

## Distinction

- Compcard: may show height/weight as numbers only.
- Advertising poster: do not show model stats unless explicitly requested as a compcard.

## Required stat format

Use:

```text
178 / 65
```

Do not use:

```text
178 cm / 65 kg
178CM / 65KG
HEIGHT 178 / WEIGHT 65
```

## Smoke flow

1. Confirm `MODEL_CARD_AUTO_ENABLED=true` in the target environment.
2. Confirm these bindings/secrets are present:
   - `MODEL_CARD_COORDINATOR`
   - `MODEL_CARD_BROWSER`
   - `MMD_MODEL_ASSETS`
   - `OPENAI_IMAGE_API_KEY`
   - `MODEL_CARD_MMD_LOGO_KEY`
   - `MODEL_CARD_SIGIL_LOGO_KEY`
3. Pick a model with:
   - active profile
   - canonical `working_name`
   - `height_cm`
   - `weight_kg`
   - one approved/public-safe main photo
4. Select the approved photo as `profile_main`.
5. Confirm exactly one card job is queued.
6. Confirm draft reaches Studio review.
7. Preview the draft.
8. Confirm the rendered card shows stats as numbers only, for example `178 / 65`.
9. Confirm Studio list/queue also avoids `cm`, `kg`, `HEIGHT`, and `WEIGHT` labels.
10. Approve the draft and confirm the finished material reference is returned to Studio.

## Fail-closed checks

- Missing name: no generation.
- Missing height or weight: no generation.
- Missing main photo: no generation.
- Source photo changed or approval revoked before review: stale draft cannot be approved.
- Approved material is not overwritten without a new version.
