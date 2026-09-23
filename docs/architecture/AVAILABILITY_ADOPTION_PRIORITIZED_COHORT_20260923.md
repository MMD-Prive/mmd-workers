# Availability Adoption — Prioritized Model Onboarding Cohort

Status: implementation
Date: 2026-09-23

## Goal

Move the remaining operational Availability backlog into MMD MODEL gradually without bulk messaging or inventing availability.

The cohort is an Owner-only projection inside Calendar. It does not grant access, send LINE messages, create availability snapshots, or mutate booking/payment truth.

## Canonical backlog

The live backlog before this phase contained 40 actionable rows but 39 unique canonical Model keys because EMs21 J Dye existed as two Airtable rows with the same Model key.

Cohort selection deduplicates by canonical Model key before ranking. When duplicates exist, the row with upcoming linked work, verified LINE readiness, and stronger linked-session evidence is preferred for the owner action.

## Priority order

1. SLA follow-up already due.
2. Upcoming linked Session within 14 days.
3. Verified LINE already connected and only first Availability confirmation remains.
4. Canonical identity repair.
5. Commercial/work-history signal:
   - approved private sales;
   - private/both sales layer;
   - Exclusive/Premium tier;
   - offer rule;
   - linked non-terminal Session history.
6. Remaining active operational backfill.

Within each band, nearer work, LINE readiness, commercial evidence, work history, and deterministic name ordering break ties.

## Batch rule

- current batch size: 5 Models;
- the next 5 are exposed only as a preview;
- remaining Models stay queued without action;
- the batch recomputes from canonical truth on every Calendar read.

No permanent priority score is written to Airtable.

## Current live cohort expected from 2026-09-23 evidence

1. EMs16 — upcoming confirmed work on 2 Oct 2026; LINE connected; first Availability confirmation required.
2. EMs21 J Dye — upcoming confirmed Partner/Kendo work on 4 Oct 2026; LINE activation required; duplicate Airtable row collapsed by canonical key.
3. Jasper OP — LINE connected; approved private/Premium commercial signal.
4. Simba — LINE connected; approved private plus work history.
5. Porto MJ — LINE connected; approved private commercial signal.

The list is a live projection and may change as Models connect LINE, confirm Availability, gain/lose upcoming work, or become non-operational.

## Safety

- `automatic_send=false`;
- `owner_click_required=true`;
- `no_guess=true`;
- activation link creation remains one Owner click per Model;
- Availability reminder remains one Owner click per Model and keeps the existing cooldown;
- fresh SIGIL snapshot is the only evidence that completes Availability coverage;
- no bulk action endpoint is added;
- no raw LINE user ID, token, activation URL, private note, or customer identity is added to cohort data.
