import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCredentialBoundAdminSession, readCredentialBoundAdminActor } from "./src/credential-bound-admin-session.js";
import { handleCreateSessionClientLineageRequest } from "./src/create-session-client-lineage-runtime.js";

// Exercise the core auth function in isolation from unrelated Worker bindings.
const core = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const authSource = core.slice(core.indexOf("export async function isAuthed("), core.indexOf("\nfunction isConfirmKeyAuthed("));
const isAuthed = new Function("readCredentialBoundAdminActor", "isAdminGateSessionAuthed", "str",
  authSource.replace("export ", "") + "; return isAuthed;")(readCredentialBoundAdminActor, async () => false, v => String(v || "").trim());
const env = { ADMIN_LOGIN_CREDENTIAL: "test-only-login", ADMIN_SESSION_SECRET: "test-only-session" };
async function request(role="admin", host="https://mmdbkk.com", tokenHost=host) {
  const token = await createCredentialBoundAdminSession(new Request(tokenHost), {id:"test-owner",role}, env);
  return new Request(host+"/v1/admin/clients/lineage-lookup", {method:"POST",headers:{Cookie:"mmd_admin_gate_v1="+token,"Content-Type":"application/json"},body:'{"query":"test"}'});
}
test("current login session passes core create authorization", async()=>{
  assert.equal(await isAuthed(await request(),env),true);
});
test("current session passes lineage auth to the storage readiness guard",async()=>{
  const response=await handleCreateSessionClientLineageRequest(await request(),env);
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,"lineage_storage_not_ready");
});
test("partner session cannot authorize core or lineage",async()=>{
  assert.equal(await isAuthed(await request("mms_partner"),env),false);
  assert.equal((await handleCreateSessionClientLineageRequest(await request("mms_partner"),env)).status,401);
});
test("production www session follows shared canonical verifier",async()=>{
  assert.equal(await isAuthed(await request("admin","https://www.mmdbkk.com","https://mmdbkk.com"),env),true);
});
test("production session cannot be replayed on staging",async()=>{
  const req=await request("admin","https://mmdprive.webflow.io","https://mmdbkk.com");
  assert.equal(await isAuthed(req,env),false);
  assert.equal((await handleCreateSessionClientLineageRequest(req,env)).status,401);
});
test("spoofed actor headers do not authorize requests",async()=>{
  const req=new Request("https://mmdbkk.com/v1/admin/clients/lineage-lookup",{method:"POST",headers:{"x-mmd-admin-role":"admin","x-mmd-admin-source":"credential-bound-session"},body:"{}"});
  assert.equal(await isAuthed(req,env),false);
  assert.equal((await handleCreateSessionClientLineageRequest(req,env)).status,401);
});
test("lookup route declarations cover both production hosts",async()=>{
  const config=await readFile(new URL("./wrangler.toml",import.meta.url),"utf8");
  for(const host of ["mmdbkk.com","www.mmdbkk.com"])
    for(const path of ["/v1/admin/clients/lineage-lookup","/v1/admin/clients/recent"])
      assert.ok(config.includes('pattern = "'+host+path+'"'));
});

test("SIGIL private aliases cannot skip the authoritative entitlement check", async()=>{
  const start=core.indexOf("async function createAdminJob(");
  const source=core.slice(start,core.indexOf("\nexport async function callPaymentsCreateLink",start));
  const create=new Function("str","enforcePrivateCreateAccess",source+"; return createAdminJob;")(v=>String(v||"").trim(),async()=>{throw new Error("private_gate_reached")});
  for(const body of [{visibility:"private"},{job_details:{world:"private"}},{work:{job_visibility:"public"},visibility:"private"}])
    await assert.rejects(create({},body),/private_gate_reached/);
});
