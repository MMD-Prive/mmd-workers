import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function write(rel, source) {
  fs.writeFileSync(path.join(root, rel), source);
}

function mustReplace(source, from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Missing expected pattern: ${label}`);
  }
  return source.split(from).join(to);
}

function assertNoLegacy(rel, source) {
  if (/memberstack/i.test(source)) {
    throw new Error(`${rel} still contains retired Memberstack identity references`);
  }
}

{
  const rel = "immigrate-worker/src/lib/airtable.ts";
  let s = read(rel);
  s = mustReplace(s, "AIRTABLE_ENTITLEMENT_MEMBERSTACK_ID_FIELD", "AIRTABLE_ENTITLEMENT_MEMBER_ID_FIELD", `${rel} entitlement field env`);
  s = mustReplace(s, "AIRTABLE_MEMBERS_MEMBERSTACK_ID_FIELD", "AIRTABLE_MEMBERS_MEMBER_ID_FIELD", `${rel} members field env`);
  s = mustReplace(s, "patchClientMemberstackId", "patchClientMemberId", `${rel} client member patch function`);
  s = s.split("resolvedMemberstackId").join("resolvedMemberId");
  s = s.split("matchesMemberstack").join("matchesMemberId");
  s = s.split("wantedMemberstack").join("wantedMemberId");
  s = s.split("rowMemberstack").join("rowMemberId");
  s = s.split("memberstackKeys").join("memberIdKeys");
  s = s.split("memberstackId").join("memberId");
  s = s.split("Memberstack ID").join("Member ID");
  s = s.split("memberstack_id").join("member_id");
  s = s.split("memberstack patch").join("member id patch");
  assertNoLegacy(rel, s);
  write(rel, s);
}

{
  const rel = "immigrate-worker/src/lib/invite.ts";
  let s = read(rel);
  s = s.split("memberstack_id").join("member_id");
  assertNoLegacy(rel, s);
  write(rel, s);
}

{
  const rel = "immigrate-worker/src/types.ts";
  let s = read(rel);
  s = s.split("AIRTABLE_ENTITLEMENT_MEMBERSTACK_ID_FIELD").join("AIRTABLE_ENTITLEMENT_MEMBER_ID_FIELD");
  s = s.split("AIRTABLE_MEMBERS_MEMBERSTACK_ID_FIELD").join("AIRTABLE_MEMBERS_MEMBER_ID_FIELD");
  s = s.split("memberstack_id").join("member_id");
  assertNoLegacy(rel, s);
  write(rel, s);
}

{
  const rel = "immigrate-worker/src/index.ts";
  let s = read(rel);
  s = s.split("patchClientMemberstackId").join("patchClientMemberId");
  s = s.split("memberstackId").join("memberId");
  s = s.split("Memberstack ID").join("Member ID");
  s = s.split("memberstack_id").join("member_id");

  s = s.split("    member_id: string;\n    member_id: string;\n").join("    member_id: string;\n");
  s = s.split("  member_id?: string;\n  member_id?: string;\n").join("  member_id?: string;\n");
  s = s.split("      member_id: memberId,\n      member_id: memberId,\n").join("      member_id: memberId,\n");
  s = s.split("body.member_id || body.member_id || body.member_ref").join("body.member_id || body.member_ref");
  s = s.split('member_id:selectedClient.member_id||"",member_id:selectedClient.member_id||"",').join('member_id:selectedClient.member_id||"",');

  assertNoLegacy(rel, s);
  write(rel, s);
}

{
  const rel = "immigrate-worker/wrangler.toml";
  let s = read(rel);
  s = s.split("AIRTABLE_ENTITLEMENT_MEMBERSTACK_ID_FIELD").join("AIRTABLE_ENTITLEMENT_MEMBER_ID_FIELD");
  s = s.split("AIRTABLE_MEMBERS_MEMBERSTACK_ID_FIELD").join("AIRTABLE_MEMBERS_MEMBER_ID_FIELD");
  s = s.split("memberstack_id").join("member_id");
  assertNoLegacy(rel, s);
  write(rel, s);
}

{
  const rel = "immigrate-worker/public/assets/inme/inme-renewal.js";
  let s = read(rel);
  s = s.split("memberstack_id").join("member_id");
  s = s.split("result?.member_id || result?.member_id ||").join("result?.member_id ||");
  assertNoLegacy(rel, s);
  write(rel, s);
}

{
  const rel = "docs/renewal-status-v5-resolver-aware-expiry.md";
  let s = read(rel);
  s = s.split("memberstack_id").join("member_id");
  s = s.replace(
    "verified canonical `Members` row matched only by exact `line_user_id` or `member_id`",
    "verified canonical `Members` row matched only by exact `line_user_id` or canonical MMD `member_id`",
  );
  assertNoLegacy(rel, s);
  write(rel, s);
}

{
  const rel = "immigrate-worker/test/renewal-expiry-resolver-v5-contract.test.mjs";
  let s = read(rel);
  s = s.split("memberstack_id").join("member_id");
  if (!s.includes("assert.doesNotMatch(block, /memberstack/i);")) {
    s = s.replace(
      "  assert.match(block, /member_id/);\n",
      "  assert.match(block, /member_id/);\n  assert.doesNotMatch(block, /memberstack/i);\n",
    );
  }
  write(rel, s);
}

{
  const rel = "immigrate-worker/test/canonical-member-identity-contract.test.mjs";
  const source = `import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport path from "node:path";\nimport test from "node:test";\n\nconst workerRoot = new URL("..", import.meta.url);\nconst forbidden = ["member", "stack"].join("");\n\nfunction walk(dir) {\n  const out = [];\n  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {\n    const full = path.join(dir, entry.name);\n    if (entry.isDirectory()) out.push(...walk(full));\n    else out.push(full);\n  }\n  return out;\n}\n\ntest("immigrate-worker runtime uses only canonical MMD member identity", () => {\n  const roots = [\n    new URL("../src", import.meta.url),\n    new URL("../public", import.meta.url),\n  ];\n  const files = roots.flatMap((url) => walk(url.pathname));\n  files.push(new URL("../wrangler.toml", import.meta.url).pathname);\n\n  for (const file of files) {\n    const source = fs.readFileSync(file, "utf8").toLowerCase();\n    assert.equal(source.includes(forbidden), false, file);\n  }\n});\n\ntest("renewal resolver declares canonical member_id Airtable fields", () => {\n  const types = fs.readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");\n  const wrangler = fs.readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");\n  assert.ok(types.includes("AIRTABLE_ENTITLEMENT_MEMBER_ID_FIELD?: string"));\n  assert.ok(types.includes("AIRTABLE_MEMBERS_MEMBER_ID_FIELD?: string"));\n  assert.ok(wrangler.includes('AIRTABLE_ENTITLEMENT_MEMBER_ID_FIELD = "member_id"'));\n  assert.ok(wrangler.includes('AIRTABLE_MEMBERS_MEMBER_ID_FIELD = "member_id"'));\n});\n`;
  write(rel, source);
}

console.log("Removed retired Memberstack identity from immigrate-worker and renewal V5 contracts");
