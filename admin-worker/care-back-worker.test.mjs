import test from "node:test";
import assert from "node:assert/strict";
import { handleCareBackRequest, isCareBackPath } from "./src/care-back-worker.js";

const env = { AIRTABLE_BASE_ID: "base1", AIRTABLE_API_KEY: "key", AIRTABLE_TABLE_CLIENTS_ID: "tblClients", AIRTABLE_TABLE_CONSOLE_INBOX_ID: "tblInbox", CONFIRM_KEY: "boss" };
const call = (path, method = "GET", body, headers = {}) => handleCareBackRequest(new Request("https://mmdbkk.com" + path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }), env, path, method);

test("recognizes only Care Back namespace", () => { assert.equal(isCareBackPath("/studio/api/care-back/overview"), true); assert.equal(isCareBackPath("/studio/api/intake/validate"), false); });
test("overview reads Clients", async () => { globalThis.fetch = async () => Response.json({ records: [{ id: "rec1", fields: { "Client Name": "A", Status: "ตอบกลับ" } }, { id: "rec2", fields: { "Client Name": "B", Status: "กลับมาแล้ว" } }] }); const response = await call("/studio/api/care-back/overview"); const data = await response.json(); assert.equal(data.metrics.customers, 2); assert.equal(data.metrics.returned, 1); });
test("customer mutation writes queue, not Clients", async () => { let url = ""; globalThis.fetch = async (u) => { url = String(u); return Response.json({ id: "recQueue" }); }; const response = await call("/studio/api/care-back/customers", "POST", { client_name: "Test" }); assert.match(url, /tblInbox$/); assert.equal(response.status, 202); assert.equal((await response.json()).mode, "queued"); });
test("Boss decision requires confirm key", async () => { const response = await call("/studio/api/care-back/approvals/apr_1/decision", "POST", { decision: "approved" }); assert.equal(response.status, 403); });
test("Public review requires completed Private pilot", async () => { const response = await call("/studio/api/care-back/campaign", "PUT", { visibility: "public_review" }, { "X-Confirm-Key": "boss" }); assert.equal(response.status, 409); assert.equal((await response.json()).error, "private_pilot_required"); });
