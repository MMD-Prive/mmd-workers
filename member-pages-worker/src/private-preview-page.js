// This shell stores no draft, token or media in persistent browser storage.
export function privatePreviewPage() {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  return new Response(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MMD Private Media</title><style nonce="${nonce}">
body{margin:0;background:#11100f;color:#f6f0e8;font:16px system-ui,sans-serif}main{max-width:540px;margin:auto;padding:32px 20px}h1{font-size:26px}p{line-height:1.7;color:#d6cbc0}button,a{display:inline-block;background:#ddc294;color:#211b15;border:0;padding:14px 22px;border-radius:12px;font:inherit}button:disabled{opacity:.45}#stage{position:relative;margin-top:24px}img,video{display:block;width:100%;max-height:70vh;object-fit:contain;pointer-events:none}#mark{position:absolute;inset:45% 0 auto;text-align:center;color:#fff9;text-shadow:0 1px 4px #000;pointer-events:none}a{margin-top:16px;text-decoration:none}
</style></head><body><main><p>MMD PRIVÉ</p><h1>Private Media</h1><p id="message">กำลังตรวจสิทธิ์ของคุณ</p><button id="open" hidden>เปิดดู</button><a id="login" href="/my-mmd/" hidden>เข้าสู่ MY MMD</a><div id="stage"></div></main><script nonce="${nonce}">
(() => {
  const params = new URLSearchParams(location.hash.slice(1)); let token = params.get('t') || '';
  history.replaceState(null,'',location.pathname);
  const message = document.getElementById('message'), button = document.getElementById('open'), stage = document.getElementById('stage');
  let policy = null, objectUrl = '', timer = 0, used = false, closed = false;
  const controller = new AbortController();
  function close(text) { closed = true; clearTimeout(timer); controller.abort(); const video = stage.querySelector('video'); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } stage.replaceChildren(); if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = ''; token = ''; button.hidden = true; message.textContent = text; }
  function conceal() { if (used) close('สิ้นสุดการรับชมแล้ว สิทธิ์นี้ใช้ได้ครั้งเดียว'); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) conceal(); });
  window.addEventListener('pagehide',conceal);
  stage.addEventListener('contextmenu',event => event.preventDefault());
  async function init() {
    if (!token) return close('ไม่พบลิงก์รับชม กรุณาเปิดลิงก์ที่ MMD ส่งให้คุณ');
    try {
      const response = await fetch('/api/member/app/private-preview/status?t='+encodeURIComponent(token),{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      const body = await response.json();
      if (response.status === 401) { document.getElementById('login').hidden = false; return close('เข้าสู่ MY MMD แล้วเปิดลิงก์นี้อีกครั้ง'); }
      if (!response.ok || body.ok !== true || !['private_pic','private_clip'].includes(body.preview?.kind) || body.preview.viewLimit !== 1) return close('สิทธิ์นี้ยังไม่พร้อม หมดอายุ หรือใช้ไปแล้ว กรุณาติดต่อ MMD');
      policy = body.preview; button.hidden = false;
      message.textContent = policy.kind === 'private_pic' ? 'เปิดดูรูปได้ 3 วินาที ครั้งเดียว เมื่อพร้อมแล้วกดเปิดดู' : 'เล่นคลิปได้ครั้งเดียว เมื่อพร้อมแล้วกดเริ่มเล่น';
      button.textContent = policy.kind === 'private_pic' ? 'เปิดดู 3 วินาที' : 'เริ่มเล่นครั้งเดียว';
    } catch { if (!closed) close('ยังตรวจสิทธิ์ไม่ได้ กรุณาลองเปิดลิงก์ใหม่ภายหลัง'); }
  }
  button.addEventListener('click',async () => {
    if (used || !policy || closed) return; used = true; button.disabled = true;
    message.textContent = 'กำลังเปิดสื่อส่วนตัว';
    try {
      const response = await fetch('/api/member/app/private-preview/consume',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({t:token}),signal:controller.signal});
      token = '';
      const mime = response.headers.get('content-type') || '';
      if (!response.ok || response.headers.get('x-mmd-preview-consumed') !== 'true' || !(policy.kind === 'private_pic' ? /^image\\/(jpeg|png|webp)$/.test(mime) : mime === 'video/mp4')) return close('เปิดสื่อไม่ได้ กรุณาติดต่อ MMD เพื่อตรวจสิทธิ์');
      const blob = await response.blob(); if (closed || document.hidden) return conceal();
      objectUrl = URL.createObjectURL(blob);
      const media = document.createElement(policy.kind === 'private_pic' ? 'img' : 'video');
      media.addEventListener('error',()=>close('เปิดสื่อไม่ได้ กรุณาติดต่อ MMD'));
      if (policy.kind === 'private_pic') {
        media.alt = 'Private Pic'; media.draggable = false;
        media.addEventListener('load',()=>{ if (closed) return; timer = setTimeout(conceal,3000); });
      } else {
        media.playsInline = true; media.controls = false; media.loop = false; media.disablePictureInPicture = true;
        media.setAttribute('controlslist','nodownload noremoteplayback'); media.addEventListener('ended',conceal);
        media.addEventListener('seeking',conceal);
      }
      const mark = document.createElement('span'); mark.id = 'mark'; mark.textContent = policy.watermark || 'MMD PRIVÉ';
      media.src = objectUrl; stage.replaceChildren(media,mark); button.hidden = true; message.textContent = 'สิทธิ์รับชมครั้งเดียว';
      if (policy.kind === 'private_clip') await media.play();
    } catch { if (!closed) close('การรับชมสิ้นสุดแล้ว หากเปิดไม่สำเร็จ กรุณาติดต่อ MMD'); }
  });
  init();
})();
</script></body></html>`, { headers: {
    "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store, max-age=0", "referrer-policy": "no-referrer",
    "x-frame-options": "DENY", "x-content-type-options": "nosniff", "permissions-policy": "camera=(), microphone=(), display-capture=()",
    "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src blob:; media-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  } });
}
