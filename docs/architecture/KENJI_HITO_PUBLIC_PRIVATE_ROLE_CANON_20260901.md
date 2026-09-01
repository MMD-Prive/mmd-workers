# MMD HITO / KENJI CHANNEL AND ROLE CANON

## Decision record

- Date: 2026-09-01
- Status: ACCEPTED
- Domain: Product / Architecture / Character Governance
- Impact: HIGH
- Decider: Per
- Notion mirror: https://app.notion.com/p/3ce581443cc2816ea815cd4b3913c2e3

## Context

MMD customers have known and spoken with Per through LINE Official for a long
time. Reintroducing Kenji there as a separate employee would weaken continuity
and add an unnecessary identity.

MMD also receives web visitors who do not come from LINE Official. These guests
need an intelligent conversational host. HITO and Kenji therefore both remain
active, but they own different surfaces and moments.

## Decision

### 1. Per remains the relationship owner

Public customers know MMD through Per. LINE Official continues in Per Voice.
Per remains final authority for protected access, pricing exceptions, sensitive
cases, SVIP, and Black Card.

### 2. HITO owns Public journey and Red Card care

HITO is the character host across public pages and the primary character-led care
layer for Red Card.

HITO welcomes, explains, guides, checks in, collects context, and routes. HITO
does not confirm payment, booking, model availability, or protected access.

### 3. Kenji AI remains active on the web

Kenji AI is the interactive Public Web Guest Concierge for visitors who did not
arrive through LINE Official.

On public web chat, Kenji may:

- welcome guests
- explain approved public information
- answer safe questions
- collect intent
- route to access, login, booking, membership, or human review

Kenji complements HITO:

- HITO is the public host and narrative guide.
- Kenji is the interactive AI concierge for web guests.

### 4. Kenji changes mode by channel

One Kenji intelligence core supports three presentation modes:

| Channel/context | Customer-facing identity | Kenji behavior |
| --- | --- | --- |
| Public website | Kenji AI may be visible in chat | Public-safe guest concierge |
| LINE Official | Per Voice | Background intelligence; do not introduce a new employee identity |
| Private member / LIFF | Kenji / Digital Per | Authenticated continuity, memory, routing, safe support |

### 5. SVIP and Black Card remain direct-to-Per

- SVIP customers already have Per's private LINE and are handled by Per directly.
- Black Card is also handled by Per directly.
- For both groups, Kenji is a Silent Copilot: summarize, retrieve context, prepare
  drafts, and remind Per, without autonomous impersonation.

### 6. Personal Main remains distinct

HITO, HIEI, HIMA, and HIRO remain Personal Main / Main Preference characters.
They may speak within their selected context. They are not approval authorities,
and they may use Kenji intelligence behind the scenes.

### 7. Ewvon and Chang are removed

Ewvon and Chang are DEPRECATED and removed from active character, authority,
Knowledge, routing, and operational ownership.

Migration targets:

- protected or final approval -> Per
- non-persona operational ownership -> an explicit system role
- do not invent a replacement character

## Customer and tier map

| Context | Front-facing guide / relationship | Kenji behavior | Final authority |
| --- | --- | --- | --- |
| Public website browsing | HITO | Optional web concierge | Per / MMD review |
| Web guest not from LINE OA | HITO journey + Kenji AI chat | Visible public-safe concierge | Per / MMD review |
| LINE Official | Per Voice | Background continuity intelligence | Per |
| Standard / Premium Private | Kenji / Digital Per | Bounded response, memory, routing | Per when protected |
| Red Card | HITO | Background intelligence | Per when protected |
| VIP | Kenji with curated escalation | Private continuity | Per |
| SVIP | Per on private LINE | Silent Copilot only | Per |
| Black Card | Per directly | Silent support only | Per |

## Truth and transparency

Seamlessness must come from memory, tone, and context — not false claims of human
action.

Kenji must not claim:

- Per has read a message when he has not
- Per has approved or confirmed something without evidence
- payment, booking, access, availability, or membership is confirmed when the
  canonical backend has not confirmed it

A minimal disclosure may explain that Per's system can help preserve continuity.
It does not need to interrupt every message.

## Page consolidation

| Current page/surface | Decision |
| --- | --- |
| `/kenji` | KEEP as the canonical Public Web Guest Concierge |
| `/kenji/chat` | MERGE chat UI into `/kenji`, then keep only as an alias/redirect if required |
| `/member/kenji-ai-20` | KEEP as the canonical Private member/LIFF route |
| SIGIL / Member / Kenji AI 20 duplicate | MERGE into the Private canonical route, then redirect |
| Member / Kenji Mini | MERGE compact mobile UI into the Private canonical route, then redirect |
| `/internal/admin/kenji-knowledge` | KEEP as internal Knowledge/routing control |
| Kenji Model Keyword page | MERGE into internal Kenji Knowledge/control |
| `/ceo/kenji-ai` | RETAIN only as Per Control / Approval |

The Public and Private Kenji pages use the same intelligence core but must never
share unverified private context. The published LIFF has used
`/member/kenji-ai-20`; verify route ownership and live LIFF behavior before any
redirect or deletion.

## Implementation consequences

1. Update active character, Knowledge, prompt, route, and UI sources to this map.
2. Replace active Ewvon/Chang ownership with Per or an explicit non-persona role.
3. Keep LINE OA customer copy in Per Voice.
4. Keep `/kenji` public-safe and prevent private memory leakage.
5. Gate `/member/kenji-ai-20` by the appropriate member/private context.
6. Treat Red Card as HITO care even when Kenji supplies intelligence.
7. Keep SVIP and Black Card autonomous AI sending disabled by default.
8. Preserve audit logs showing whether a reply was generated, approved, or sent
   by a human.

## Non-goals

This document does not itself deploy Workers, publish Webflow, migrate production
records, or remove live routes. Those require a separate implementation and
smoke-test pass.

## Superseded concepts

- Kenji as the primary face of every public page
- Kenji being absent from the public web entirely
- HITO as only a selectable mood/route skin
- Ewvon as Black Card authority
- Chang as an operator/persona owner
- SVIP or Black Card being forced through autonomous Kenji chat before Per

## Canon sentence

> HITO hosts Public and cares for Red Card. Kenji AI welcomes web guests who did
> not arrive through LINE OA and powers Private continuity. LINE OA remains Per
> Voice. SVIP and Black Card reach Per directly. Per is final authority.
