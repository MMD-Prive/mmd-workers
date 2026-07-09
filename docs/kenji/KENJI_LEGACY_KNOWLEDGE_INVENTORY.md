# Kenji Legacy Knowledge Inventory

Status: documentation-only audit and migration map. No runtime code changes, deploys, LINE publishing, Webflow publishing, merges, or route changes are authorized by this document.

Per AI is Kenji AI by context for V1 migration. Treat legacy "Per AI" references as older naming for the same client/member continuity assistant unless the source explicitly refers to Boss Per human authority.

## Migration Rules

- Do not import raw customer data.
- Do not import phone, email, LINE ID, or Telegram ID.
- Do not import payment proof URLs.
- Do not import bank/private details.
- Do not import raw Airtable record IDs.
- Do not import admin notes directly.
- Do not import secrets, tokens, passphrases, API keys, worker env values, or `.wrangler` cache contents.
- If a source contains mixed safe and unsafe content, mark it `partial` and require manual curation before moving wording into V1 docs.

## Architecture Alignment

- Kenji AI public/member chat currently lives in `member-dashboard-chat-worker` and in older `chat-worker` / `immigrate-worker` history.
- Rich Menu is wakeup/navigation only, not knowledge storage.
- Kenji Board / SIGIL Board is read-only command board context, not the chatbot brain.
- Telegram Preview is not Kenji AI chat unless a Telegram webhook to chat-worker/member-dashboard-chat-worker adapter exists.
- Memberstack is not current source of truth for Kenji AI V1 decisions. It can be a shell/display context only when sanitized by backend code.

## Inventory Summary

