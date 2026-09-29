# Studio Master Frame V2 production release

This release remains on hold until the staged Studio page is published and one production compcard flow is reviewed end to end.

## Required evidence

- Publish the staged Webflow page at /internal/admin/studio/upload.
- Record a production page smoke after that publish.
- Select one approved main profile photo for an active canonical Model.
- Confirm one card draft is created and appears in Studio review.
- Confirm the visible identity is correct:
  - Standard, Premium, Foreign, Travel and Extreme use the canonical working_name.
  - GWs and EMs use the assigned RUN identity.
- Confirm height and weight are numbers only, for example 178 / 65.
- Confirm no cm, kg, HEIGHT, WEIGHT, role, tier, TRAVEL or EXTREME label is printed on the finished card.
- Confirm the correct public/private logo and small category accent cue.
- Confirm the approved finished PNG/material reference returns to Studio.

## Activation rule

Keep MODEL_CARD_AUTO_ENABLED=false until every item above has production evidence.

The release evidence is recorded in ops/release-gates/studio-master-frame-v2.json. Moving that record to ready is a separate owner-reviewed change after the smoke is complete.
