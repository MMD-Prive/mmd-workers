import fs from "node:fs";

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Expected source block not found in ${path}: ${before.slice(0, 120)}`);
  }
  fs.writeFileSync(path, source.replace(before, after));
}

const typesPath = "immigrate-worker/src/types.ts";
replaceOnce(
  typesPath,
  `  AIRTABLE_TABLE_POINTS_LEDGER?: string;\n  ENABLE_AIRTABLE_SYNC?: string;`,
  `  AIRTABLE_TABLE_POINTS_LEDGER?: string;\n  AIRTABLE_TABLE_MEMBERS?: string;\n  AIRTABLE_TABLE_MEMBER_ENTITLEMENTS?: string;\n  ENABLE_AIRTABLE_SYNC?: string;`,
);
replaceOnce(
  typesPath,
  `  AIRTABLE_SESSION_FIELD_EXPIRE_AT?: string;\n}`,
  `  AIRTABLE_SESSION_FIELD_EXPIRE_AT?: string;\n  AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD?: string;\n  AIRTABLE_ENTITLEMENT_MEMBERSTACK_ID_FIELD?: string;\n  AIRTABLE_MEMBERS_LINE_USER_ID_FIELD?: string;\n  AIRTABLE_MEMBERS_MEMBERSTACK_ID_FIELD?: string;\n  AIRTABLE_MEMBERS_EXPIRY_FIELD?: string;\n  AIRTABLE_MEMBERS_END_DATE_FIELD?: string;\n  AIRTABLE_MEMBERS_EXPIRE_AT_FIELD?: string;\n}`,
);

const airtablePath = "immigrate-worker/src/lib/airtable.ts";
replaceOnce(
  airtablePath,
  `} from "../types";\n\ntype AirtableValue =`,
  `} from "../types";\n\n// Canonical membership authority. Keep this resolver as the only source that may\n// interpret entitlement lifecycle; profile/session rows are expiry readback only.\n// @ts-ignore -- canonical resolver is JavaScript and intentionally shared across workers.\nimport { resolveMemberEntitlements } from "../../../auth-worker/src/member-entitlement-resolver.js";\n\ntype AirtableValue =`,
);
replaceOnce(
  airtablePath,
  `function clientsUrl(env: Env): string {\n  const table = encodeURIComponent(env.AIRTABLE_TABLE_CLIENTS || "Clients");\n  return \`https://api.airtable.com/v0/\${env.AIRTABLE_BASE_ID}/\${table}\`;\n}\n\nfunction headers(env: Env): HeadersInit {`,
  `function clientsUrl(env: Env): string {\n  const table = encodeURIComponent(env.AIRTABLE_TABLE_CLIENTS || "Clients");\n  return \`https://api.airtable.com/v0/\${env.AIRTABLE_BASE_ID}/\${table}\`;\n}\n\nfunction membersUrl(env: Env): string {\n  const table = encodeURIComponent(env.AIRTABLE_TABLE_MEMBERS || "Members");\n  return \`https://api.airtable.com/v0/\${env.AIRTABLE_BASE_ID}/\${table}\`;\n}\n\nfunction memberEntitlementsUrl(env: Env): string {\n  const table = encodeURIComponent(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || "MMD — Member Entitlements");\n  return \`https://api.airtable.com/v0/\${env.AIRTABLE_BASE_ID}/\${table}\`;\n}\n\nfunction envFieldList(...values: Array<string | undefined>): string[] {\n  return Array.from(new Set(values.flatMap((value) => String(value || "").split(",").map((item) => item.trim())).filter(Boolean)));\n}\n\nfunction exactStableIdentityMatch(\n  fields: AirtableFields | undefined,\n  input: { line_user_id?: string; memberstack_id?: string },\n  lineKeys: string[],\n  memberstackKeys: string[],\n): boolean {\n  const wantedLine = toStr(input.line_user_id);\n  const wantedMemberstack = toStr(input.memberstack_id);\n  const rowLine = pickString(fields, lineKeys);\n  const rowMemberstack = pickString(fields, memberstackKeys);\n  return Boolean(\n    (wantedLine && rowLine && rowLine === wantedLine) ||\n    (wantedMemberstack && rowMemberstack && rowMemberstack === wantedMemberstack)\n  );\n}\n\nfunction uniqueExpiry(values: unknown[]): string {\n  const unique = Array.from(new Set(values.map((value) => toStr(value)).filter(Boolean)));\n  return unique.length === 1 ? unique[0] : "";\n}\n\nasync function readResolverExpiry(\n  env: Env,\n  input: { line_user_id?: string; memberstack_id?: string },\n): Promise<string> {\n  if (!toStr(input.line_user_id) && !toStr(input.memberstack_id)) return "";\n  const rows = await listGenericRecords(env, memberEntitlementsUrl(env), { maxRecords: 100 });\n  const lineKeys = envFieldList(env.AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD, "line_user_id");\n  const memberstackKeys = envFieldList(env.AIRTABLE_ENTITLEMENT_MEMBERSTACK_ID_FIELD, "memberstack_id", "Memberstack ID");\n  const matched = rows.filter((row) => exactStableIdentityMatch(row.fields, input, lineKeys, memberstackKeys));\n  if (!matched.length) return "";\n\n  const snapshot = resolveMemberEntitlements(matched);\n  if (!snapshot || snapshot.schema_version !== "my_mmd_entitlement_resolver_v1" || snapshot.fail_closed !== true || snapshot.member_blocked === true) {\n    return "";\n  }\n\n  const entitlements = Array.isArray(snapshot.entitlements) ? snapshot.entitlements : [];\n  for (const lifecycle of ["active", "expiring_soon", "grace", "expired"]) {\n    const expiry = uniqueExpiry(\n      entitlements\n        .filter((item: Record<string, unknown>) => toStr(item?.lifecycle).toLowerCase() === lifecycle)\n        .map((item: Record<string, unknown>) => item?.expire_at),\n    );\n    if (expiry) return expiry;\n  }\n  return "";\n}\n\nasync function readVerifiedCanonicalMemberExpiry(\n  env: Env,\n  input: { line_user_id?: string; memberstack_id?: string },\n): Promise<string> {\n  if (!toStr(input.line_user_id) && !toStr(input.memberstack_id)) return "";\n  const rows = await listGenericRecords(env, membersUrl(env), { maxRecords: 100 });\n  const lineKeys = envFieldList(env.AIRTABLE_MEMBERS_LINE_USER_ID_FIELD, "line_id", "line_user_id");\n  const memberstackKeys = envFieldList(env.AIRTABLE_MEMBERS_MEMBERSTACK_ID_FIELD, "memberstack_id", "Memberstack ID");\n  const expiryKeys = envFieldList(\n    env.AIRTABLE_MEMBERS_EXPIRE_AT_FIELD,\n    env.AIRTABLE_MEMBERS_EXPIRY_FIELD,\n    env.AIRTABLE_MEMBERS_END_DATE_FIELD,\n    "Expire At",\n    "Membership Expiry",\n    "Membership End Date",\n    "expire_at",\n    "end_date",\n  );\n  const matched = rows.filter((row) => exactStableIdentityMatch(row.fields, input, lineKeys, memberstackKeys));\n  return uniqueExpiry(matched.map((row) => pickString(row.fields, expiryKeys)));\n}\n\nfunction headers(env: Env): HeadersInit {`,
);
replaceOnce(
  airtablePath,
  `    membership_status?: string;\n  },\n): Promise<ImmigrationLinkContext> {`,
  `    membership_status?: string;\n    expire_at?: string;\n  },\n): Promise<ImmigrationLinkContext> {`,
);
replaceOnce(
  airtablePath,
  `        target_tier: toStr(input.target_tier),\n        expire_at: "",\n        auto_signup_ready: !memberstackId,`,
  `        target_tier: toStr(input.target_tier),\n        expire_at: toStr(input.expire_at),\n        auto_signup_ready: !memberstackId,`,
);
replaceOnce(
  airtablePath,
  `  const latestSession = [...serviceHistory].sort((a, b) => {\n    const aTime = new Date(a.service_date || 0).getTime();\n    const bTime = new Date(b.service_date || 0).getTime();\n    return bTime - aTime;\n  })[0];\n\n  return {`,
  `  const latestSession = [...serviceHistory].sort((a, b) => {\n    const aTime = new Date(a.service_date || 0).getTime();\n    const bTime = new Date(b.service_date || 0).getTime();\n    return bTime - aTime;\n  })[0];\n\n  const resolvedMemberstackId = memberstackId || latestSession?.memberstack_id || "";\n  const stableIdentity = { line_user_id: lineUserId, memberstack_id: resolvedMemberstackId };\n  let resolverExpireAt = "";\n  let canonicalMemberExpireAt = "";\n\n  // V5 expiry precedence:\n  // verified explicit context -> canonical entitlement resolver -> verified Member readback\n  // -> latest matched Session -> blank. Profile readback never changes tier/status/access.\n  if (!toStr(input.expire_at)) {\n    try {\n      resolverExpireAt = await readResolverExpiry(env, stableIdentity);\n    } catch {\n      resolverExpireAt = "";\n    }\n  }\n\n  if (!toStr(input.expire_at) && !resolverExpireAt) {\n    try {\n      canonicalMemberExpireAt = await readVerifiedCanonicalMemberExpiry(env, stableIdentity);\n    } catch {\n      canonicalMemberExpireAt = "";\n    }\n  }\n\n  const resolvedExpireAt =\n    toStr(input.expire_at) ||\n    resolverExpireAt ||\n    canonicalMemberExpireAt ||\n    toStr(latestSession?.expire_at) ||\n    "";\n\n  return {`,
);
replaceOnce(
  airtablePath,
  `    membership: {\n      memberstack_id: memberstackId || latestSession?.memberstack_id || "",\n      status: toStr(input.membership_status) || (memberstackId ? "active" : "pending_signup"),\n      current_tier: toStr(input.current_tier),\n      target_tier: toStr(input.target_tier),\n      expire_at: latestSession?.expire_at || "",\n      auto_signup_ready: !memberstackId,\n    },`,
  `    membership: {\n      memberstack_id: resolvedMemberstackId,\n      status: toStr(input.membership_status) || (resolvedMemberstackId ? "active" : "pending_signup"),\n      current_tier: toStr(input.current_tier),\n      target_tier: toStr(input.target_tier),\n      expire_at: resolvedExpireAt,\n      auto_signup_ready: !resolvedMemberstackId,\n    },`,
);

