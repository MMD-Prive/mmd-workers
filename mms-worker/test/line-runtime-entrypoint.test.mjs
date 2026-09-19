import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("mms-worker entrypoint imports the HENNA LINE runtime used by health and webhook routes", () => {
  const source = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(
    source,
    /import\s*\{[^}]*handleMmsLineWebhook[^}]*lineBotStatus[^}]*\}\s*from\s*["']\.\/line-bot\.mjs["']/s,
  );
  assert.match(source, /line:\s*lineBotStatus\(env\)/);
  assert.match(source, /return await handleMmsLineWebhook\(request, env\)/);
});
