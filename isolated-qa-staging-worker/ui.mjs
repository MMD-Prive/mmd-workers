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
const el = id => document.getElementById(id);
const show = result => { el("result").textContent = JSON.stringify(result, null, 2); };
async function request(path, options) {
  const res = await fetch(path, options);
  const data = await res.json();
  show(data);
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
async function login() {
  await sdkReady;
  if (!liff.isLoggedIn()) {
    sessionStorage.setItem("mmd-qa-liff-return", "1");
    return liff.login({ redirectUri: location.origin + "/member/liff" });
  }
  const ok = await request("/qa/session", { method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ idToken: liff.getIDToken() }) });
  if (ok) {
    el("tools").hidden = false;
    await request("/qa/member");
  }
}
run("login", login);
sdkReady.then(() => {
  if (sessionStorage.getItem("mmd-qa-liff-return") === "1") {
    sessionStorage.removeItem("mmd-qa-liff-return");
    if (liff.isLoggedIn()) return login();
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
  if (await request("/qa/logout", {method:"POST"})) el("tools").hidden = true;
});
`;
