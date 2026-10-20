import { writeFile, mkdir } from "node:fs/promises";
import { handleLiffMemberShell } from "../member-pages-worker/src/liff-member-shell.js";
import { loadDoubleMomentCard } from "../member-pages-worker/src/liff-promotion-client.js";
import { resolveCanonicalRenewalOffer } from "../member-pages-worker/src/renewal-offer.js";
import { LIFF_RENEWAL_CARD_INTERNALS as helpers } from "../member-pages-worker/src/liff-renewal-card.js";
import { DOUBLE_MOMENT_POLICY } from "../payments-worker/double-moment-purchase-v1.js";

// No bindings, credentials, real identities, HTTP calls or payment intents.
const now = new Date("2026-10-20T12:00:00+07:00");
const offers = {};
for (const tier of ["Standard", "Premium"]) {
  const expiry = "2027-02-28T16:59:59.999Z";
  const offer = await resolveCanonicalRenewalOffer({}, { liff_intent: "renew", member_exists: true, line_user_id: "U00000000000000000000000000000000", member_profile: { tier, membership_expires_at: expiry } }, now);
  offers[tier.toLowerCase()] = { ...offer, payment_available: true, current_expires_at: expiry, renewal_starts_at: offer.membership_start_at, new_expires_at: helpers.expiryAfter(offer), bonus_days: offer.promotion?.bonus_days || 0, bonus_years: offer.promotion?.bonus_years || 0, promotion_label: helpers.promoLabel(offer.promotion), promotion_ends_before: offer.promotion?.ends_before };
}
const html = await handleLiffMemberShell(new Request("https://preview.invalid/member/liff?intent=renew")).text();
const renewal = html.slice(html.indexOf('<div id="renewal-card"'), html.indexOf('<div class="card"><h2 data-copy="packageTitle"'));
const promotion = html.slice(html.indexOf('<div id="double-moment-card"'), html.indexOf('<div id="care-back-content"'));
const renderer = html.slice(html.indexOf("  function renewalDate("), html.indexOf("  async function purchaseRenewal("));
const cardCss = html.slice(html.indexOf('.renewal-card[hidden]'), html.indexOf('\n', html.indexOf('.renewal-card[hidden]')));
const output = `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>LINE purchase review · mock only</title><style>
*{box-sizing:border-box}body{margin:0;background:#101112;color:#f6ebd8;font:15px/1.65 system-ui,sans-serif}main{max-width:460px;margin:28px auto;padding:20px}h1{font-size:25px;margin:8px 0}small,.label{color:#c8aa77}.notice{padding:12px;background:#2b251a;border:1px solid #8e784e;border-radius:12px;font-size:13px}nav{display:flex;gap:6px;flex-wrap:wrap;margin:18px 0}nav button{flex:1;min-height:44px;border:1px solid #746346;border-radius:9px;color:#f6ebd8;background:#24221e}.card{padding:20px;border:1px solid #8d784e;border-radius:16px;background:#1c1c19}h2{font-size:23px}.renewal-row b{max-width:58%;overflow-wrap:anywhere}.renewal-row span{max-width:44%}.renewal-note{font-size:13px!important;line-height:1.8!important;color:#c2b8a6!important}[hidden]{display:none!important}${cardCss}
</style><main><small>MMD PRIVÉ · LINE</small><h1>ตรวจรายการก่อนชำระ</h1><p class="notice">ตัวอย่างเท่านั้น · ข้อมูลจำลอง ณ 20 ต.ค. 2026<br>กดปุ่มได้โดยไม่เรียก API หรือสร้างรายการชำระจริง</p><nav><button id="standard">Standard</button><button id="premium">Premium</button><button id="double">Double Moment</button></nav>${renewal}${promotion}<p id="preview-receipt" role="status"></p></main><script>
const CONFIG = { liffId: "" }; const offers = ${JSON.stringify(offers)};
const purchaseRenewal = () => { document.getElementById("renewal-message").textContent = "ตัวอย่าง: ไปหน้าชำระที่มีลิงก์ลงนามเฉพาะรายการ · ไม่สร้างรายการจริง"; };
const showView = () => {}; ${renderer}
const loadDoubleMomentCard = ${loadDoubleMomentCard.toString()};
const promotionOffer = ${JSON.stringify({ ok: true, status: "ready", payment_available: true, ...DOUBLE_MOMENT_POLICY })};
const fetch = async (url, options = {}) => {
 if (options.method === "POST") throw new Error("preview_mutation_blocked");
 return {ok:true,json:async()=>promotionOffer};
};
async function select(code) {
 document.getElementById("preview-receipt").textContent = "";
 document.getElementById("renewal-card").hidden = code === "double";
 document.getElementById("double-moment-card").hidden = code !== "double";
 if (code === "double") {
   await loadDoubleMomentCard(fetch);
   document.getElementById("double-moment-action").onclick = () => { document.getElementById("preview-receipt").textContent = "ตัวอย่าง: ไปหน้าชำระเฉพาะรายการ · ไม่สร้างรายการจริง ไม่ออกเครดิตหรือโบนัส"; };
 } else renderRenewalCard(document.getElementById("renewal-card"), offers[code]);
}
for (const code of ["standard", "premium", "double"]) document.getElementById(code).onclick = () => select(code);
select("standard");</script></html>`;
await mkdir(new URL("../docs/previews/", import.meta.url), {recursive:true});
await writeFile(new URL("../docs/previews/liff-commerce.html", import.meta.url), output);
console.log("docs/previews/liff-commerce.html (self-contained, network blocked by CSP)");
