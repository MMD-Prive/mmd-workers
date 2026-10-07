import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync(new URL("../src/liff-member-shell.js", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("  let memberApiChain"), source.indexOf("  function requestId()"));
function setup(membership, profileResponse) {
  const nodes = { "minimal-member-display":{hidden:true}, "minimal-member-expiry":{textContent:"—"}, "minimal-member-points":{textContent:"12.5 คะแนนประมาณการ"}, "profile-tier": { textContent: "SVIP" }, "profile-status": { textContent: "checking" }, "profile-points": { textContent: "—" } };
  const calls = [];
  const context = vm.createContext({setTimeout,
    fetch: async path => { calls.push(path); return path === "/api/member/app/membership" ? Response.json(membership) : profileResponse; },
    CONFIG: { profileEndpoint: "/member/api/liff/profile" },
    document: { getElementById: id => nodes[id] },
    safeDate: value => value || "", shortDate: value => value,
    membershipStatus: value => value, renderProfile() {}, renderCustomerContact() {}, hydrateMemberHome: async () => {},
  });
  vm.runInContext(functions, context);
  return { nodes, calls, context };
}

test("canonical membership renders before the full profile completes", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = setup({ level:"premium", levelVerified:true, status:"expired", expiresAt:"2026-09-01" }, pending);
  const full = h.context.readProfile({ hydrate:false });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.nodes["profile-tier"].textContent, "Premium");
  assert.equal(h.nodes["profile-status"].textContent, "expired · ถึง 2026-09-01");
  assert.equal(h.nodes["profile-points"].textContent, "—");
  assert.equal(h.nodes["minimal-member-display"].hidden,false);
  assert.equal(h.nodes["minimal-member-expiry"].textContent,"2026-09-01");
  assert.equal(h.nodes["minimal-member-points"].textContent,"12.5 คะแนนประมาณการ");
  assert.deepEqual(h.calls, ["/api/member/app/membership", "/member/api/liff/profile"]);
  release(Response.json({ ok:true, data:{} })); await full;
});

test("unverified/missing membership does not downgrade a protected display or invent points", async () => {
  for (const value of [{ level:"standard", levelVerified:false, status:"checking" }, { ok:false }, {}]) {
    const h = setup(value, Response.json({ ok:false }, { status:401 }));
    await h.context.readQuickMembershipStatus();
    assert.equal(h.nodes["profile-tier"].textContent, "SVIP");
    assert.equal(h.nodes["profile-points"].textContent, "—");
  }
});

test("active canonical status carries its authoritative expiry", async () => {
  const h = setup({ level:"vip", levelVerified:true, status:"active", expiresAt:"2027-01-01" }, null);
  await h.context.readQuickMembershipStatus();
  assert.equal(h.nodes["profile-tier"].textContent, "VIP");
  assert.equal(h.nodes["profile-status"].textContent, "active · ถึง 2027-01-01");
});
test('missing expiry leaves an independently supported provisional points field visible',async()=>{const h=setup({level:'svip',levelVerified:true,status:'active'},null);await h.context.readQuickMembershipStatus();assert.equal(h.nodes['minimal-member-expiry'].textContent,'—');assert.equal(h.nodes['minimal-member-points'].textContent,'12.5 คะแนนประมาณการ');assert.equal(h.nodes['profile-tier'].textContent,'SVIP');assert.equal(h.nodes['minimal-member-display'].hidden,false);});

test("failed membership read reports only the status code and state in the card", async () => {
  const h = setup(null, null);
  h.nodes["minimal-member-diag"] = { textContent: "" };
  h.context.fetch = async () => Response.json({ ok: false, state: "checking", error: "checking" }, { status: 401 });
  await h.context.readQuickMembershipStatus();
  assert.equal(h.nodes["minimal-member-diag"].textContent, "อ่านข้อมูลสมาชิกไม่สำเร็จ (401 checking)");
  assert.equal(h.nodes["minimal-member-expiry"].textContent, "—");
});

test("successful read without a usable expiry reports field presence only", async () => {
  const h = setup({ level: "svip", levelVerified: true, status: "active" }, null);
  h.nodes["minimal-member-diag"] = { textContent: "" };
  await h.context.readQuickMembershipStatus();
  assert.equal(h.nodes["minimal-member-diag"].textContent, "ไม่พบวันหมดอายุ (200 status=active expiresAt=empty renewal=empty)");
});

test("an exception during the read is reported by name", async () => {
  const h = setup(null, null);
  h.nodes["minimal-member-diag"] = { textContent: "" };
  h.context.fetch = async () => { throw new TypeError("boom"); };
  await h.context.readQuickMembershipStatus();
  assert.equal(h.nodes["minimal-member-diag"].textContent, "อ่านข้อมูลสมาชิกผิดพลาด (TypeError)");
});
