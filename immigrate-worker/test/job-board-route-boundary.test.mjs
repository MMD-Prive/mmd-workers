import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/index.ts", import.meta.url);
const routesUrl = new URL("../src/internal-routes.ts", import.meta.url);
const pagesUrl = new URL("../src/internal-pages.ts", import.meta.url);

test("outer immigrate router bridges both canonical and compatibility Job Board routes", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /jobBoard:\s*"\/internal\/admin\/job-board"/);
  assert.match(source, /jobBoardAlias:\s*"\/internal\/admin\/jobs\/job-board"/);
  assert.match(source, /pathname === JOBS\.jobBoard/);
  assert.match(source, /pathname === JOBS\.jobBoardAlias/);
});

test("Job Board route is authenticated and separate from Create Job", async () => {
  const routes = await readFile(routesUrl, "utf8");
  assert.match(routes, /pathname === "\/internal\/admin\/job-board"/);
  assert.match(routes, /return renderJobBoardPage\(\)/);
  assert.match(routes, /pathname === "\/internal\/admin\/jobs\/job-board"/);
  assert.match(routes, /redirect\(withQuery\("\/internal\/admin\/job-board"/);
});

test("Create Job contains only a link to Job Board while Job Board owns publish controls", async () => {
  const pages = await readFile(pagesUrl, "utf8");
  const createStart = pages.indexOf("export function renderCreateJobPage");
  const boardScriptStart = pages.indexOf("const jobBoardScript");
  const boardRenderStart = pages.indexOf("export function renderJobBoardPage");
  assert.ok(createStart > boardRenderStart);
  assert.ok(boardRenderStart > boardScriptStart);
  const createSource = pages.slice(createStart);
  assert.match(createSource, /href="\/internal\/admin\/job-board"/);
  assert.doesNotMatch(createSource, /id="job-board-form"/);
  assert.doesNotMatch(createSource, /fetch\("\/v1\/admin\/job-board\/publish"/);

  const boardSource = pages.slice(boardScriptStart, createStart);
  assert.match(boardSource, /data-job-board-owner="separate-v1"/);
  assert.match(boardSource, /id="job-board-form"/);
  assert.match(boardSource, /fetch\("\/v1\/admin\/job-board\/publish"/);
  assert.doesNotMatch(boardSource, /\/v1\/admin\/clients\/lineage-lookup/);
  assert.doesNotMatch(boardSource, /\/v1\/admin\/models\/search/);
});
