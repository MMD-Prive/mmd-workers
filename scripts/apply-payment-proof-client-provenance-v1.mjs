import { readFile, writeFile } from "node:fs/promises";

const target = new URL("../immigrate-worker/netlify/functions/line-payment-slip-intake.mjs", import.meta.url);
let source = await readFile(target, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`patch_anchor_missing:${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`patch_anchor_ambiguous:${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
`  if (identity.lineUserId) {
    queries.push(["member", env.AIRTABLE_TABLE_MEMBERS || "Members", \`{line_id}='\${formulaValue(identity.lineUserId)}'\`]);
  }`,
`  if (identity.lineUserId) {
    queries.push(["client", env.AIRTABLE_TABLE_CLIENTS || "Clients", \`{line_user_id}='\${formulaValue(identity.lineUserId)}'\`]);
    queries.push(["member", env.AIRTABLE_TABLE_MEMBERS || "Members", \`{line_id}='\${formulaValue(identity.lineUserId)}'\`]);
  }`,
"resolve-client-by-line",
);

replaceOnce(
`  return { member: ambiguous ? "" : resolved.member?.id || "", session: ambiguous ? "" : resolved.session?.id || "", payment: ambiguous ? "" : resolved.payment?.id || "", renewal: ambiguous ? "" : resolved.renewal?.id || "", ambiguous };`,
`  return { client: ambiguous ? "" : resolved.client?.id || "", member: ambiguous ? "" : resolved.member?.id || "", session: ambiguous ? "" : resolved.session?.id || "", payment: ambiguous ? "" : resolved.payment?.id || "", renewal: ambiguous ? "" : resolved.renewal?.id || "", ambiguous };`,
"return-client-link",
);

replaceOnce(
`    pending_identity: paymentIntelligence?.pending_member_profile ? {`,
`    pending_identity: paymentIntelligence?.pending_member_profile && !links.client ? {`,
"client-is-known-identity",
);

replaceOnce(
`  if (extraction.payment_ref) fields.payment_ref = extraction.payment_ref;
  if (links.member) fields.member = [links.member];`,
`  if (extraction.payment_ref) fields.payment_ref = extraction.payment_ref;
  if (links.client) fields.Client = [links.client];
  if (links.member) fields.member = [links.member];`,
"persist-client-link",
);

replaceOnce(
`    let links = { member: "", session: "", payment: "", renewal: "", ambiguous: false };`,
`    let links = { client: "", member: "", session: "", payment: "", renewal: "", ambiguous: false };`,
"initialize-client-link",
);

replaceOnce(
`    const deterministicallyLinked = Boolean(links.member || links.session || links.payment || links.renewal);`,
`    const deterministicallyLinked = Boolean(links.client || links.member || links.session || links.payment || links.renewal);`,
"client-counts-as-deterministic-link",
);

await writeFile(target, source);
console.log("patched payment slip canonical Client provenance v1");
