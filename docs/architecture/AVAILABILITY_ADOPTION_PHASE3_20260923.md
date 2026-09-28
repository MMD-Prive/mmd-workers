# Availability Adoption Phase 3 — Owner Recovery Queue + SLA

Status: implementation candidate
Date: 2026-09-23

## Goal

Turn Phase 2 recovery evidence into an owner-readable queue. This phase only tells the owner what needs an explicit next action and when a follow-up is due. It never assumes identity, availability, or delivery success.

## Sources of truth

- canonical Model key and LINE connection: Models record;
- availability confirmation: fresh SIGIL Availability Snapshot;
- owner action evidence: Phase 2 recovery evidence in the protected availability KV namespace.

The browser receives safe timestamps and recovery stages only. No activation URL, token, raw LINE ID, Telegram ID, or private notes are projected.

## Stages and actions

| Stage | Owner action |
| --- | --- |
| identity_recovery_required | Repair the canonical Model key |
| line_link_required | Issue a Model LINE activation link |
| line_link_issued_waiting_for_connection | Wait until verified LINE is connected, until the issued link expires |
| line_link_expired | Issue a new activation link |
| availability_confirmation_required | Send one explicit LINE reminder |
| reminder_sent_waiting_for_confirmation | Wait for the Model to confirm current status |
| reminder_follow_up_due | Review and optionally follow up manually |
| coverage_recovered | No action: fresh canonical availability arrived after recovery |
| coverage_current | No recovery action needed |
| source_unavailable | Restore source availability before any decision |

## SLA

- activation links: review at their canonical expiry;
- reminders: manual follow-up becomes eligible after 24 hours if no fresh snapshot exists;
- no automated follow-up, resend, or bulk action exists.

## Boundary

Calendar reads and sorts the recovery queue. It can issue a link or send one owner-triggered reminder only when the existing authority checks pass. Calendar never writes an availability snapshot or marks a Model connected/recovered by itself.
