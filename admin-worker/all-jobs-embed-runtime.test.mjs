import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../webflow/internal/admin/jobs/all/all-jobs.html", import.meta.url), "utf8");
const runtime = html.match(/<script data-mmd-admin-all-jobs-runtime="v1">([\s\S]*?)<\/script>/)?.[1];
assert.ok(runtime, "All Jobs inline runtime exists");

const selectors = [
  "data-api-state", "data-all-jobs-list", "data-count-all", "data-count-today",
  "data-count-filtered", "data-result-note", "data-page-meta", "data-page-label",
  "data-page-prev", "data-page-next", "data-date-filter", "data-filter-all",
  "data-filter-today", "data-refresh-jobs",
];

function mount(search, responseForJobs) {
  const elements = Object.fromEntries(selectors.map((name) => [name, {
    innerHTML: "", textContent: "", value: "", disabled: false, handlers: {},
    classList: { toggle() {} },
    addEventListener(event, handler) { this.handlers[event] = handler; },
    querySelector() { return this.statusSpan ||= { textContent: "" }; },
  }]));
  const location = {
    hostname: "www.mmdbkk.com", pathname: "/internal/admin/jobs/all", search, hash: "",
    replaced: null,
    replace(path) { this.replaced = path; },
  };
  const requests = [];
  const pageEvents = {};
  const history = {
    pushState(_a, _b, path) { updateLocation(path); },
    replaceState(_a, _b, path) { updateLocation(path); },
  };
  function updateLocation(path) {
    const url = new URL(path, "https://www.mmdbkk.com");
    location.pathname = url.pathname;
    location.search = url.search;
    location.hash = url.hash;
  }
  const context = {
    document: { querySelector() { return { querySelector(selector) {
      const match = selector.match(/^\[([^\]]+)\]$/);
      return match ? elements[match[1]] : null;
    } }; } },
    location, history, URLSearchParams, Intl, Date, String, Math, console: { warn() {} },
    addEventListener(name, handler) { pageEvents[name] = handler; },
    async fetch(input) {
      requests.push(input);
      if (input === "/v1/admin/auth/me") {
        return { ok: true, status: 200, async json() { return { ok: true, authenticated: true }; } };
      }
      return responseForJobs(input);
    },
  };
  runInNewContext(runtime, context);
  return { elements, location, requests, pageEvents };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("duplicate or empty Console scope does not fall back to an unrestricted jobs request", async () => {
  for (const search of ["?client_id=", "?client_id=recAAAAAAAAAAAAAA&client_id=recBBBBBBBBBBBBBB", "?job_id=A&job_id=B", "?session_id="]) {
    const app = mount(search, () => {throw new Error("jobs must not be fetched");});
    await settle();
    assert.deepEqual(app.requests, ["/v1/admin/auth/me"]);
    assert.doesNotMatch(app.elements["data-all-jobs-list"].innerHTML, /MY MMD ของเจ้าของงาน/);
  }
});

test("Console preserves client scope and rejects a response from another customer", async () => {
  const clientId = "recAAAAAAAAAAAAAA";
  const app = mount("?client_id=" + clientId, () => jobsResponse(null, [
    { id: "sess_a", client_id: clientId, customer_view_href: "/my-mmd/?session_id=sess_a", title: "Selected customer" },
  ], { filters: { client_id: clientId } }));
  await settle();
  assert.match(app.requests.at(-1), /client_id=recAAAAAAAAAAAAAA/);
  assert.match(app.elements["data-all-jobs-list"].innerHTML, /\/my-mmd\/\?session_id=sess_a/);
  app.elements["data-filter-today"].handlers.click();
  await settle();
  assert.match(app.requests.at(-1), /client_id=recAAAAAAAAAAAAAA/);

  const wrong = mount("?client_id=" + clientId, () => jobsResponse(null, [
    { id: "sess_b", client_id: "recBBBBBBBBBBBBBB", title: "Foreign private job" },
  ], { filters: { client_id: clientId } }));
  await settle();
  assert.doesNotMatch(wrong.elements["data-all-jobs-list"].innerHTML, /Foreign private job/);
  assert.match(wrong.elements["data-all-jobs-list"].innerHTML, /ข้อมูลที่ได้ไม่ตรง/);
});

test("Console job deep link stays exact and cannot render an external customer link", async () => {
  const app = mount("?job_id=JOB-A", () => jobsResponse(null, [
    { id: "sess_a", job_id: "JOB-A", customer_view_href: "https://evil.example/", title: "Selected job" },
  ], { filters: { job_id: "JOB-A" } }));
  await settle();
  assert.match(app.requests.at(-1), /job_id=JOB-A/);
  assert.match(app.elements["data-all-jobs-list"].innerHTML, /Selected job/);
  assert.doesNotMatch(app.elements["data-all-jobs-list"].innerHTML, /evil\.example/);
});
const jobsResponse = (id, jobs, extra = {}) => ({
  ok: true, status: 200,
  async json() {
    return {
      ok: true, filters: { session_id: id }, jobs,
      pagination: { page: 1, total: jobs.length, total_pages: 1, has_prev: false, has_next: false },
      counts: { all: 67, today: 3, filtered: jobs.length },
      ...extra,
    };
  },
});

