# Kenji Model Keyword — LINE Contract v1

## Scope

This contract adds a private model-keyword resolver to the actual LINE webhook owner:

- Worker: \`member-dashboard-chat-worker\`
- Entry: \`/webhooks/line\`
- Resolver: \`src/kenji-model-keyword.js\`
- Airtable base: \`MMD Commerce Operating System\`

It is separate from the public-safe Kenji Knowledge Board runtime.

## Lookup order

1. Read only profiles with \`status = Active\`.
2. Match the incoming text against \`model_key\` / folder name first, then working name and aliases.
3. Resolve the LINE user against \`Members\` and \`Clients\`.
4. If membership is expired, return text-only guidance. Do not send an image or price.
5. For EMs/GWs, require an allowed scope such as VIP, SVIP, Black Card, or #Potential.
6. Return only \`customer_safe_info\` and \`customer_safe_remark\`.
7. Route price questions to Per review wording. No offer-rule table is read by the customer reply.
8. A burst of three matching model queries within ten minutes returns the “choose three models” handoff and records the operational intent as \`model_keyword_burst\`.

## Data boundary

The resolver does not expose or read into the customer reply:

- private admin notes
- offer rules or customer-specific rates
- media assets or R2 URLs
- deposit/preview grants
- private eligibility criteria

Image delivery and comcard generation remain separate approval-gated modules.

## Airtable table configuration

The worker reads these configured table IDs:

- \`AIRTABLE_MODEL_KEYWORD_PROFILES_TABLE_ID\`
- \`AIRTABLE_MODEL_OFFER_RULES_TABLE_ID\`
- \`AIRTABLE_MODELS_TABLE_ID\`
- \`AIRTABLE_MEMBERS_TABLE_ID\`
- \`AIRTABLE_CLIENTS_TABLE_ID\`

The committed Cloudflare config keeps \`LINE_KENJI_MODEL_KEYWORD_ENABLED = "false"\`. The current Sin M profile is still in Review, so it cannot be returned by the runtime.

## Handoff and rollout

Burst detection is recorded through the existing Console Inbox sync as a safe operational signal. A direct Telegram send is not enabled in this patch because the active LINE worker has no confirmed Telegram service binding.

Before any production rollout, review:

- profile status and customer-safe copy
- member/client field mapping
- Console Inbox handoff handling
- optional KV binding for cross-request burst counting
- Cloudflare deployment approval

No Cloudflare deploy, merge, publish, R2 upload, or production mutation is part of this branch.
