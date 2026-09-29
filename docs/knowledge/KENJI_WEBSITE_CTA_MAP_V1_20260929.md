# Kenji Website CTA Map V1 — 2026-09-29

Status: owner-authorized knowledge/runtime routing map  
Owner: Boss Per  
Scope: customer-safe website CTA guidance for Kenji AI / Per Voice

## Core rule

Kenji may explain and route. A CTA click, page visit, form submit, slip upload, membership selection, TMIB browse action, or booking request never becomes payment, entitlement, availability, booking, approval, VIP/SVIP/Black Card, or private-access truth by itself.

Never invent URLs, payment references, amounts, access, or confirmation states.

## Public Membership

Current server-owned catalog:

| Package | Price | Base term | Customer meaning |
| --- | ---: | --- | --- |
| MMD Member | 690 THB | 1 year | Public entry tier for MMD Companion services within each freelancer's current service scope |
| Elite | 4,990 THB | 2 years | Premium/public-visibility talent lane plus Exclusive MMD news, subject to current visibility |
| Red Card | 11,499 THB | 1 year | Highest Public MMD tier for more confidential options and special date/dining opportunities when available |

Public Membership CTA:
- select package: `/pay/membership`
- exact backend-issued payment: `/pay/checkout?t=...`
- TMIB discovery / companion preference exploration: `/tmib`

Red Card is a **Public** tier. It is not Black Card, VIP or SVIP.

Browsing or indicating a preferred TMIB person does not confirm that person's availability or assignment.

## Public world

| Intent | CTA |
| --- | --- |
| Public navigation hub | `/hall` |
| Let MMD help find/match | `/find` |
| Browse public-safe profiles | `/profiles` |
| MMD Companion information | `/services/companion` |
| Public Companion request | `/booking` |
| TMIB discovery | `/tmib` |
| TMIB stories | `/tmib/stories` |
| Public Membership | `/pay/membership` |
| Customer rules | `/rules/customer` |
| Explicit access/identity gate only | `/public/access` |

`/public/access` is not a generic membership signup or payment CTA.

## Website member account

The current global website member control follows:
- no verified session → `/member/login`
- verified session → `/member/profile`

Do not send a known online member back through a new-customer welcome/login flow unless the session is actually unavailable.

## LINE / MY MMD

Direct LINE status stays in the Worker-rendered LIFF Digital Home:

`https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status`

The separate web MY MMD presentation remains available:
- `/my-mmd/`
- `/my-mmd/profile`
- `/my-mmd/membership`
- `/my-mmd/points`
- `/my-mmd/history`
- `/my-mmd/coupons`
- `/my-mmd/payments`
- `/my-mmd/orders`

Other member routes:
- customer requests → `/member/requests`
- generic payment list/status fallback → `/member/payments`

Direct `intent=status` traffic must not be automatically handed to the separate `/my-mmd/` web presentation.

## Payment

Public Membership / TMIB:
- selection/intake → `/pay/membership` or the relevant TMIB flow
- exact signed payment/proof → `/pay/checkout?t=...`

Private Membership / service:
- selection/intake → `/sigil/member/membership`
- renewal → `/sigil/member/membership?source=line&intent=renew`
- exact signed payment/proof → `/sigil/pay?t=...`

Payment status/navigation:
- in MY MMD → `/my-mmd/payments`
- generic fallback → `/member/payments`

Never mint `payment_ref`. Preserve the exact backend-issued signed URL. Proof remains evidence until Official Verify.

Do not emit these as fresh/default CTAs:
- `/sigil/pay/renew`
- `/sigil/pay/renewal`
- `/pay/renewal`
- `/confirm/payment-proof` as a default new-payment route

## Private / SIGIL

| Intent | CTA |
| --- | --- |
| SIGIL/private entry | `/sigil/start` |
| Private Standard/Premium membership | `/sigil/member/membership` |
| Private renewal | `/sigil/member/membership?source=line&intent=renew` |
| Private booking | `/sigil/booking` |
| Private care/recovery | `/sigil/recovery` |
| Black Card information | `/blackcard/black-card` |
| Exact private/service payment | backend-issued `/sigil/pay?t=...` only |

Black Card information is not approval or eligibility.

Use `/sigil/recovery`, not stale `/recovery`, for new customer guidance.

## MMS / Male Massage

- home → `/male-massage/home`
- how to use → `/male-massage/how-to-use`
- pre-booking → `/male-massage/member/mms-booking`
- Partner Venue / Relax Spa → `/male-massage/therapists/relax-spa`
- Therapist application → `/apply/mms-therapist`

## Partner

- Partner home → `/partner`
- intake → `/partner/apply`
- Modeling Partner → `/partner/apply?partner_type=modeling`
- Client / Referral → `/partner/apply?partner_type=client_referral`
- Service Partner → `/partner/apply?partner_type=service`
- Private Access intake → `/partner/apply?partner_type=private_access`
- friend/model referral → `/partner/model/recommend-model-apply?source=model-to-model`
- Partner login → `/sigil/model/dashboard/partner-login`
- terms → `/partner/terms`
- dashboard → `/partner/dashboard`

## Model

- Public Model application → `/apply/public-model`
- Public Model onboarding → `/apply/public-model/onboarding`
- Model self-service → `/sigil/model/dashboard`
- Model rules → `/rules/model`

## MMD Shop

- shop → `/mmd-shop`
- order flow → `/mmd-shop/order`
- shop rules → `/mmd-shop/rules`
- customer orders → `/my-mmd/orders`

## CARE BACK

- main → `/promotion/6-years-care-back`
- Wish → `/promotion/6-years-care-back/wish`
- coupon continuation/wallet → `/my-mmd/coupons`

## TMIB

- discovery → `/tmib`
- stories → `/tmib/stories`
- ACT 001 → `/tmib/act-001`

When a Public Membership customer asks which TMIB person they are interested in, `/tmib` is the approved discovery CTA. Preference does not become availability, assignment or booking truth.

## Voice behavior

Do not dump this whole route map unless the customer explicitly asks for choices. In normal conversation:
1. answer the question;
2. give the single most relevant CTA;
3. add one short boundary only when needed.

Examples:
- "สมัคร Public ได้ที่นี่ครับ https://mmdbkk.com/pay/membership"
- "ถ้าอยากดูหนุ่ม TMIB ก่อน กดนี่ได้เลยครับ https://mmdbkk.com/tmib"
- "ถ้าอยากให้ MMD ช่วยคัดให้ เปิด /find ได้เลยครับ"
- "ถ้าเป็น Private renewal ใช้หน้านี้ครับ /sigil/member/membership?source=line&intent=renew"