| Source | State | Purpose | Language | Safe to Migrate? | Risks | Recommended Target Category |
| --- | --- | --- | --- | --- | --- | --- |
| `Per_AI_UIPack_TH_EN.txt` | Missing | Named legacy UI/copy pack, likely bilingual Per AI/Kenji material. | Unknown, expected TH/EN | No until found | Unknown provenance; may contain obsolete claims, secrets, or unsafe authority wording. | `legacy_only_do_not_use` until recovered and curated |
| `chat-worker/src/ai-core/kenji/knowledge/jotform-per-ai-intelligence.md` | Missing | Named legacy JotForm/Per AI intelligence file. | Unknown | No until found | JotForm data may include form fields, customer data, operational notes, or old authority assumptions. | `legacy_only_do_not_use` until recovered and curated |
| `chat-worker/src/ai-core/kenji/engine.js` | Missing | Named legacy Kenji engine. | Unknown | No until found | Could contain old tool authority, prompts, or unsafe backend assumptions. | `legacy_only_do_not_use` until recovered and curated |
| `chat-worker/src/index.js` | Present | Current/legacy starter Cloudflare chat gateway using OpenAI or mock reply, optional KV history. | EN code/comments | Partial | Generic AI shell; no Kenji V1 boundaries; can store chat history; includes provider/env mechanics, not knowledge. | `legacy_only_do_not_use`, with architecture notes only |
| `chat-worker/index 2.js` | Present legacy copy | Older AI concierge draft with system prompt "MMD Prive concierge" and generic booking helper. | EN code/comments | Partial | Overbroad LLM prompt; lacks payment/member/VIP/Black Card guardrails; references generic member/prospect concierge. | `persona_canon` only after rewriting; otherwise `legacy_only_do_not_use` |
| `chat-worker/src/index 2.ts` | Present legacy copy | Older integration route for extracting preferences, model matching, reply draft, and human review flag. | EN code/comments | Partial | Runtime plumbing and debug shape, not Kenji canon; could imply model matching intelligence outside V1 scope. | `booking_guidance`, `escalation_rules` after curation |
| `chat-worker/README 2.md` | Present legacy copy | Old chat-worker AI integration notes and route/service expectations. | EN | Partial | Mentions upstream AI/admin routes and Telegram notification; not public reply knowledge. | `legacy_only_do_not_use`, architecture reference only |
| `chat-worker/wrangler 2.toml`, `chat-worker/.wrangler/*` | Present obsolete/local | Old local config/cache. | Config/cache | No | May contain local state or account metadata; never import as knowledge. | `legacy_only_do_not_use` |
| `shared/kenji-member-concierge-core.mjs` | Present | Intent classifier and safe reply templates for member concierge, including booking, payment slip, points, VIP/SVIP/Black Card, renewal, pricing, and Per AI/Kenji triggers. | TH/EN | Yes for curated copy; partial for logic | Includes status/points lines that must only use backend-safe context; do not import as automatic entitlement authority. | `safe_reply_templates`, `response_style`, `payment_guidance`, `membership_guidance`, `booking_guidance`, `escalation_rules`, `do_not_say` |
| `shared/kenji-member-memory-snapshot.mjs` | Present | Builds Kenji memory snapshot and customer-visible/safe context from client, entitlement, points, legacy, and conversation inputs. | EN code | Partial | Includes raw source fields such as record IDs, legacy LINE fields, summaries, handling notes; requires strict sanitized context gate. | `membership_guidance`, `context_contract`, `legacy_only_do_not_use` for raw fields |
| `webflow/member/kenji-ai-20/README.md` | Present | Webflow member-facing Kenji concierge route meaning and safety notes. | EN | Yes | Must not treat Webflow frontend as truth; demo-only fallback remains demo-only. | `route_guidance`, `payment_guidance`, `membership_guidance`, `do_not_say` |
| `webflow/member/kenji-ai-20/kenji-member-concierge.js` | Present | Webflow-safe member concierge facade with intent copy and frontend sanitization. | EN code/copy | Partial | Frontend copy can guide style but frontend member summary is not truth; points/status copy must be backend-confirmed before use. | `safe_reply_templates`, `response_style`, `payment_guidance`, `booking_guidance`, `membership_guidance`, `do_not_say` |
| `immigrate-worker/docs/line-per-ai-reply-copy-hotfix.md` | Present | Legacy Per AI reply-copy hotfix for `talk_to_per_ai`. | TH/EN | Yes, curated | Uses "Per AI" name and older exact copy; V1 should normalize to Kenji AI while preserving meaning. | `safe_reply_templates`, `response_style`, `escalation_rules` |
| `immigrate-worker/netlify/functions/webhook.js` | Present legacy/current compatibility | LINE webhook compatibility implementation with Kenji member intent routing, FAQ replies, pricing/model lookup paths, and safe reply calls. | TH/EN code/copy | Partial | Mixes public replies, Airtable logging, pricing review, model lookup, LINE webhook, and backend calls; do not import raw operational behavior wholesale. | `safe_reply_templates`, `payment_guidance`, `booking_guidance`, `route_guidance`, `escalation_rules`, `legacy_only_do_not_use` for runtime wiring |
| `immigrate-worker/netlify/functions/kenji-member-memory-context.mjs` | Present | Loads LINE identity-based memory from Airtable sources and builds Kenji safe context/customer profile. | EN code | Partial | Touches LINE IDs, Airtable records, entitlement rows, and legacy staging; only sanitized output can inform V1. | `membership_guidance`, `context_contract`; raw source maps remain `legacy_only_do_not_use` |
| `immigrate-worker/netlify/functions/webhook.kenji-memory.patch.diff` | Present | Patch record showing Kenji member memory integration into LINE webhook. | EN diff | Partial | Historical diff only; repeats raw integration pattern and debug categories. | `legacy_only_do_not_use`, migration trace |
| `member-dashboard-chat-worker/src/index.js` | Present current anchor | Current Kenji LINE candidate detection, `talk_to_per_ai` routing, LINE webhook, and scripted replies under `LINE_KENJI_AI_ENABLED`. | TH/EN code/copy | Yes for V1 anchors; partial for copy | Current source of runtime names, but still scripted/rules-based; do not treat as full LLM intelligence. | `safe_reply_templates`, `response_style`, `payment_guidance`, `booking_guidance`, `route_guidance`, `escalation_rules` |
| `member-dashboard-chat-worker/README.md` | Present current safety note | Safety contract for member dashboard chat worker and LINE/LIFF entry behavior. | EN | Yes | Operational deploy notes should not become customer-facing reply copy. | `do_not_say`, `escalation_rules`, `membership_guidance` |
| `docs/line/kenji-line-official.md` | Present current doc | Current LINE OA Kenji surface map, test phrases, env notes, and safety notes. | TH/EN | Yes, curated | Env names are implementation references only; do not expose to public replies. | `persona_canon`, `safe_reply_templates`, `route_guidance`, `do_not_say` |
| `docs/line/rich-menu-membership-mapping.md` | Present current doc | Rich Menu wakeup/navigation contract and LIFF identity safety. | EN | Yes, curated | Contains internal publisher endpoints and auth notes; keep public replies free of internal endpoints. | `route_guidance`, `membership_guidance`, `do_not_say`, `escalation_rules` |
| `docs/architecture/AD_CONTEXT_LEDGER.md` | Present | Pricing/ad inquiry context ledger and Kenji acknowledgement rules. | EN/TH examples | Yes, curated | Pricing review uses internal Per/Ewvon/Telegram flow; public Kenji should only acknowledge and collect safe details. | `payment_guidance`, `booking_guidance`, `safe_reply_templates`, `escalation_rules` |
| `docs/architecture/CLIENT_LANE.md`, `docs/architecture/CHARACTERS.md`, `docs/architecture/GLOSSARY.md`, `docs/architecture/ROUTES_AND_SURFACES.md` | Present | Canonical character/route/continuity framing for Kenji. | EN | Yes | Some docs include broader system doctrine and route internals; migrate only role/tone/route-safe concepts. | `persona_canon`, `response_style`, `route_guidance` |
| `docs/architecture/MODEL_LANE.md`, `docs/architecture/PARTNER_LANE.md` | Present | Defines where Kenji is not the default guide. | EN | Yes | Useful mostly as negative boundary, not reply copy. | `do_not_say`, `legacy_only_do_not_use` for model/apply private material |
| `webflow/sigil/board/*`, `webflow/sigil/board/README.md` | Present | Kenji/SIGIL Board Webflow display and read-only command board materials. | EN/TH code/copy | No for public chat; partial internal | Board is not chatbot brain; may contain internal advisory copy and runtime display logic. | `legacy_only_do_not_use`; internal-only `escalation_rules` |
| `sigil-worker/src/index.js` | Present | Read-only board API with sanitized status/queue. | EN code | Partial internal | Internal/operator advisory only; public Kenji chat must not read or expose board cards by default. | `escalation_rules`, `legacy_only_do_not_use` for public chat |
| `workers/sigil-board-worker/src/index.js` | Present | SIGIL Board fallback runtime with locked truths and Per AI keyword rule. | EN/TH copy | Partial | Board control-console context, not public chatbot source; useful locked truths only after curation. | `do_not_say`, `escalation_rules`, `legacy_only_do_not_use` |
| `telegram-worker/src/index.js`, `telegram-worker/lib/telegram.js`, `admin-worker/src/telegram.js`, `payments-worker/lib/telegram.js`, `events-worker/lib/telegram.js` | Present | Telegram notification/preview/internal messaging plumbing. | EN code | No for Kenji V1 chat | Telegram Preview is not Kenji AI chat; Telegram IDs/tokens/private channels must not enter Kenji context. | `legacy_only_do_not_use` |
| `ai-worker/src/services/retrieval.js` | Present | Older retrieval service combining Airtable and Memberstack profile status. | EN code | Partial | Memberstack is not current truth for Kenji V1; raw retrieval context may include private fields. | `legacy_only_do_not_use`; possible architecture caution |
| `webflow/sigil/access/*`, `webflow/sigil/private-models/*` | Present | Kenji voice in access/private model UI surfaces. | EN/TH code/copy | Partial | Access/model UI is not Kenji chat; may include private route/model visibility language. | `response_style`, `route_guidance`; private data boundaries as `do_not_say` |

