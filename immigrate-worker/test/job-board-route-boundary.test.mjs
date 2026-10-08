import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/index.ts", import.meta.url);
const routesUrl = new URL("../src/internal-routes.ts", import.meta.url);
const pagesUrl = new URL("../src/internal-pages.ts", import.meta.url);
const wranglerUrl = new URL("../wrangler.toml", import.meta.url);

test("outer immigrate router bridges both canonical and compatibility Job Board routes", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /jobBoard:\s*"\/internal\/admin\/jobs\/job-board"/);
  assert.match(source, /jobBoardAlias:\s*"\/internal\/admin\/job-board"/);
  assert.match(source, /pathname === JOBS\.jobBoard/);
  assert.match(source, /pathname === JOBS\.jobBoardAlias/);
});

test("Job Board route is authenticated and separate from Create Job", async () => {
  const routes = await readFile(routesUrl, "utf8");
  assert.match(routes, /pathname === "\/internal\/admin\/job-board"/);
  assert.match(routes, /return renderJobBoardPage\(\)/);
  assert.match(routes, /pathname === "\/internal\/admin\/jobs\/job-board"/);
  assert.match(routes, /redirect\(withQuery\("\/internal\/admin\/jobs\/job-board"/);
});

test("canonical Create Job is Webflow-owned while Job Board remains worker-owned", async () => {
  const routes = await readFile(routesUrl, "utf8");
  const pages = await readFile(pagesUrl, "utf8");
  const wrangler = await readFile(wranglerUrl, "utf8");

  assert.doesNotMatch(routes, /if \(pathname === "\/internal\/admin\/jobs\/create-job"\)/);
  assert.doesNotMatch(wrangler, /pattern = "mmdbkk\.com\/internal\/admin\/jobs\/create-job\*"/);
  assert.doesNotMatch(wrangler, /pattern = "www\.mmdbkk\.com\/internal\/admin\/jobs\/create-job\*"/);

  const createStart = pages.indexOf("export function renderCreateJobPage");
  const boardScriptStart = pages.indexOf("const jobBoardScript");
  const boardRenderStart = pages.indexOf("export function renderJobBoardPage");
  assert.ok(createStart > boardRenderStart);
  assert.ok(boardRenderStart > boardScriptStart);

  const boardSource = pages.slice(boardScriptStart, createStart);
  assert.match(boardSource, /data-job-board-owner="separate-v1"/);
  assert.match(boardSource, /id="job-board-form"/);
  assert.match(boardSource, /fetch\("\/v1\/admin\/job-board\/publish"/);
  assert.doesNotMatch(boardSource, /\/v1\/admin\/clients\/lineage-lookup/);
  assert.doesNotMatch(boardSource, /\/v1\/admin\/models\/search/);
});

test("Job Board client accepts the short /j/ broadcast link and the legacy login link", async () => {
  const pages = await readFile(pagesUrl, "utf8");
  const start = pages.indexOf("const jobBoardScript");
  const end = pages.indexOf("export function renderJobBoardPage");
  const script = new Function(`return \`${pages.slice(start, end).replace(/^const jobBoardScript = `/, "").replace(/`;\s*$/, "")}\`;`)();
  const match = script.match(/const linkOk = (\/.*\/i)\.test/);
  assert.ok(match, "linkOk regex present in rendered client script");
  const re = new Function(`return ${match[1]}`)();
  assert.ok(re.test("https://mmdbkk.com/j/ABCDEF123456"));
  assert.ok(re.test("https://www.mmdbkk.com/j/ABCDEF123456"));
  assert.ok(re.test("https://www.mmdbkk.com/sigil/model/login?job=1"));
  assert.ok(!re.test("https://evil.example/j/ABCDEF123456"));
  assert.ok(!re.test("https://mmdbkk.com/j/ABCDEF1234567"));
});