const indexPath = "immigrate-worker/src/index.ts";
replaceOnce(
  indexPath,
  `    membership_status: input.membership_status,\n  });`,
  `    membership_status: input.membership_status,\n    expire_at: input.expire_at,\n  });`,
);

const wranglerPath = "immigrate-worker/wrangler.toml";
replaceOnce(
  wranglerPath,
  `AIRTABLE_TABLE_SESSIONS = "tblC98mKWbzmPuNzX"\nENABLE_AIRTABLE_SYNC = "true"`,
  `AIRTABLE_TABLE_SESSIONS = "tblC98mKWbzmPuNzX"\nAIRTABLE_TABLE_MEMBERS = "Members"\nAIRTABLE_TABLE_MEMBER_ENTITLEMENTS = "MMD — Member Entitlements"\nAIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD = "line_user_id"\nAIRTABLE_ENTITLEMENT_MEMBERSTACK_ID_FIELD = "memberstack_id"\nAIRTABLE_MEMBERS_LINE_USER_ID_FIELD = "line_id"\nAIRTABLE_MEMBERS_MEMBERSTACK_ID_FIELD = "memberstack_id"\nAIRTABLE_MEMBERS_EXPIRY_FIELD = "Membership Expiry"\nAIRTABLE_MEMBERS_END_DATE_FIELD = "Membership End Date"\nAIRTABLE_MEMBERS_EXPIRE_AT_FIELD = "Expire At"\nENABLE_AIRTABLE_SYNC = "true"`,
);