## Missing Or Moved Named Sources

- `Per_AI_UIPack_TH_EN.txt`: not found in the working tree search.
- `chat-worker/src/ai-core/kenji/knowledge/jotform-per-ai-intelligence.md`: not found. The `chat-worker/src/ai-core/kenji/` tree is not present.
- `chat-worker/src/ai-core/kenji/engine.js`: not found. The `chat-worker/src/ai-core/kenji/` tree is not present.
- JotForm-specific Per AI knowledge: no file with the named path was found. Any future recovery should be treated as untrusted until manually reviewed for customer data and old authority claims.
- Webflow AI Agent materials: no single canonical "Webflow AI Agent" source file was found. Current Webflow Kenji material appears split across `webflow/member/kenji-ai-20/*`, `webflow/sigil/access/*`, `webflow/sigil/private-models/*`, and board snippets.

## Recommended Migration Order

1. **Current source anchors:** keep `member-dashboard-chat-worker/src/index.js`, `docs/line/kenji-line-official.md`, and `docs/line/rich-menu-membership-mapping.md` aligned with the V1 docs. These define current names, feature flags, wakeup behavior, and safety boundaries.
2. **Safe reply template curation:** manually extract safe, non-authoritative wording from `shared/kenji-member-concierge-core.mjs`, `webflow/member/kenji-ai-20/kenji-member-concierge.js`, and `immigrate-worker/docs/line-per-ai-reply-copy-hotfix.md`.
3. **Context contract curation:** use `shared/kenji-member-memory-snapshot.mjs` and `immigrate-worker/netlify/functions/kenji-member-memory-context.mjs` only to validate sanitized field concepts. Do not import raw source fields, record IDs, LINE IDs, notes, or legacy staging values.
4. **Route and channel boundaries:** migrate safe route/channel principles from `docs/architecture/*`, `docs/line/*`, and `webflow/member/kenji-ai-20/README.md`.
5. **Board and Telegram exclusions:** keep SIGIL/Kenji Board and Telegram worker materials as explicit non-sources for public Kenji chat, except for internal-only escalation or locked-truth summaries.
6. **Recovered missing files:** if `Per_AI_UIPack_TH_EN.txt` or JotForm knowledge files are recovered later, audit them last with manual redaction before any content enters V1.

