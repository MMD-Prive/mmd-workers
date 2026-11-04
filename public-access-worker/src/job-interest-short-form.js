import { jobInterestReassurance } from './job-interest-reassurance.js';
export const SHORT_FORM_VERSION = "job-interest-short-v1";
export const SHORT_MEDIA_LIMIT = 25 * 1024 * 1024;
const PHOTO_TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["image/heic", "heic"], ["image/heif", "heif"]]);
const CLIP_TYPES = new Map([["video/mp4", "mp4"], ["video/quicktime", "mov"], ["video/webm", "webm"]]);

export function shortMediaSlot(slot, contentType) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 10) return null;
  const kind = slot <= 8 ? "photo" : slot === 9 ? "clip" : "compcard";
  const extension = (kind === "clip" ? CLIP_TYPES : PHOTO_TYPES).get(contentType);
  return extension ? { kind, extension } : null;
}

export function shortProfile(input) {
  const value = (key, limit) => typeof input[key] === "string" ? input[key].trim().slice(0, limit) : "";
  const profile = { nickname: value("nickname", 80), line_id: value("line_id", 120), phone: value("phone", 40) };
  if (!profile.nickname) return { error: "nickname_required" };
  if (!profile.line_id && !profile.phone) return { error: "contact_required" };
  return { profile };
}

