# HENNA · MMS Application Review Routing V1

**Status:** CANONICAL INTERNAL OPERATIONS DIRECTIVE
**Project:** MMS · Male Massage
**Date:** 2026-09-07
**Owner / final authority:** Per
**Audience:** HENNA · MMS Partner · authorized internal operators

## Purpose

HENNA must make every new MMS Therapist application easy to review for both Per and the authorized MMS Partner.

The operator must never have to hunt through Airtable, remember a route, or open a generic dashboard and search again after clicking a Telegram notification.

## Canonical review destination

Every MMS Therapist application notification must point to the exact application:

`https://mmdbkk.com/internal/admin/mms?tab=applications&application_id=<mmsapp_id>`

Example:

`https://mmdbkk.com/internal/admin/mms?tab=applications&application_id=mmsapp_1234567890abcdef12345678`

This is the single canonical review destination for both Per and the authorized MMS Partner. Authorization remains server-side and role-scoped.

## HENNA Telegram behavior

For every new application, HENNA should send a concise internal alert containing:

- event: new MMS Therapist application
- Application ID
- applicant display name / nickname when allowed
- current state: `New · Needs Review`
- missing / incomplete items when canonical data can prove them
- one primary CTA: `เปิดใบสมัคร`
- direct URL to the exact application

Preferred message shape:

```text
🔔 MMS · New Therapist Application

Applicant: <name or nickname>
Application ID: mmsapp_...
Status: New · Needs Review

เปิดใบสมัคร:
https://mmdbkk.com/internal/admin/mms?tab=applications&application_id=mmsapp_...
```

A Telegram inline button labelled `เปิดใบสมัคร` / `Review Application` is preferred when supported.

## Forbidden legacy behavior

HENNA must NOT tell Per or Partner to:

- `เปิด Airtable > MMS Therapist Applications`
- search Airtable manually for an Application ID
- open `/apply/mms-therapist`
- open a generic MMD application review page
- use `/partner/review` or other legacy generic Partner routes
- use a Telegram link that loses the `application_id`

Airtable may remain a canonical storage layer, but it is not the operator navigation destination.

## Deep-link UX contract

When the operator opens the canonical URL, the internal MMS admin surface should:

1. open the `Applications` tab
2. locate the matching `application_id`
3. scroll the matching application card into view
4. expand its details
5. highlight the selected application

The operator should land on the exact record that triggered the HENNA notification.

## Authentication return contract

If the operator is not authenticated, login must preserve the complete intended destination including query parameters.

Expected flow:

`Telegram / HENNA → Login → exact application`

The `next` target must preserve:

`/internal/admin/mms?tab=applications&application_id=mmsapp_...`

Do not reduce the return target to only `/internal/admin/mms`.

## Review / approval safety

HENNA is a routing and operations guardian, not an approver.

HENNA may surface the application and its completeness state, but must not independently approve, reject, enable Matching, change permissions, or mark a Therapist Ready.

After an authorized approval action, the newly created Therapist must still enter the safe review state:

`Review · Paused · Matching OFF`

until explicit readiness checks are completed.

## Canonical operator flow

```text
Applicant submits
      ↓
mms-worker stores canonical application
      ↓
HENNA sends exact deep link
      ↓
Per / MMS Partner opens exact application
      ↓
Review details + files
      ↓
Request info / Pause / Approve as authorized
      ↓
Therapist = Review · Paused · Matching OFF
      ↓
Readiness completion
      ↓
Matching may be enabled by an authorized action
```

## One-line HENNA rule

> **อย่าส่งคนไปหาใบสมัครเอง — ส่งลิงก์ไปที่ใบสมัครคนนั้นเลย**
