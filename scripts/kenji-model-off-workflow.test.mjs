import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../.github/workflows/deploy-member-dashboard-chat-worker.yml", import.meta.url), "utf8");
const config = readFileSync(new URL("../member-dashboard-chat-worker/wrangler.toml", import.meta.url), "utf8");
test("production auto-reply setting is explicit and guarded before every release", () => {
  assert.match(config, /^LINE_AUTO_REPLY_ENABLED = "true"$/m);
  assert.doesNotMatch(config, /^LINE_AUTO_REPLY_ENABLED = "false"$/m);
  const gate = source.indexOf("      - name: Verify Kenji production model-off contract");
  const gateEnd = source.indexOf("      - name:", gate + 10);
  assert.ok(source.slice(gate, gateEnd).includes(`grep -Eq '^LINE_AUTO_REPLY_ENABLED = "true"$'`));
  for (const command of ["wrangler@4 versions upload", "wrangler deploy", "wrangler@4 deploy", "wrangler@4 versions deploy"]) {
    assert.ok(source.indexOf(command) > gateEnd, command);
  }
  for (const flag of ["LINE_KENJI_MODEL_ENABLED", "KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED"]) {
    assert.match(config, new RegExp(`^${flag} = "false"$`, "m"));
  }
});
test("model-off gate must pass before any version upload or deployment", () => {
  const gate = source.indexOf("      - name: Verify Kenji production model-off contract");
  assert.ok(gate > 0);
  const gateStep = source.slice(gate, source.indexOf("      - name:", gate + 10));
  assert.doesNotMatch(gateStep, /if: always\(\)/);
  for (const command of ["wrangler@4 versions upload", "wrangler@4 deploy", "wrangler@4 versions deploy"]) {
    const position = source.indexOf(command);
    assert.ok(position > gate, command);
  }
  for (const [flag, value] of [["KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED", "false"], ["LINE_KENJI_MODEL_ENABLED", "false"], ["LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED", "true"]]) {
    assert.ok(gateStep.includes(`${flag} = "${value}"`));
  }
  assert.doesNotMatch(source, /--data '\{"mode":"(?:contextual_understanding_shadow|real_kenji_recommendation|eligible_kenji_recommendation)"/);
});
test("failed or skipped model-off gate cannot produce a verified deployment receipt", () => {
  const receipt = source.slice(source.indexOf("      - name: Record verified deployment and route receipt"));
  const condition = receipt.slice(0, receipt.indexOf("        shell:"));
  assert.match(condition, /steps\.kenji_contextual_shadow_smoke\.outcome == 'success'/);
  const enforce = source.slice(source.indexOf("      - name: Enforce production deploy success"), source.indexOf("      - name: Record verified deployment and route receipt"));
  assert.match(enforce, /if \[ "\$KENJI_MODEL_OFF_OUTCOME" != "success" \]; then[\s\S]*?exit 1/);
});
