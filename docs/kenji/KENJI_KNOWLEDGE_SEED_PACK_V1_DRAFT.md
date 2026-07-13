# Kenji Knowledge Seed Pack V1 Draft

Status: draft only

Primary rule: no published card equals no Kenji answer.

This pack converts the approved Drive and GitHub source pool into reviewable draft Kenji Knowledge Cards. It does not publish cards, change LINE behavior, change worker runtime, deploy anything, or modify routes.

## Approved Sources Used

- Google Drive: Kenji Knowledge Seed Sources V1
- Google Drive: Kenji LINE Knowledge Adapter - Live Test Passed
- Google Drive: Per_AI_UIPack_TH_EN.txt
- Google Drive: AI Per Master THEN .txt
- Google Drive: MMD_Daily_Sales_Template
- GitHub Issue #161
- GitHub Issue #56
- GitHub Issue #138
- GitHub Issue #47
- GitHub Issue #134
- GitHub Issue #46

## Safety Boundaries

- Draft cards are not live answers.
- Kenji answers only from reviewed and published cards.
- If no published card matches, Kenji falls back safely or routes to human support.
- Kenji may explain process, collect safe details, clarify routes, and route requests.
- Kenji must not approve payment, unlock membership, confirm model availability, confirm bookings, grant elevated access, or mutate backend state.
- Draft content must avoid raw identifiers, payment proof details, restricted links, personal data, restricted model data, and restricted operational notes.

## Lane Distribution

| Lane | Draft cards |
| --- | ---: |
| Payment | 8 |
| Membership/Renewal | 6 |
| Booking/How it works | 6 |
| Route guidance | 4 |
| Privacy/Boundaries | 3 |
| Support escalation | 3 |
| Total | 30 |

## Draft Card Index

| ID | Title | Lane | Status |
| --- | --- | --- | --- |
| kenji-pay-001 | Deposit Required To Hold A Booking | Payment | draft |
| kenji-pay-002 | Payment Verification Is Human Or Backend Confirmed | Payment | draft |
| kenji-pay-003 | Balance Due Explanation | Payment | draft |
| kenji-pay-004 | Payment Method Guidance | Payment | draft |
| kenji-pay-005 | Payment Status Pending | Payment | draft |
| kenji-pay-006 | Refund Or Cancellation Payment Boundaries | Payment | draft |
| kenji-pay-007 | High Value Payment Handoff | Payment | draft |
| kenji-pay-008 | Payment Fallback When No Card Matches | Payment | draft |
| kenji-member-001 | Travel Is Open While Prive Requires Membership | Membership/Renewal | draft |
| kenji-member-002 | Renewal Process Guidance | Membership/Renewal | draft |
| kenji-member-003 | Membership Status Cannot Be Self Claimed | Membership/Renewal | draft |
| kenji-member-004 | VIP SVIP And Black Card Are Review Only | Membership/Renewal | draft |
| kenji-member-005 | Membership Benefits Explanation | Membership/Renewal | draft |
| kenji-member-006 | Member Telegram Or Channel Access | Membership/Renewal | draft |
| kenji-book-001 | Booking Intake Details | Booking/How it works | draft |
| kenji-book-002 | Check Availability Is Not Confirmation | Booking/How it works | draft |
| kenji-book-003 | Travel Mode Booking | Booking/How it works | draft |
| kenji-book-004 | Private Or Prive Booking | Booking/How it works | draft |
| kenji-book-005 | Model Finder Manual Assist | Booking/How it works | draft |
| kenji-book-006 | Booking Status Definitions | Booking/How it works | draft |
| kenji-route-001 | LINE Entry Surface | Route guidance | draft |
| kenji-route-002 | Per AI Intent From LINE | Route guidance | draft |
| kenji-route-003 | Member Surface Continuity | Route guidance | draft |
| kenji-route-004 | Production Route Safety | Route guidance | draft |
| kenji-privacy-001 | Confidentiality Promise | Privacy/Boundaries | draft |
| kenji-privacy-002 | No Explicit Or Unsafe Detail | Privacy/Boundaries | draft |
| kenji-privacy-003 | No Raw Identifiers Or Proof In Replies | Privacy/Boundaries | draft |
| kenji-support-001 | Human Support Fallback | Support escalation | draft |
| kenji-support-002 | Urgent Or Sensitive Case Handoff | Support escalation | draft |
| kenji-support-003 | Potential Model Or Unknown Person Photo | Support escalation | draft |

## Review Notes

The JSON file is the canonical draft seed artifact:

- `docs/kenji/kenji-knowledge-seed-pack-v1.draft.json`

Reviewers should approve, edit, or reject individual cards before any separate publishing task. Publishing is intentionally out of scope for this seed pack.
