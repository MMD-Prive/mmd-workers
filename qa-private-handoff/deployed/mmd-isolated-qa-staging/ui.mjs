import {bookingReturn,loginRedirectUri,returnAuditRun,queryReturn} from "./booking-flow.mjs";
export function recoverExpiredToken(data,liff,storage,redirectUri){
  if(data?.reason!=="token_expired"||storage.getItem("mmd-qa-token-refresh")==="1")return false;
  storage.setItem("mmd-qa-token-refresh","1");
  storage.setItem("mmd-qa-liff-return","1");
  liff.logout();
  liff.login({redirectUri});
  return true;
}

export const fixtureEvidence = "MMD QA PAYMENT EVIDENCE — SYNTHETIC ONLY\n";

export function page(liffId) {
  return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MY MMD · QA Staging</title><script defer src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<script type="module" src="/qa.js"></script>
<main data-liff-id="${liffId}"><h1>MY MMD · QA Staging</h1><p>สำหรับบัญชี LINE ทดสอบและข้อมูลจำลองเท่านั้น</p>
<button id="login">เข้าสู่ระบบ LINE ทดสอบ</button>
<section id="tools" hidden>
<button id="member">อ่านสมาชิกทดสอบ</button>
<a href="/qa/fixture/evidence">ดาวน์โหลดหลักฐานทดสอบ</a>
<label>ไฟล์หลักฐานทดสอบ <input id="file" type="file" accept=".txt"></label>
<button id="upload">ส่งหลักฐาน QA</button><button id="status">อ่านสถานะ QA</button>
<label>ข้อความ QA <input id="prompt" value="KENJI-QA-001" maxlength="13"></label>
<button id="kenji">ทดสอบ Kenji</button><button id="logout">ออกจากระบบ QA</button>
</section><pre id="result" role="status" aria-live="polite"></pre></main></html>`;
}

export const client = `
const bookingReturn=${bookingReturn.toString().replace("const u=new URL(value,origin)","const origin=location.origin;const u=new URL(value,origin)")};
const loginRedirectUri=${loginRedirectUri.toString()};
const returnAuditRun=${returnAuditRun.toString()};
const queryReturn=${queryReturn.toString()};
function readBookingReturn(){try{return sessionStorage.getItem("mmd-qa-booking-return-v1");}catch{return null;}}
function qaLoginRedirect(){return loginRedirectUri(location.origin,queryReturn(location.search),readBookingReturn());}
const el = id => document.getElementById(id);
const show = result => { el("result").textContent = JSON.stringify(result, null, 2); };
async function request(path, options) {
  const res = await fetch(path, {credentials:"same-origin", ...options});
  const data = await res.json();
  show(data);
  if(path==="/qa/session"){
    if(res.ok)sessionStorage.removeItem("mmd-qa-token-refresh");
    else if((${recoverExpiredToken.toString()})(data,liff,sessionStorage,qaLoginRedirect()))return false;
  }
  if (path === "/qa/member" && res.ok) {
    if (data.fixture === true && data.member === "MMD-STAGING-CURRENT-01") return true;
    show({error:"qa_fixture_unavailable"});
    return false;
  }
  return res.ok;
}
function run(id, action) {
  el(id).addEventListener("click", async () => {
    try { await action(); } catch { show({ error: "qa_request_failed" }); }
  });
}
const sdkReady = new Promise((resolve, reject) => {
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.liff) return reject(new Error("LIFF SDK unavailable"));
    liff.init({ liffId: document.querySelector("main").dataset.liffId }).then(resolve, reject);
  }, { once: true });
});
let loginInFlight=null;
function login(source='button') {
  if(loginInFlight)return loginInFlight;
  const trigger=['button','callback'].includes(source)?source:'unknown';
  el('login').disabled=true;
  loginInFlight=(async()=>{
  await sdkReady;
  if (!liff.isLoggedIn()) {
    sessionStorage.setItem("mmd-qa-liff-return", "1");
    liff.login({ redirectUri: qaLoginRedirect() });return true;
  }
  const target=new URL(queryReturn(location.search)||bookingReturn(readBookingReturn())||location.pathname,location.origin);
  const ok = await request("/qa/session", { method:"POST", headers:{"Content-Type":"application/json","X-QA-Login-Source":trigger,"X-QA-Login-Request":crypto.randomUUID(),"X-QA-Run":returnAuditRun(target.href)||"unlabelled","X-QA-World":target.searchParams.get("world")||"unknown"},
    body: JSON.stringify({ idToken: liff.getIDToken() }) });
  if (ok) {
    const memberVerified = await request("/qa/member");
    el("tools").hidden = !memberVerified;
    return memberVerified;
  }
  return ok||sessionStorage.getItem("mmd-qa-token-refresh")==="1";
  })();
  loginInFlight.then(ok=>{if(!ok){loginInFlight=null;el('login').disabled=false;}},()=>{loginInFlight=null;el('login').disabled=false;});
  return loginInFlight;
}
run("login", ()=>login('button'));
sdkReady.then(() => {
  if (sessionStorage.getItem("mmd-qa-liff-return") === "1") {
    sessionStorage.removeItem("mmd-qa-liff-return");
    if (liff.isLoggedIn()) return login('callback');
  }
}).catch(() => show({ error: "qa_liff_unavailable" }));
run("member", () => request("/qa/member"));
run("upload", async () => {
  const file = el("file").files[0];
  if (!file || file.size > 128) return show({error:"qa_fixture_file_required"});
  const content = await file.text();
  if (content !== ${JSON.stringify(fixtureEvidence)}) return show({error:"qa_fixture_file_required"});
  await request("/qa/payment", {method:"POST", body:content, headers:{"Content-Type":"text/plain"}});
});
run("status", () => request("/qa/payment"));
run("kenji", () => request("/qa/kenji", {method:"POST",body:el("prompt").value}));
run("logout", async () => {
  if (await request("/qa/logout", {method:"POST"})) {
    el("tools").hidden = true;
    loginInFlight = null;
    el("login").disabled = false;
  }
});
`;
