import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeUrl = new URL("../src/runtime-index-with-application-v4.js", import.meta.url);
const dispatchEntryUrl = new URL("../src/runtime-index-with-dispatch.js", import.meta.url);
const wranglerUrl = new URL("../wrangler.jsonc", import.meta.url);

test("v4 runtime keeps additional applicant photos separate from certificates", async () => {
  const source = await readFile(runtimeUrl, "utf8");
  assert.match(source, /grant\.kind === "additional_photo"/);
  assert.match(source, /Additional Photo R2 Keys/);
  assert.match(source, /Certificate R2 Keys/);
  assert.match(source, /additional_photo\|certificate|additional_photo/);
});

test("v4 admin snapshot exposes operational application fields without sexual orientation", async () => {
  const source = await readFile(runtimeUrl, "utf8");
  assert.match(source, /recommended_route/);
  assert.match(source, /experience_background/);
  assert.match(source, /residence_province/);
  assert.match(source, /additional_photo_r2_keys/);
  assert.doesNotMatch(source, /Sexual Orientation/);
});

test("production dispatch entrypoint preserves the application v4 bridge", async () => {
  const wrangler = await readFile(wranglerUrl, "utf8");
  const entry = await readFile(dispatchEntryUrl, "utf8");
  assert.match(wrangler, /"main": "src\/runtime-index-with-dispatch\.js"/);
  assert.match(entry, /import runtime from "\.\/runtime-index-with-application-v4\.js"/);
  assert.match(entry, /export \{ MmsCoordinator \} from "\.\/runtime-index-with-application-v4\.js"/);
});
