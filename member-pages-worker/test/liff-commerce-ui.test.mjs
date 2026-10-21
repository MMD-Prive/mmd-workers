import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { handleLiffMemberShell } from "../src/liff-member-shell.js";
import { loadDoubleMomentCard } from "../src/liff-promotion-client.js";
import { DOUBLE_MOMENT_POLICY } from "../../payments-worker/double-moment-purchase-v1.js";
import frontGate from "../../member-dashboard-chat-worker/src/my-mms-customer-front-gate-entry.js";

class Element {
  constructor() { this.children = []; this.textContent = ""; this.hidden = true; this.disabled = false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
}
function dom() {
  const elements = new Map();
  const document = { createElement: () => new Element(), getElementById(id) { if (id === "digital-needs") return null; if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); } };
  return { document, elements };
}
const shell = query => handleLiffMemberShell(new Request("https://mmdbkk.com/member/liff" + query), {LINE_LIFF_ID:"2010862595-yT4DCEMc"}).text();

test("LINE generic renewal entry redirects to authenticated package route without browser price or identity", async () => {
  const response = await frontGate.fetch(new Request("https://www.mmdbkk.com/sigil/member/membership?source=line&intent=renew&amount=1&member_id=bad"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://miniapp.line.me/2010862595-yT4DCEMc/?intent=renew&view=package");
});

test("LIFF state preserves renewal / selected promotion and inline JS parses", async () => {
  for (const state of ["/?intent=renew", "/?intent=promo&campaign=double_moment"]) {
    const html = await shell("?liff.state=" + encodeURIComponent(state));
    assert.ok(html.includes(state.includes("promo") ? '"campaign":"double_moment"' : '"intent":"renew"'));
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new Function(match[1]);
  }
});

test("renewal card separates purchased year, CARE BACK bonus, expiry, promotion deadline and exact price", async () => {
  const html = await shell("?intent=renew"); const { document, elements } = dom();
  const source = html.slice(html.indexOf("  function renewalDate("), html.indexOf("  async function purchaseRenewal("));
  const render = new Function("document", "CONFIG", "purchaseRenewal", source + "; return renderRenewalCard;")(document, {}, () => {});
  render(document.getElementById("renewal-card"), {status:"ready",payment_available:true,package_code:"premium",package_label:"Premium",amount_thb:2500,membership_years:1,bonus_years:1,current_expires_at:"2027-02-28",renewal_starts_at:"2027-02-28",new_expires_at:"2029-02-28",promotion_ends_before:"2026-11-01T00:00:00+07:00"});
  assert.match(elements.get("renewal-rows").children.map(row => row.children.map(x => x.textContent).join(":")).join("\n"), /ระยะเวลาที่ซื้อ:1 ปี[\s\S]*CARE BACK เพิ่ม:1 ปี/);
  assert.match(elements.get("renewal-note").textContent, /31 ต.ค. 2026/);
  assert.match(elements.get("renewal-action").textContent, /2,500/);
  render(document.getElementById("renewal-card"), {status:"contact_owner"});
  assert.equal(elements.get("renewal-action").hidden, true);
  assert.equal(elements.get("renewal-price").hidden, true);
});

test("Double Moment numbers, validity and credit constraints render; double-tap produces only one pending purchase", async () => {
  const { document, elements } = dom(); let requests = 0, resolve;
  const purchase = new Promise(r => { resolve = r; });
  const ctx = { document, Intl, URL, window:{location:{assign() { throw new Error("must_not_redirect"); }}}, fetch: async (url, options) => {
    if (options?.method === "POST") { requests++; return purchase; }
    return Response.json({ ok:true,status:"ready",payment_available:true,...DOUBLE_MOMENT_POLICY });
  } };
  await runInNewContext("(" + loadDoubleMomentCard.toString() + ")()", ctx);
  assert.match(elements.get("double-moment-rows").children.map(row => row.children.map(x => x.textContent).join(":")).join("\n"), /27,000[\s\S]*180 วัน/);
  assert.match(elements.get("double-moment-note").textContent, /ไม่ใช่เงินสด[\s\S]*20,000[\s\S]*คืนเงินไม่ได้/);
  assert.match(elements.get("double-moment-note").textContent, /คนละงานที่ยืนยันแล้ว/);
  assert.match(elements.get("double-moment-note").textContent, /1 แพ็กเกจต่อสมาชิกต่อแคมเปญ/);
  const button = elements.get("double-moment-action");
  const first = button.onclick(); const second = button.onclick(); assert.equal(requests, 1);
  resolve(Response.json({ok:false}, {status:503})); await Promise.all([first, second]);
  assert.equal(button.disabled, false); assert.match(elements.get("double-moment-note").textContent, /ลองอีกครั้ง/);
});