export function shortFormMarkup(jobId, title, escape, { publicJob = true } = {}) {
  return `<main><a class="back" href="/public/api/jobs/${encodeURIComponent(jobId)}">← กลับไปอ่านบรีฟ</a><section class="detail jd-short"><p class="eyebrow">Jobs:</p><h1>${escape(title)}</h1><form data-short-interest>
  <label>ชื่อเล่น<input name="nickname" autocomplete="nickname" required maxlength="80"></label>
  <div class="jd-contact"><label>LINE<input name="line_id" maxlength="120"></label><label>เบอร์โทร<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label></div>
  <p>ฝาก LINE หรือเบอร์โทรอย่างใดอย่างหนึ่งครับ</p>
  ${publicJob ? '<p><button class="jd-reassurance-trigger" type="button" data-reassurance-open>ยังไม่มั่นใจ? อ่านข้อความจากเปอร์ก่อนได้ครับ</button></p>' : ''}
  <fieldset><legend>รูปปัจจุบัน</legend><div class="jd-photos">${Array.from({ length: 8 }, (_, i) => `<label class="jd-slot"><span>รูป ${i + 1}</span><img hidden alt="พรีวิวรูป ${i + 1}"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" data-slot="${i + 1}" aria-label="เลือกรูป ${i + 1}"></label>`).join("")}</div>
  <label class="jd-bulk">เลือกรูปพร้อมกัน<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple data-bulk></label>
  <p>กรุณาไม่ใช้รูปที่สวมแว่นดำ หมวก</p><p>กรุณาเลือกรูปที่เห็นหน้าชัดเจน ไม่เซลฟี่ ไม่แต่งสีภาพจนไม่ตรงกับปก</p></fieldset>
  <div class="jd-support"><label class="jd-slot">คลิป<video hidden controls playsinline></video><input type="file" accept="video/mp4,video/quicktime,video/webm" data-slot="9" aria-label="เลือกคลิป"></label><label class="jd-slot">คอมการ์ด<img hidden alt="พรีวิวคอมการ์ด"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" data-slot="10" aria-label="เลือกคอมการ์ด"></label></div>
  <p>ไฟล์ละไม่เกิน 25 MB · คลิปและคอมการ์ดส่งเพิ่มได้ตามสะดวก</p><button class="primary" type="submit">ส่งข้อมูล</button><p data-short-status role="status" aria-live="polite"></p></form>${publicJob ? jobInterestReassurance(`/public/api/jobs/${encodeURIComponent(jobId)}`) : ""}</section></main>
  <style>body.mmd-worker-surface .detail.jd-short{background:#faf6ed!important;color:#26201c!important;border-color:#ded4c4!important;box-shadow:none!important;padding:22px!important}body.mmd-worker-surface .detail.jd-short h1{font-size:24px!important;line-height:1.4!important;color:#26201c!important;letter-spacing:normal!important}body.mmd-worker-surface .detail.jd-short :is(p,label,legend){color:#655a50!important}body.mmd-worker-surface .detail.jd-short input{background:#fffdf7!important;color:#26201c!important;border-color:#cfc3b3!important}body.mmd-worker-surface .detail.jd-short .primary{background:#8f2636!important;color:#fff!important}body.mmd-worker-surface .detail.jd-short .eyebrow{color:#8f2636!important}.jd-bulk{position:relative;min-height:44px;display:flex;justify-content:center;border:1px solid #cfc3b3;border-radius:8px;cursor:pointer}.jd-bulk input{position:absolute;inset:0;opacity:0;cursor:pointer}.jd-short{max-width:680px;margin:auto}.jd-short h1{font-size:clamp(24px,5vw,38px)!important;line-height:1.4!important}.jd-short p{font-size:13px;margin:8px 0}.jd-contact,.jd-support{display:grid;grid-template-columns:1fr 1fr;gap:12px}.jd-short fieldset{border:0;padding:0;margin:20px 0}.jd-photos{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.jd-slot{min-width:0;position:relative;border:1px solid #89745d;border-radius:8px;padding:8px;overflow:hidden}.jd-photos .jd-slot{aspect-ratio:1;display:flex;align-items:center;justify-content:center;margin:0}.jd-slot input{position:absolute;inset:0;opacity:0;cursor:pointer;min-height:44px}.jd-slot:focus-within{outline:2px solid #c9a14a;outline-offset:2px}.jd-slot img,.jd-slot video{width:100%;max-height:180px;object-fit:contain}.jd-photos img{position:absolute;inset:0;height:100%;object-fit:cover}.jd-short input{min-height:44px;min-width:0;font-size:16px}.jd-support .jd-slot{min-height:100px}.jd-short button:disabled{opacity:.6}</style>`;
}

// The same function is exercised by the focused browser tests and embedded below.
export function mountShortInterest(jobId, version, maxBytes) {
  const form = document.querySelector("[data-short-interest]");
  const status = document.querySelector("[data-short-status]");
  const submit = form.querySelector("button[type=submit]");
  const files = new Map();
  const urls = new Map();
  let applicationRef = "";
  let busy = false;
  let finished = false;
  const say = (message) => { status.textContent = message; };
  const base = "/public/api/jobs/" + encodeURIComponent(jobId);
  async function jsonRequest(path, body) {
    const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "request_failed");
    return data;
  }
  function select(slot, file) {
    if (!file || finished) return;
    const isClip = slot === 9;
    const allowed = isClip ? ["video/mp4", "video/quicktime", "video/webm"] : ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!allowed.includes(file.type) || file.size < 1 || file.size > maxBytes) { say("เลือกชนิดไฟล์ให้ตรงช่อง และไฟล์ละไม่เกิน 25 MB ครับ"); return; }
    if (urls.has(slot)) URL.revokeObjectURL(urls.get(slot));
    files.set(slot, file);
    const url = URL.createObjectURL(file); urls.set(slot, url);
    const input = form.querySelector('[data-slot="' + slot + '"]');
    const preview = input.parentElement.querySelector(isClip ? "video" : "img");
    preview.src = url; preview.hidden = false; say("");
  }
  for (const input of form.querySelectorAll("[data-slot]")) input.addEventListener("change", () => { select(Number(input.dataset.slot), input.files[0]); input.value = ""; });
  form.querySelector("[data-bulk]").addEventListener("change", (event) => {
    const selected = [...event.target.files]; event.target.value = "";
    const free = Array.from({ length: 8 }, (_, i) => i + 1).filter(slot => !files.has(slot));
    if (selected.length > free.length) { say("ส่งรูปได้สูงสุด 8 รูปครับ"); return; }
    selected.forEach((file, i) => select(free[i], file));
  });
  addEventListener("pagehide", () => { for (const url of urls.values()) URL.revokeObjectURL(url); }, { once: true });
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (busy || finished) return;
    const data = new FormData(form);
    const profile = { nickname: String(data.get("nickname") || "").trim(), line_id: String(data.get("line_id") || "").trim(), phone: String(data.get("phone") || "").trim() };
    if (!profile.nickname) return say("กรอกชื่อเล่นก่อนครับ");
    if (!profile.line_id && !profile.phone) return say("ฝาก LINE หรือเบอร์โทรอย่างใดอย่างหนึ่งครับ");
    if (![...files.keys()].some(slot => slot <= 8)) return say("เพิ่มรูปปัจจุบันที่เห็นหน้าชัดเจนก่อนครับ");
    busy = true; submit.disabled = true;
    for (const input of form.querySelectorAll("input")) input.disabled = true;
    try {
      say("กำลังส่งข้อมูล…");
      if (!applicationRef) applicationRef = (await jsonRequest(base + "/interest", { form_version: version })).application_ref;
      for (const [slot, file] of files) {
        const grant = await jsonRequest(base + "/applications/" + encodeURIComponent(applicationRef) + "/upload-grant", { slot, content_type: file.type, size: file.size });
        const response = await fetch(grant.upload.url, { method: "PUT", credentials: "same-origin", headers: { "content-type": file.type }, body: file });
        if (!response.ok) throw new Error("upload_failed");
      }
      await jsonRequest(base + "/applications/" + encodeURIComponent(applicationRef) + "/submit", { ...profile, form_version: version });
      finished = true; say("ได้รับข้อมูลสำหรับงานนี้แล้วครับ"); submit.textContent = "ส่งข้อมูลแล้ว";
    } catch (error) { say(error.message === "job_interest_already_exists" ? "คุณมีข้อมูลความสนใจงานนี้อยู่แล้วครับ" : "ยังยืนยันการส่งไม่สำเร็จ ข้อมูลยังอยู่ กดลองอีกครั้งได้ครับ"); }
    finally { busy = false; submit.disabled = finished; for (const input of form.querySelectorAll("input")) input.disabled = finished; }
  });
}

export function shortFormScript(jobId) {
  return `<script>(()=>{const __name=(value)=>value;(${mountShortInterest.toString()})(${JSON.stringify(jobId)},${JSON.stringify(SHORT_FORM_VERSION)},${SHORT_MEDIA_LIMIT});})();</script>`;
}