fs.writeFileSync(
  "docs/renewal-status-v5-resolver-aware-expiry.md",
  `# Renewal status v5 — resolver-aware expiry fallback\n\n## Authority\n\nMembership entitlement decisions remain owned by \`my_mmd_entitlement_resolver_v1\` over \`MMD — Member Entitlements\`. The Members table and Session rows are readback/fallback sources for \`expire_at\` only. They must never grant or widen tier, status, access, Points, or private visibility.\n\n## Expiry resolution order\n\n1. explicit \`expire_at\` already supplied by verified server context\n2. \`MMD — Member Entitlements\` evaluated through \`my_mmd_entitlement_resolver_v1\`\n3. verified canonical \`Members\` row matched only by exact \`line_user_id\` or \`memberstack_id\`\n4. latest already-matched Session \`expire_at\`\n5. blank / fail-closed\n\n## Safety locks\n\n- No display-name matching for entitlement or canonical Member expiry readback.\n- No profile fallback may set \`current_tier\`, \`status\`, access, Points, or capability.\n- Ambiguous multiple canonical expiry values resolve to blank.\n- Blocked entitlement snapshots resolve to blank.\n- Public renewal status does not accept a browser-provided authoritative expiry; explicit expiry is for verified server context only.\n- Existing Session matching behavior is retained as the last compatibility fallback.\n\n## Why v4 is superseded\n\nThe v4 patch allowed profile rows to resolve tier/status and allowed display-name/email profile matching. That predates the current My MMD entitlement authority model. V5 keeps only the useful expiry fallback while preserving Resolver governance and fail-closed behavior.\n`,
);

