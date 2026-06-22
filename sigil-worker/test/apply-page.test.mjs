import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

const forbiddenTelegramBrief = /Briefing HYPE TELEGRAMBOT|TELEGRAMBOT|CEO TELEGRAM BRIEF/i;

assert.match(source, /SIGIL_APPLY_PATH = "\/sigil\/apply"/);
assert.match(source, /function renderPrivateModelSetupPage/);
assert.match(source, /x-mmd-page": "sigil-private-model-setup"/);
assert.match(source, /SIGIL Private Model Setup \| MMD Privé/);
assert.match(source, /id="sigil-private-setup"/);
assert.match(source, /class="sps sps-private-apply"/);
assert.match(source, /#sigil-private-setup \{/);
assert.match(source, /data-private-setup-form/);
assert.match(source, /data-endpoint="https:\/\/mmdbkk\.com\/sigil\/api\/private-model\/apply"/);
assert.match(source, /name="nickname"/);
assert.match(source, /name="telegram_username"/);
assert.match(source, /name="line_id"/);
assert.match(source, /name="minimum_rate_thb"/);
assert.match(source, /name="private_note"/);
assert.doesNotMatch(source, /Rollback:/);
assert.doesNotMatch(source, forbiddenTelegramBrief);
