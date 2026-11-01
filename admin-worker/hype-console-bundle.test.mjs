import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { createCredentialBoundAdminSession } from "./src/credential-bound-admin-session.js";

// The existing entrypoint CI installs this lockfile-backed bundler already.
const { build } = createRequire(new URL("../immigrate-worker/package.json", import.meta.url))("esbuild");
globalThis.crypto ??= webcrypto;
const origin = "https://mmdbkk.com";
const id = "rec12345678901234";

function browserDom() {
  function node(tag = "div") {
    return {
      tag, value: "", textContent: "", disabled: false, hidden: false,
      dataset: {}, children: [], attributes: {},
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      setAttribute(key, value) { this.attributes[key] = value; },
      focus() {}, select() {},
      querySelectorAll(selector) {
        return this.children.flatMap(child => [child, ...child.querySelectorAll(selector)]).filter(child => child.tag === selector);
      },
    };
  }
  const ids = new Map();
  const get = key => { if (!ids.has(key)) ids.set(key, node()); return ids.get(key); };
  get("hc-topic").value = "next_step";
  get("hc-topic").options = ["next_step", "profile", "access", "availability"].map(value => ({ value }));
  const tabs = ["member", "applicant", "model"].map(lane => Object.assign(node("button"), { id: `hc-tab-${lane}`, dataset: { lane } }));
  return {
    get, tabs,
    document: { getElementById: get, querySelectorAll: () => tabs, createElement: node },
  };
}

for (const minifySyntax of [false, true]) {
  test(`actual admin-worker bundle starts HYPE and runs all three lanes without Worker helpers (minifySyntax=${minifySyntax})`, async () => {
    const built = await build({
      entryPoints: [fileURLToPath(new URL("./src/admin-login-hero-worker.js", import.meta.url))],
      bundle: true, write: false, format: "esm", platform: "browser", target: "es2022",
      keepNames: true, minifySyntax, logLevel: "silent",
    });
    const worker = (await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`)).default;
    let sourceFails = false;
    const providerMethods = [];
    const env = {
      ADMIN_LOGIN_CREDENTIAL: "fixture-credential", ADMIN_SESSION_SECRET: "fixture-session",
      AIRTABLE_BASE_ID: "appFixture", AIRTABLE_API_KEY: "fixture-not-a-real-key",
      AIRTABLE_HTTP: { async fetch(request) {
        providerMethods.push(request.method);
        if (sourceFails) return new Response(null, { status: 503 });
        return Response.json({ records: [{ id, fields: {
          "Applicant Name": "Fixture Member", "Application Status": "Waitlisted",
          nickname: "Fixture Applicant", folder_name: "Fixture Model", status: "new_review",
        } }] });
      } },
    };
    const session = await createCredentialBoundAdminSession(new Request(origin), { id: "per", role: "admin", auth_method: "credential" }, env);
    const headers = { cookie: `mmd_admin_gate_v1=${session}`, origin, "content-type": "application/json" };
    const page = await worker.fetch(new Request(origin + "/internal/admin/hype", { headers }), env, {});
    assert.equal(page.status, 200);
    const html = await page.text();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    assert.match(script, /__name\(/, "must test esbuild-annotated callbacks, not raw source");
    const dom = browserDom(), calls = [];
    const context = {
      document: dom.document, window: { addEventListener() {} }, AbortSignal,
      navigator: { clipboard: { writeText: async () => {} } },
      fetch: async (path, options) => {
        calls.push(path);
        assert.ok(["/v1/admin/hype/search", "/v1/admin/hype/draft"].includes(path));
        return worker.fetch(new Request(origin + path, { ...options, headers: { ...options.headers, ...headers } }), env, {});
      },
    };
    assert.equal(Object.hasOwn(context, "__name"), false);
    runInNewContext(script, context, { timeout: 1000 });
    assert.equal(Object.hasOwn(context, "__name"), false, "helper must stay inside the serialized closure");
    for (const tab of dom.tabs) {
      tab.onclick();
      assert.equal(dom.get("hc-draft").value, "", "lane changes clear prior customer drafts");
      dom.get("hc-query").value = "Fixture";
      await dom.get("hc-search-form").onsubmit({ preventDefault() {} });
      assert.equal(dom.get("hc-results").children.length, 1);
      const button = dom.get("hc-results").children[0].children[0];
      if (tab.dataset.lane === "member") assert.match(button.children[1].textContent, /รอคิวพิจารณา/);
      if (tab.dataset.lane === "applicant") assert.match(button.children[1].textContent, /รายการใหม่รอตรวจ/);
      button.onclick();
      await dom.get("hc-prepare").onclick();
      assert.equal(dom.get("hc-draft").disabled, false);
      assert.ok(dom.get("hc-draft").value.length > 0);
      assert.equal(dom.get("hc-copy").disabled, false);
      assert.match(dom.get("hc-draft-status").textContent, /ยังไม่ได้ส่ง/);
    }
    sourceFails = true;
    await dom.get("hc-search-form").onsubmit({ preventDefault() {} });
    assert.equal(dom.get("hc-draft").value, "");
    assert.equal(dom.get("hc-copy").disabled, true);
    assert.match(dom.get("hc-status").textContent, /ยังอ่านข้อมูลไม่ได้/);
    assert.equal(calls.length, 7);
    assert.ok(providerMethods.every(method => method === "GET"));
  });
}
