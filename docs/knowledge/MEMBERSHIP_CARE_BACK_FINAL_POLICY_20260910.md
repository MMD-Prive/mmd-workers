# MMD Private Membership + CARE BACK — Final Policy Lock

Status: CANONICAL
Effective: 2026-09-10 Asia/Bangkok
Owner / final authority: Per

## Precedence

This document is the final membership-duration and CARE BACK wording authority. It supersedes older website copy, implementation notes, and campaign documents **only where they conflict on Private Standard/Premium base duration or the tier-specific CARE BACK signup/renewal bonus**.

It does not replace the separate coupon, Wish, Points, identity, payment, or legacy-reconstruction rules unless this document explicitly says so.

## Private Membership base duration

| Tier | Base term | Signup price currently presented |
| --- | --- | ---: |
| Private Standard | **1 year** | 1,199 THB |
| Private Premium | **2 years** | 2,999 THB |

Rules:
- Premium must not be described as `1 year`, `per year`, or an annual package.
- Premium remains a **2-year base term**.
- Do not present Premium generically as `3 years`; the extra year below is conditional CARE BACK benefit, not the base package.

## Expanded CARE BACK for Private signup / renewal

For qualifying **Private Membership signup or renewal from August 2026 onward**, after canonical verification:

| Tier | CARE BACK bonus |
| --- | ---: |
| Private Standard | **+180 days** |
| Private Premium | **+1 full year** |

The bonus is separate from the base membership term.

Customer-facing interpretation:
- Standard = base 1 year; eligible CARE BACK adds 180 days.
- Premium = base 2 years; eligible CARE BACK adds 1 full year.

Do not flatten both tiers into a generic `current +180 days` or `membership +180 days` rule.

## Relationship to the original 6 Years campaign matrix

Older CARE BACK material may contain a status-based benefit such as `Current member (active/grace) +180 days`. That is a **specific 6-year campaign/current-member benefit path** and is not the universal duration rule for every new signup or renewal.

Where that historical/current-member card remains visible, its wording must clearly identify it as a verified campaign benefit so it cannot be mistaken for the Premium signup/renewal rule.

Existing former/expired/new-member Points, coupon, Wish, and historical reconstruction mechanics remain governed by their dedicated canon unless separately updated.

## Customer-facing authority

- Website copy explains the policy only.
- Payment verification remains with the canonical payment owner.
- Membership application/extension remains with the canonical membership owner.
- Final `active-through` / expiry shown in **My MMD** after verification is authoritative.
- Browser/Webflow copy must never invent or pre-apply eligibility, days, Points, payment truth, or membership state.

## Wish separation

The Birthday Wish is public and may be completed without membership verification.

Wish alone never grants:
- membership days
- CARE BACK membership bonus
- Points
- payment approval

Coupon verification may continue after Wish according to the separate Wish/Coupon canon.

## Required website sweep

The following routes must use the same duration language:

- `/`
- `/member/membership`
- `/sigil/member/membership/benefits`
- `/promotion/6-years-care-back`
- `/promotion/6-years-care-back/wish`

Required compact wording:

> Private Standard อายุพื้นฐาน 1 ปี · Private Premium อายุพื้นฐาน 2 ปี · CARE BACK สำหรับการสมัคร/ต่ออายุ Private ที่เข้าเงื่อนไขตั้งแต่ ส.ค. 2026: Standard +180 วัน · Premium +1 ปี · วันหมดอายุจริงยึด My MMD หลัง MMD ตรวจยืนยัน

## Release gate

A policy/wording release is complete only when:
1. the five Webflow routes no longer present conflicting Premium duration or tier bonus wording;
2. Webflow rules use this policy precedence;
3. GitHub canon contains this lock;
4. production Webflow publish is verified by the custom-domain publish timestamp.
