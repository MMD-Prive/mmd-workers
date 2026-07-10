# Kenji Knowledge Room V1.4 Test Plan

## Architecture

Kenji Knowledge Room V1.4 is an internal admin-only knowledge card editor for Kenji client/member continuity answers. The Webflow internal admin page calls `admin-worker` only. Cards are stored in Cloudflare KV through the `KENJI_KNOWLEDGE_KV` binding.

Public Kenji chat does not consume this room in V1.4. The internal published endpoint is present for controlled system testing only.

## Endpoint List

- `GET /v1/admin/kenji/knowledge/list`
- `GET /v1/admin/kenji/knowledge/meta`
- `GET /v1/admin/kenji/knowledge/:id`
- `POST /v1/admin/kenji/knowledge/draft`
- `PATCH /v1/admin/kenji/knowledge/:id`
- `POST /v1/admin/kenji/knowledge/:id/publish`
- `POST /v1/admin/kenji/knowledge/:id/archive`
- `GET /v1/internal/kenji/knowledge/published`

## Auth Rules

Admin routes require one of:

- `Authorization: Bearer ADMIN_BEARER`
- `Authorization: Bearer ADMIN_API_TOKEN`
- `Authorization: Bearer ADMIN_TOKEN`
- `X-Confirm-Key` matching `CONFIRM_KEY`
- `X-Confirm-Key` matching `ADMIN_CONFIRM_KEY`
- `X-Confirm-Key` matching `X_CONFIRM_KEY`

Internal published route requires admin auth or one of:

- `Authorization: Bearer INTERNAL_TOKEN`
- `Authorization: Bearer KENJI_INTERNAL_TOKEN`
- `Authorization: Bearer SERVICE_TOKEN`
- `X-Internal-Token` matching `INTERNAL_TOKEN`
- `X-Internal-Token` matching `KENJI_INTERNAL_TOKEN`
- `X-Internal-Token` matching `SERVICE_TOKEN`

## KV Keys

- `kenji:knowledge:v1:card:{id}`
- `kenji:knowledge:v1:index`
- `kenji:knowledge:v1:published:index`
- `kenji:knowledge:v1:meta`

## Sanitizer Rules

The worker rejects knowledge content that contains emails, phone numbers, LINE identifiers, Telegram identifiers, Airtable record IDs, raw payment proof fields, raw payload markers, bank account markers, SWIFT/IBAN markers, API credentials, bearer tokens, confirm keys, private signing material, and pass phrases.

`kenji_safe_answer` is also rejected if it claims payment approval, marks paid, unlocks membership, grants VIP/SVIP/Black Card, overrides backend checks, or tells the client the real system does not need to be checked.

`related_routes` keeps only paths starting with `/` and strips `/internal/admin` and `/v1/admin` paths.

## Webflow Install Steps

1. Add the HTML from `webflow/internal/admin/kenji-knowledge/kenji-knowledge-v14.html` to the internal admin page at `/sigil/internal/admin/kenji-knowledge`.
2. Add the CSS from `kenji-knowledge-v14.css`.
3. Add the JS from `kenji-knowledge-v14.js`.
4. Confirm the root element keeps these data attributes:
   - `data-api-base="https://sigil.mmdbkk.com"`
   - `data-list-path="/v1/admin/kenji/knowledge/list"`
   - `data-draft-path="/v1/admin/kenji/knowledge/draft"`
   - `data-item-path="/v1/admin/kenji/knowledge"`
   - `data-meta-path="/v1/admin/kenji/knowledge/meta"`
5. Admin key is typed by the admin and stored in `sessionStorage` only.

## Curl Tests

Set local shell variables first:

```sh
BASE="https://sigil.mmdbkk.com"
ADMIN_KEY="replace-with-admin-key"
INTERNAL_KEY="replace-with-internal-key"
```

List should require auth:

```sh
curl -i "$BASE/v1/admin/kenji/knowledge/list"
```

List with auth:

```sh
curl -sS "$BASE/v1/admin/kenji/knowledge/list" \
  -H "Authorization: Bearer $ADMIN_KEY"
```

Create safe draft:

```sh
curl -sS "$BASE/v1/admin/kenji/knowledge/draft" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  --data '{"title":"Renewal next step","lane":"Renewal","audience":"member","language":"th","customer_question_examples":["ต่ออายุสมาชิกต้องทำยังไง"],"kenji_safe_answer":"Kenji แนะนำขั้นตอนต่ออายุได้ แต่ต้องรอระบบจริงยืนยันสถานะก่อนครับ","do_rules":["อธิบายขั้นตอนต่อไป"],"dont_rules":["ไม่ยืนยันแทนระบบ"],"escalation_rule":"ส่งต่อ Per เมื่อสถานะไม่ตรงกัน","related_routes":["/sigil/booking"],"updated_by":"per"}'
```

Publish by ID:

```sh
curl -sS "$BASE/v1/admin/kenji/knowledge/CARD_ID/publish" \
  -X POST \
  -H "Authorization: Bearer $ADMIN_KEY"
```

Read published cards for system testing:

```sh
curl -sS "$BASE/v1/internal/kenji/knowledge/published" \
  -H "Authorization: Bearer $INTERNAL_KEY"
```

## Validation Commands

```sh
node --check admin-worker/src/kenji-knowledge.js
node --check admin-worker/src/index.js
node --test admin-worker/test/kenji-knowledge.test.mjs
git diff --check -- admin-worker webflow docs
```

Forbidden file check:

```sh
git diff --name-only | grep -E "sigil-worker|partners-worker|mmd-redirect-worker|webflow/sigil/board" && echo "STOP: touched forbidden area" || echo "OK: no forbidden area touched"
```

Secret check:

```sh
Run the repo secret-pattern grep against the Webflow room, the Kenji worker module, and the Kenji worker test before deploy approval.
```

## Do-Not-Touch List

- `sigil-worker`
- `partners-worker`
- `mmd-redirect-worker`
- `webflow/sigil/board`
- Kenji Board files
- LINE publishing
- Webflow publishing
- Cloudflare deploys
- Merges

## V1.4 Locks

- No deploy.
- No LINE publish.
- No Webflow publish.
- No public Kenji consumption yet.
- Kenji may guide next steps, renewal, payment guidance, booking guidance, membership support, and escalation.
- Kenji must not approve, unlock, verify payment, grant VIP/SVIP/Black Card, or expose backend/private data.