## Suggested Category Mapping

| Target Category | Best Legacy Sources |
| --- | --- |
| `persona_canon` | `docs/architecture/CLIENT_LANE.md`, `docs/architecture/CHARACTERS.md`, `docs/architecture/GLOSSARY.md`, `docs/line/kenji-line-official.md` |
| `response_style` | `shared/kenji-member-concierge-core.mjs`, `webflow/member/kenji-ai-20/kenji-member-concierge.js`, `immigrate-worker/docs/line-per-ai-reply-copy-hotfix.md` |
| `safe_reply_templates` | `member-dashboard-chat-worker/src/index.js`, `shared/kenji-member-concierge-core.mjs`, `immigrate-worker/netlify/functions/webhook.js` |
| `payment_guidance` | `shared/kenji-member-concierge-core.mjs`, `webflow/member/kenji-ai-20/*`, `docs/line/kenji-line-official.md`, `docs/architecture/AD_CONTEXT_LEDGER.md` |
| `renewal_guidance` | `member-dashboard-chat-worker/CODEXMIN_RENEWAL_ROUTE_HANDOFF.md`, `shared/kenji-member-concierge-core.mjs`, `webflow/member/kenji-ai-20/*` |
| `membership_guidance` | `docs/line/rich-menu-membership-mapping.md`, `member-dashboard-chat-worker/README.md`, `shared/kenji-member-memory-snapshot.mjs` after curation |
| `booking_guidance` | `shared/kenji-member-concierge-core.mjs`, `member-dashboard-chat-worker/src/index.js`, `docs/architecture/AD_CONTEXT_LEDGER.md` |
| `route_guidance` | `docs/line/kenji-line-official.md`, `docs/line/rich-menu-membership-mapping.md`, `webflow/member/kenji-ai-20/README.md`, `docs/architecture/ROUTES_AND_SURFACES.md` |
| `escalation_rules` | `docs/line/*`, `shared/kenji-member-concierge-core.mjs`, `workers/sigil-board-worker/src/index.js` locked truths after curation |
| `do_not_say` | `member-dashboard-chat-worker/README.md`, `docs/line/rich-menu-membership-mapping.md`, `workers/sigil-board-worker/src/index.js`, `webflow/sigil/board/*` |
| `legacy_only_do_not_use` | Missing JotForm/UIPack files until recovered, `.wrangler` cache, Telegram workers, board runtime internals, old generic `chat-worker` AI shells |

## Notes For Future V1 Updates

- Normalize public copy from "Per AI" to "Kenji AI" unless quoting a legacy source or matching a known trigger phrase.
- Keep `talk_to_per_ai` as an implementation intent name if needed, but document it as a Kenji/Per handoff intent rather than a separate AI.
- Treat points as a visible/supporting signal only. Points must not grant VIP, SVIP, Black Card, payment confirmation, booking confirmation, or dashboard access.
- Treat payment proof as evidence only until official verification and fund matching.
- Treat Rich Menu and Telegram as channel/wakeup layers, not knowledge stores.
- Treat Webflow Kenji snippets as copy/style references only; they must not become truth sources.
