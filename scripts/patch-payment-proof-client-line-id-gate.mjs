import { readFile, writeFile } from "node:fs/promises";

const target = new URL("../immigrate-worker/netlify/functions/line-payment-slip-intake.mjs", import.meta.url);
let source = await readFile(target, "utf8");
const before = `  if (identity.lineUserId) {\n    queries.push(["client", env.AIRTABLE_TABLE_CLIENTS || "Clients", \`{line_user_id}='\${formulaValue(identity.lineUserId)}'\`]);\n    queries.push(["member", env.AIRTABLE_TABLE_MEMBERS || "Members", \`{line_id}='\${formulaValue(identity.lineUserId)}'\`]);\n  }`;
const after = `  if (identity.lineUserId) {\n    if (/^U[A-Za-z0-9_-]{20,80}$/.test(identity.lineUserId)) {\n      queries.push(["client", env.AIRTABLE_TABLE_CLIENTS || "Clients", \`{line_user_id}='\${formulaValue(identity.lineUserId)}'\`]);\n    }\n    queries.push(["member", env.AIRTABLE_TABLE_MEMBERS || "Members", \`{line_id}='\${formulaValue(identity.lineUserId)}'\`]);\n  }`;
const first = source.indexOf(before);
if (first < 0) throw new Error("client_line_id_gate_anchor_missing");
if (source.indexOf(before, first + before.length) >= 0) throw new Error("client_line_id_gate_anchor_ambiguous");
source = source.slice(0, first) + after + source.slice(first + before.length);
await writeFile(target, source);
console.log("patched canonical LINE User ID gate for Client lookup");
