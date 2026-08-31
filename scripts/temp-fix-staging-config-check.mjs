import fs from "node:fs";

const path = "scripts/check-care-back-staging-config.mjs";
let text = fs.readFileSync(path, "utf8");
const from = 'assert.equal((memberStaging.match(/service\\s*=\\s*"care-back-staging-fixtures-worker-staging"/g) || []).length, 2);';
const to = 'assert.equal((memberStaging.match(/service\\s*=\\s*"care-back-staging-fixtures-worker-staging"/g) || []).length, 1);\nassert.match(memberStaging, /service\\s*=\\s*"mmd-auth-worker-staging"/);';
if (!text.includes(from)) throw new Error("staging service-binding assertion anchor missing");
fs.writeFileSync(path, text.replace(from, to));