test("selected Session stays selected and a missing ID never renders the generic queue", async () => {
  const selected = mount("?session_id=sess_exact", () => jobsResponse("sess_exact", [
    { id: "sess_exact", title: "งานที่เลือก", status: "พร้อม" },
  ]));
  await settle();
  assert.match(selected.requests[1], /session_id=sess_exact/);
  assert.match(selected.elements["data-all-jobs-list"].innerHTML, /งานที่เลือก/);
  assert.equal(selected.elements["data-count-all"].textContent, "—");

  const missing = mount("?session_id=sess_missing", () => jobsResponse("sess_missing", []));
  await settle();
  assert.match(missing.elements["data-all-jobs-list"].innerHTML, /ไม่พบงานนี้/);
  assert.doesNotMatch(missing.elements["data-all-jobs-list"].innerHTML, /ดู Operations|เปิดงานนี้/);
  assert.equal(missing.elements["data-count-all"].textContent, "—");
});

test("date filters, refresh, and browser Back keep the exact Session ID", async () => {
  const app = mount("?session_id=sess_exact", (url) =>
    jobsResponse(new URL(url, "https://www.mmdbkk.com").searchParams.get("session_id"), []));
  await settle();
  app.elements["data-filter-today"].handlers.click();
  await settle();
  assert.match(app.requests.at(-1), /session_id=sess_exact/);
  assert.match(app.location.search, /session_id=sess_exact/);
  app.elements["data-date-filter"].value = "2026-09-27";
  app.elements["data-date-filter"].handlers.change();
  await settle();
  assert.match(app.requests.at(-1), /date=2026-09-27/);
  assert.match(app.requests.at(-1), /session_id=sess_exact/);
  app.elements["data-refresh-jobs"].handlers.click();
  await settle();
  assert.match(app.requests.at(-1), /session_id=sess_exact/);
  app.location.search = "?session_id=sess_exact";
  app.pageEvents.popstate();
  await settle();
  assert.match(app.requests.at(-1), /session_id=sess_exact/);
  assert.doesNotMatch(app.requests.at(-1), /date=/);
});

test("mismatched API identity and denied access fail closed", async () => {
  const mismatch = mount("?session_id=sess_exact", () => jobsResponse("sess_other", [
    { id: "sess_other", title: "อีกงาน" },
  ]));
  await settle();
  assert.match(mismatch.elements["data-all-jobs-list"].innerHTML, /ข้อมูลที่ได้ไม่ตรงกับงานที่เลือก/);
  assert.doesNotMatch(mismatch.elements["data-all-jobs-list"].innerHTML, /อีกงาน/);

  const denied = mount("?session_id=sess_exact", async () => ({
    ok: false, status: 403, async json() { return { ok: false, error: "forbidden" }; },
  }));
  await settle();
  assert.match(denied.elements["data-all-jobs-list"].innerHTML, /ไม่มีสิทธิ์ดูงานนี้/);
  assert.equal(denied.location.replaced, null);
});

test("invalid Session ID is rejected before the jobs API is called", async () => {
  const invalid = mount("?session_id=bad%20id", () => {
    throw new Error("jobs API must not be called");
  });
  await settle();
  assert.equal(invalid.requests.length, 1);
  assert.match(invalid.elements["data-all-jobs-list"].innerHTML, /ลิงก์งานไม่ถูกต้อง/);
});

test("a late response cannot replace the result for the current filter", async () => {
  let resolveFirst;
  const first = new Promise((resolve) => { resolveFirst = resolve; });
  let calls = 0;
  const app = mount("?session_id=sess_exact", () => {
    calls += 1;
    return calls === 1 ? first : jobsResponse("sess_exact", []);
  });
  await settle();
  app.elements["data-filter-today"].handlers.click();
  await settle();
  assert.match(app.elements["data-all-jobs-list"].innerHTML, /ไม่พบงานนี้ในวันที่เลือก/);
  resolveFirst(jobsResponse("sess_exact", [{ id: "sess_exact", title: "ผลล้าสมัย" }]));
  await settle();
  assert.doesNotMatch(app.elements["data-all-jobs-list"].innerHTML, /ผลล้าสมัย/);
});

test("pagination updates the URL and Back restores the previous page", async () => {
  const app = mount("", (url) => {
    const page = Number(new URL(url, "https://www.mmdbkk.com").searchParams.get("page"));
    return jobsResponse(null, [], {
      pagination: {
        page, total: 21, total_pages: 2,
        has_prev: page > 1, has_next: page < 2,
      },
    });
  });
  await settle();
  app.elements["data-page-next"].handlers.click();
  await settle();
  assert.match(app.requests.at(-1), /page=2/);
  assert.match(app.location.search, /page=2/);
  app.location.search = "";
  app.pageEvents.popstate();
  await settle();
  assert.match(app.requests.at(-1), /page=1/);
  assert.doesNotMatch(app.location.search, /page=2/);
});

test("navigation and next-step controls use native keyboard-accessible elements", () => {
  assert.match(html, /<button type="button" class="ajb-filter/);
  assert.match(html, /<input type="date" data-date-filter>/);
  assert.match(html, /<summary>ขั้นตอนถัดไปของงานนี้<\/summary>/);
  assert.ok(runtime.includes('<a class="ajb-open" href='));
  assert.doesNotMatch(html, /ส่ง Session ID ที่แสดงให้ผู้ดูแลระบบ/);
  assert.match(html, /ยังไม่มีปุ่มทำรายการต่อจากเคสนี้/);
});
