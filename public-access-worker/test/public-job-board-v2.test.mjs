import test from "node:test";
import assert from "node:assert/strict";
import { handlePublicJobBoard } from "../src/public-job-board-v2.js";

class MemoryKV {
  constructor() { this.map = new Map(); }
  async get(key, type) { const value = this.map.get(key); return value === undefined ? null : (type === "json" ? JSON.parse(value) : value); }
  async put(key, value) { this.map.set(key, value); }
}
const makeEnv = () => ({ PUBLIC_JOB_BOARD_OWNER_TOKEN: "owner-test", PUBLIC_JOB_BOARD_STORE: new MemoryKV() });
const request = (path, method = "GET", body, headers = {}) => new Request(`https://example.test${path}`, { method, headers: { "Origin": "https://mmdbkk.com", ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });

test("creates a public and private job, then lists safe cards", async () => {
  const env = makeEnv();
  const owner = request("/public/api/owner/jobs", "POST", { type: "private", brief: "งานกินข้าว ลูกค้าเกย์ผู้ใหญ่\nงาน 3 ชม.\nพฤ 1 ต.ค. 20:00 ย่านสุขุมวิท\n10,000 ถึงตัว", title: "งานกินข้าวลับ", budget_disclosure_approved: true }, { Authorization: "Bearer owner-test" });
  const created = await handlePublicJobBoard(owner, env, "/public/api/owner/jobs"); assert.equal(created.status, 201);
  const list = await handlePublicJobBoard(request("/public/api/jobs", "GET"), env, "/public/api/jobs"); const data = await list.json();
  assert.equal(data.jobs.length, 1); assert.equal(data.jobs[0].budget_label, "10,000 ถึงตัว"); assert.equal(data.jobs[0].safe_customer_description, undefined);
});

test("private brief is click-to-reveal and interest is owner-review only", async () => {
  const env = makeEnv();
  const owner = request("/public/api/owner/jobs", "POST", { type: "private", brief: "งานลับ\n10,000 บาท", title: "งานลับ" }, { Authorization: "Bearer owner-test" });
  const created = await handlePublicJobBoard(owner, env, "/public/api/owner/jobs"); const { job } = await created.json();
  const before = await handlePublicJobBoard(request(`/public/api/jobs/${job.id}`), env, `/public/api/jobs/${job.id}`); const beforeData = await before.json(); assert.equal(beforeData.job.safe_customer_description, undefined);
  const reveal = await handlePublicJobBoard(request(`/public/api/jobs/${job.id}/reveal`, "POST", {}, { Cookie: "mmd_job_viewer=testviewer" }), env, `/public/api/jobs/${job.id}/reveal`);
  const revealToken = reveal.headers.get("Set-Cookie")?.split("=")[1]?.split(";")[0];
  assert.equal((await reveal.json()).job.compensation, "10,000 บาท");
  const interest = await handlePublicJobBoard(request(`/public/api/jobs/${job.id}/interest`, "POST", { nickname: "A", gender_identity: "เกย์", customer_scope: "ผู้ชาย", boundaries: "คุยได้" }, { Cookie: "mmd_job_viewer=testviewer", "X-Job-Reveal-Token": revealToken }), env, `/public/api/jobs/${job.id}/interest`); assert.equal(interest.status, 201);
});

test("rejects unauthenticated owner access and invalid applicant identity", async () => {
  const env = makeEnv();
  const owner = request("/public/api/owner/jobs", "POST", { brief: "งาน" }); await assert.rejects(() => handlePublicJobBoard(owner, env, "/public/api/owner/jobs"), (e) => e.status === 401);
});

test("hides private budget unless owner approves disclosure", async () => {
  const env = makeEnv(); const created = await handlePublicJobBoard(request("/public/api/owner/jobs", "POST", { type: "private", brief: "งานลับ\n10,000 บาท" }, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/jobs");
  const { job } = await created.json(); const list = await handlePublicJobBoard(request("/public/api/jobs"), env, "/public/api/jobs"); assert.equal((await list.json()).jobs[0].budget_label, undefined); assert.ok(job.id);
});

test("requires reveal before interest", async () => {
  const env = makeEnv(); const created = await handlePublicJobBoard(request("/public/api/owner/jobs", "POST", { type: "private", brief: "งานลับ" }, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/jobs"); const { job } = await created.json();
  await assert.rejects(() => handlePublicJobBoard(request(`/public/api/jobs/${job.id}/interest`, "POST", { nickname: "A", gender_identity: "เกย์", customer_scope: "ผู้ชาย" }, { Cookie: "mmd_job_viewer=v" }), env, `/public/api/jobs/${job.id}/interest`), (e) => e.status === 403);
});

test("rejects invalid gender identity", async () => {
  const env = makeEnv(); const created = await handlePublicJobBoard(request("/public/api/owner/jobs", "POST", { type: "public", brief: "งาน" }, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/jobs"); const { job } = await created.json();
  await handlePublicJobBoard(request(`/public/api/jobs/${job.id}/reveal`, "POST", {}, { Cookie: "mmd_job_viewer=g" }), env, `/public/api/jobs/${job.id}/reveal`);
  await assert.rejects(() => handlePublicJobBoard(request(`/public/api/jobs/${job.id}/interest`, "POST", { nickname: "A", gender_identity: "x", customer_scope: "ผู้ชาย" }, { Cookie: "mmd_job_viewer=g", "X-Job-Reveal-Token": "bad" }), env, `/public/api/jobs/${job.id}/interest`), (e) => e.status === 403);
});

test("owner can pause a job", async () => {
  const env = makeEnv(); const created = await handlePublicJobBoard(request("/public/api/owner/jobs", "POST", { brief: "งาน" }, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/jobs"); const { job } = await created.json();
  const changed = await handlePublicJobBoard(request(`/public/api/owner/jobs/${job.id}`, "PATCH", { status: "paused" }, { Authorization: "Bearer owner-test" }), env, `/public/api/owner/jobs/${job.id}`); assert.equal((await changed.json()).job.type, "public");
  await assert.rejects(() => handlePublicJobBoard(request(`/public/api/jobs/${job.id}`), env, `/public/api/jobs/${job.id}`), (e) => e.status === 404);
});

test("owner can list all jobs", async () => {
  const env = makeEnv(); await handlePublicJobBoard(request("/public/api/owner/jobs", "POST", { brief: "งาน" }, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/jobs"); const res = await handlePublicJobBoard(request("/public/api/owner/jobs", "GET", null, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/jobs"); assert.equal((await res.json()).jobs.length, 1);
});

test("owner candidates endpoint is authenticated", async () => {
  const env = makeEnv(); await assert.rejects(() => handlePublicJobBoard(request("/public/api/owner/jobs/x/candidates"), env, "/public/api/owner/jobs/x/candidates"), (e) => e.status === 401);
});

test("duplicate interest is rejected", async () => {
  const env = makeEnv(); const created = await handlePublicJobBoard(request("/public/api/owner/jobs", "POST", { brief: "งาน" }, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/jobs"); const { job } = await created.json(); const headers = { Cookie: "mmd_job_viewer=d" }; const reveal = await handlePublicJobBoard(request(`/public/api/jobs/${job.id}/reveal`, "POST", {}, headers), env, `/public/api/jobs/${job.id}/reveal`); const token = reveal.headers.get("Set-Cookie").split("=")[1].split(";")[0]; const body = { nickname: "A", gender_identity: "เกย์", customer_scope: "ผู้ชาย", reveal_token: token }; await handlePublicJobBoard(request(`/public/api/jobs/${job.id}/interest`, "POST", body, headers), env, `/public/api/jobs/${job.id}/interest`); await assert.rejects(() => handlePublicJobBoard(request(`/public/api/jobs/${job.id}/interest`, "POST", body, headers), env, `/public/api/jobs/${job.id}/interest`), (e) => e.status === 409);
});

test("owner viewer summary is opaque", async () => {
  const env = makeEnv(); await handlePublicJobBoard(request("/public/api/jobs", "GET", null, { Cookie: "mmd_job_viewer=abcd" }), env, "/public/api/jobs"); const res = await handlePublicJobBoard(request("/public/api/owner/viewers/abcd", "GET", null, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/viewers/abcd"); assert.equal(res.status, 200); assert.equal((await res.json()).viewer.viewer_ref, "Viewer #ABCD");
});

test("expired and closed jobs are not public", async () => {
  const env = makeEnv(); const created = await handlePublicJobBoard(request("/public/api/owner/jobs", "POST", { brief: "งาน" }, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/jobs"); const { job } = await created.json(); await handlePublicJobBoard(request(`/public/api/owner/jobs/${job.id}`, "PATCH", { status: "expired" }, { Authorization: "Bearer owner-test" }), env, `/public/api/owner/jobs/${job.id}`); await assert.rejects(() => handlePublicJobBoard(request(`/public/api/jobs/${job.id}`), env, `/public/api/jobs/${job.id}`), (e) => e.status === 404);
});

test("service alert payload is bounded", async () => {
  const calls = []; const env = makeEnv(); env.PUBLIC_JOB_OWNER_ALERTS = { fetch: async (_url, init) => calls.push(JSON.parse(init.body)) }; for (let i = 0; i < 5; i++) { const created = await handlePublicJobBoard(request("/public/api/owner/jobs", "POST", { brief: `งาน ${i}` }, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/jobs"); const { job } = await created.json(); await handlePublicJobBoard(request("/public/api/jobs", "GET", null, { Cookie: "mmd_job_viewer=alert" }), env, "/public/api/jobs"); await handlePublicJobBoard(request(`/public/api/jobs/${job.id}/reveal`, "POST", {}, { Cookie: "mmd_job_viewer=alert" }), env, `/public/api/jobs/${job.id}/reveal`); } assert.ok(calls.every((x) => Object.keys(x).sort().join(",") === "alert_level,display_label,last_seen,viewer_ref,viewer_status"));
});

test("public list returns no customer identifiers", async () => {
  const env = makeEnv(); await handlePublicJobBoard(request("/public/api/owner/jobs", "POST", { brief: "งาน ลูกค้า คุณลับ line abc" }, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/jobs"); const res = await handlePublicJobBoard(request("/public/api/jobs"), env, "/public/api/jobs"); const text = JSON.stringify(await res.json()); assert.equal(text.includes("line abc"), false);
});

test("unsupported job status is ignored", async () => {
  const env = makeEnv(); const created = await handlePublicJobBoard(request("/public/api/owner/jobs", "POST", { brief: "งาน" }, { Authorization: "Bearer owner-test" }), env, "/public/api/owner/jobs"); const { job } = await created.json(); const res = await handlePublicJobBoard(request(`/public/api/owner/jobs/${job.id}`, "PATCH", { status: "hack" }, { Authorization: "Bearer owner-test" }), env, `/public/api/owner/jobs/${job.id}`); assert.equal((await res.json()).job.type, "public");
});
