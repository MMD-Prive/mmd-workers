import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const browserRequire = createRequire(new URL("../tools/browser/package.json", import.meta.url));
const { chromium } = browserRequire("playwright");

const base = (process.argv[2] || "http://127.0.0.1:4203").replace(/\/$/, "");
const outRoot = process.argv[3] || "artifacts/my-model-staging";
const screens = [
  ["home", "/sigil/model/dashboard"],
  ["jobs", "/sigil/model/dashboard/jobs"],
  ["you", "/sigil/model/dashboard/more"],
  ["profile", "/sigil/model/dashboard/profile"],
  ["availability", "/sigil/model/dashboard/availability"],
];

await mkdir(outRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
const evidence = [];
try {
  for (const [name, route] of screens) {
    for (const lang of ["th", "en"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error?.message || error)));
      page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

      const url = new URL(base + route);
      url.searchParams.set("fixture_state", "auth");
      url.searchParams.set("fixture_world", "public");
      url.searchParams.set("lang", lang);
      await page.goto(url.href, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(300);

      if (route === "/sigil/model/dashboard" && lang === "en") {
        const en = page.locator('button[data-mm-lv-lang="en"]');
        if (await en.count()) {
          await en.click();
          await page.waitForTimeout(150);
        }
      }

      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      if (name === "home" && !/LOCAL FIXTURE · LV15/.test(body)) throw new Error(name + " missing local fixture banner");
      if (/fixture_state=confirmed|fixture_state=en_route/.test(page.url())) throw new Error(name + " entered a positive fixture");
      const receipt = await (await page.request.get(base + "/__fixture/receipt")).json();
      if (receipt.production_requests !== 0) throw new Error(name + " attempted production traffic");

      const file = path.join(outRoot, `model-${name}-390-${lang}.png`);
      await page.screenshot({ path: file, fullPage: true });
      evidence.push({
        name, route, lang,
        file: path.relative(outRoot, file),
        state: "auth_required_fixture",
        production_requests: receipt.production_requests,
        page_errors: errors,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (evidence.some((item) => item.production_requests !== 0 || item.page_errors.length)) {
  console.error(JSON.stringify(evidence, null, 2));
  process.exit(1);
}
await writeFile(path.join(outRoot, "evidence.json"), JSON.stringify({
  schema: "my_model_staging_proof_v1",
  viewport: "390x844",
  fixture_state: "auth",
  no_credentials: true,
  screenshots: evidence,
}, null, 2));
console.log(JSON.stringify({ ok: true, screenshots: evidence.length }));