fs.writeFileSync(
  "immigrate-worker/test/renewal-expiry-resolver-v5-contract.test.mjs",
  `import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport test from "node:test";\n\nconst source = fs.readFileSync(new URL("../src/lib/airtable.ts", import.meta.url), "utf8");\nconst types = fs.readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");\nconst wrangler = fs.readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");\n\ntest("v5 uses the canonical resolver before readback fallbacks", () => {\n  const explicit = source.indexOf("toStr(input.expire_at) ||");\n  const resolver = source.indexOf("resolverExpireAt ||");\n  const member = source.indexOf("canonicalMemberExpireAt ||");\n  const session = source.indexOf("toStr(latestSession?.expire_at) ||");\n  assert.ok(explicit >= 0 && resolver > explicit && member > resolver && session > member);\n  assert.match(source, /resolveMemberEntitlements\(matched\)/);\n  assert.match(source, /snapshot\.fail_closed !== true/);\n});\n\ntest("v5 profile readback is stable-identity only and expiry-only", () => {\n  const block = source.slice(source.indexOf("async function readVerifiedCanonicalMemberExpiry"), source.indexOf("function headers"));\n  assert.doesNotMatch(block, /display_name|email/i);\n  assert.match(block, /line_user_id/);\n  assert.match(block, /memberstack_id/);\n  assert.doesNotMatch(block, /current_tier|membership_status|access_status|points/i);\n});\n\ntest("v5 declares canonical Airtable sources", () => {\n  assert.match(types, /AIRTABLE_TABLE_MEMBER_ENTITLEMENTS\?: string/);\n  assert.match(types, /AIRTABLE_TABLE_MEMBERS\?: string/);\n  assert.match(wrangler, /AIRTABLE_TABLE_MEMBER_ENTITLEMENTS = "MMD — Member Entitlements"/);\n  assert.match(wrangler, /AIRTABLE_TABLE_MEMBERS = "Members"/);\n});\n`,
);

console.log("Applied resolver-aware renewal expiry fallback v5");
