/** MMD NEXT LV · /member/kenji (presentation only).
 * Never receives tokens, account authority or unverified membership fields.
 * HTML / CSS / client JS form one CSP-nonced, same-origin document.
 * Replace the Kenji hero CDN image in this template only after asset review.
 */
const NEXT_LV_DOCUMENT = String.raw`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0d0f12"><meta name="robots" content="noindex,nofollow"><title>Kenji · MY MMD Concierge</title><meta name="description" content="Kenji — ผู้ช่วยข้อมูลสมาชิก MY MMD คำถามทั่วไปและโปรโมชั่นที่ประกาศแล้ว"><style nonce="test_nonce">
:root{color-scheme:dark;--bg:#0d0f12;--surface:#17191d;--surface2:#202126;--ink:#f7f1e7;--muted:#b8b2aa;--dim:#918a85;--border:rgba(239,222,203,.13);--wine:#a21e39;--wine2:#762035;--gold:#cfb28a;--focus:#f4c594}
*{box-sizing:border-box}
html,body{margin:0;width:100%;min-height:100%;background:var(--bg)}
body{font-family:"LINE Seed Sans TH","Noto Sans Thai",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);overflow:hidden}
a{color:inherit;text-decoration:none}button,textarea{font:inherit}button{cursor:pointer}button:disabled{cursor:wait;opacity:.55}
[hidden]{display:none!important}a:focus-visible,button:focus-visible,textarea:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
.skip{position:fixed;top:4px;left:8px;z-index:20;transform:translateY(-150%);padding:9px 12px;background:var(--ink);color:var(--bg);border-radius:8px}.skip:focus{transform:none}
.page{height:100vh;height:100dvh;min-height:460px;max-width:1550px;margin:0 auto;display:grid;grid-template-rows:70px minmax(0,1fr);background:var(--bg)}
.top{display:flex;align-items:center;justify-content:space-between;padding:0 clamp(16px,3vw,38px);gap:16px;border-bottom:1px solid var(--border);min-width:0}
.brand{display:flex;align-items:center;gap:13px;min-width:0}.brand-mark{font-family:Georgia,serif;font-size:28px;letter-spacing:-.085em;line-height:1;font-weight:600;color:var(--ink)}.brand-rule{height:25px;width:1px;background:var(--border)}.brand-label{display:grid;gap:2px;min-width:0}.brand-label strong{font-size:12px;letter-spacing:.19em;font-weight:700}.brand-label small{font-size:9px;letter-spacing:.18em;color:var(--gold);white-space:nowrap}
.top-actions{display:flex;gap:17px;align-items:center}.top-link{font-size:12px;color:var(--muted);white-space:nowrap;transition:color .2s}.top-link:hover{color:var(--ink)}.top-link span{color:var(--gold);margin-left:5px}.top-link--outline{border:1px solid var(--border);padding:9px 14px;border-radius:99px}
.workspace{display:grid;grid-template-columns:minmax(0,.94fr) minmax(0,1.06fr);min-height:0;gap:18px;padding:18px clamp(16px,2.7vw,38px) 24px}
.hero{position:relative;isolation:isolate;min-height:0;overflow:hidden;border:1px solid var(--border);border-radius:23px;background:linear-gradient(150deg,#242020,#101113 70%)}
.hero:before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(12,12,14,.98) 1%,rgba(13,13,15,.87) 40%,rgba(12,12,14,.18) 91%),linear-gradient(0deg,#111114 0%,transparent 58%);pointer-events:none}
.hero-image{display:block;position:absolute;inset:0 0 0 auto;height:100%;width:90%;object-fit:cover;object-position:65% 25%;filter:saturate(.77) contrast(1.04)}
.hero-grain{position:absolute;z-index:2;inset:0;opacity:.19;pointer-events:none;background:radial-gradient(circle at 85% 19%,rgba(219,172,125,.34),transparent 33%)}
.hero-copy{position:relative;z-index:3;padding:clamp(23px,3.6vw,56px);max-width:85%;display:flex;flex-direction:column;align-items:flex-start;height:100%}
.eyebrow{color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.24em;text-transform:uppercase}.hero-title{font-family:Georgia,"Times New Roman",serif;font-weight:400;line-height:.96;letter-spacing:-.065em;font-size:clamp(76px,10.2vw,144px);margin:25px 0 11px}.hero-italic{font:italic 400 clamp(17px,1.7vw,23px)/1.3 Georgia,serif;color:var(--ink)}
.hero-copy h1{font-size:clamp(21px,2.15vw,29px);font-weight:550;line-height:1.45;letter-spacing:-.03em;max-width:330px;margin:auto 0 8px}.hero-body{max-width:335px;color:#d4cfc8;line-height:1.7;font-size:13px;margin:0 0 20px}
.hero-divider{width:45px;height:1px;background:var(--gold);opacity:.8;margin-bottom:13px}.hero-footnote{font-size:10px;line-height:1.65;letter-spacing:.06em;color:var(--dim);max-width:290px}
.hero-links{display:flex;gap:11px;flex-wrap:wrap;margin-bottom:20px}.hero-links a{display:inline-flex;align-items:center;justify-content:center;min-height:41px;padding:10px 16px;border-radius:30px;font-size:12px;font-weight:750;border:1px solid var(--border)}.hero-links a:first-child{background:var(--wine);border-color:#bb3b54}.hero-links a:last-child{background:rgba(10,10,12,.65)}
.chat-shell{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:23px}
.chat-head{padding:18px 24px 13px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--border)}.chat-heading{display:flex;align-items:center;gap:11px}.small-avatar{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--wine2);border:1px solid rgba(252,208,207,.3);font:italic 25px Georgia,serif}.chat-name{display:grid;gap:2px}.chat-name strong{font-size:15px;letter-spacing:.01em;font-weight:720}.chat-name small{font-size:10px;letter-spacing:.14em;color:var(--muted)}
.clear{background:transparent;border:1px solid var(--border);border-radius:99px;color:var(--muted);font-size:11px;min-height:35px;padding:6px 13px}.clear:hover{color:var(--ink);border-color:var(--gold)}
.member-line{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#211d20;border-bottom:1px solid var(--border);padding:9px 24px;font-size:11px;color:var(--muted)}.member-line strong{font-weight:700;color:var(--ink)}.member-line a{text-decoration:underline;text-underline-offset:3px;color:var(--gold);white-space:nowrap}.member-line span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mode-row{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:15px 24px 0;padding:4px;background:#111317;border:1px solid var(--border);border-radius:14px}
.mode{border:0;border-radius:10px;background:transparent;color:var(--muted);font-size:13px;font-weight:700;min-height:39px}.mode[aria-pressed="true"]{background:#47202c;color:var(--ink);box-shadow:inset 0 0 0 1px rgba(198,99,120,.24)}
.intro-panel{padding:13px 24px 8px}.intro-panel h2{font-size:13px;font-weight:650;margin:0 0 10px}.prompt-row{display:flex;gap:7px;overflow:auto;scrollbar-width:none;padding-bottom:5px}.prompt-row::-webkit-scrollbar{display:none}.prompt{flex:none;min-height:35px;padding:7px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:999px;color:var(--ink);font-size:11px;white-space:nowrap}.prompt:hover{border-color:rgba(209,176,131,.65)}
.promo-info{border:1px solid rgba(207,178,138,.28);padding:13px 15px;border-radius:12px;background:#231d1c;display:grid;gap:5px}.promo-info strong{font-size:13px}.promo-info p{font-size:11px;color:var(--muted);margin:0;line-height:1.6}.promo-info a{font-size:12px;color:var(--gold);font-weight:700;margin-top:5px}
.history{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:18px 24px 24px;display:flex;flex-direction:column;gap:14px;scrollbar-color:#4d4142 transparent}
.message{display:flex;align-items:flex-end;gap:9px;max-width:92%}.message--user{align-self:flex-end;flex-direction:row-reverse}.message--bot{align-self:flex-start}.message__avatar{width:27px;height:27px;display:flex;align-items:center;justify-content:center;flex:none;border:1px solid rgba(231,190,159,.25);background:var(--wine2);border-radius:50%;font:italic 16px Georgia,serif}.message__bubble{font-size:13px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;border:1px solid var(--border);border-radius:15px 15px 15px 4px;padding:12px 14px;background:#25262a;color:var(--ink)}.message--user .message__bubble{background:#4b2431;border-color:#754050;border-radius:15px 15px 4px 15px}.message__action{display:inline-flex;margin-top:10px;border:1px solid var(--gold);border-radius:99px;min-height:34px;padding:7px 12px;color:var(--gold);font-size:11px;font-weight:700}.review-note{font-size:10px;color:var(--gold);margin:8px 0 0}
.status{padding:0 24px;min-height:0;color:var(--muted);font-size:11px;line-height:1.55}.status:not(:empty){padding-top:8px;padding-bottom:6px}.status[data-tone="error"]{color:#f2afb9}.status a{color:var(--ink);text-decoration:underline}
.composer{flex:none;display:flex;flex-direction:column;gap:8px;padding:12px 24px calc(16px + env(safe-area-inset-bottom));background:#131418;border-top:1px solid var(--border)}
.composer-row{display:grid;grid-template-columns:1fr 44px;align-items:end;gap:9px}.composer textarea{display:block;width:100%;min-height:44px;max-height:122px;resize:none;border:1px solid #3b393a;border-radius:14px;background:#202126;color:var(--ink);font-size:16px;line-height:1.5;padding:11px 13px;outline:none}.composer textarea:focus{border-color:var(--gold)}.composer textarea::placeholder{color:#aba5a0}.send{height:44px;width:44px;border:0;border-radius:14px;background:var(--wine);color:#fff;font-size:23px;font-weight:500}.send:hover{background:#b42c4a}.composer-caption{display:flex;justify-content:space-between;gap:10px;color:var(--dim);font-size:10px;line-height:1.4}.composer-caption a{color:var(--muted);text-decoration:underline;text-underline-offset:3px}
@media(max-width:920px){.page{grid-template-rows:60px minmax(0,1fr)}.top{padding:0 16px}.top-link--outline{display:none}.workspace{grid-template-columns:1fr;grid-template-rows:minmax(156px,29%) minmax(0,1fr);gap:0;padding:0}.hero{border:0;border-radius:0;min-height:0}.hero:before{background:linear-gradient(90deg,#0c0d10 4%,rgba(11,11,13,.87) 40%,rgba(11,11,13,.08) 100%),linear-gradient(0deg,#151517 0%,transparent 50%)}.hero-image{width:73%;object-position:center 32%}.hero-copy{padding:17px 19px;max-width:78%}.hero-title{font-size:clamp(49px,8vw,82px);margin:9px 0 3px}.hero-italic{font-size:14px}.hero-copy h1{font-size:17px;margin:auto 0 3px}.hero-body{font-size:11px;line-height:1.48;margin:0}.hero-links,.hero-divider,.hero-footnote{display:none}.chat-shell{border:0;border-top:1px solid var(--border);border-radius:21px 21px 0 0;margin-top:-13px;z-index:3}.chat-head{padding:12px 16px 9px}.chat-name strong{font-size:14px}.small-avatar{width:34px;height:34px;font-size:22px}.member-line{padding:8px 16px;font-size:10px}.mode-row{margin:10px 16px 0}.intro-panel{padding:10px 16px 5px}.intro-panel h2{font-size:12px;margin-bottom:7px}.history{padding:13px 16px 16px;gap:11px}.message__bubble{font-size:12px;padding:10px 12px}.composer{padding:10px 16px calc(8px + env(safe-area-inset-bottom))}.composer-caption{font-size:9px}.brand-mark{font-size:23px}.brand-label strong{font-size:10px}.brand-label small{font-size:8px}}
@media(max-width:450px){.workspace{grid-template-rows:minmax(142px,26%) minmax(0,1fr)}.hero-image{width:78%;object-position:58% 27%}.hero-copy{max-width:75%}.hero-title{font-size:51px}.hero-copy h1{font-size:15px}.hero-body{font-size:10px}.top-actions{gap:8px}.top-link{font-size:10px}.brand{gap:9px}.brand-label small{letter-spacing:.08em}.history{gap:9px}.member-line a{font-size:9px}.clear{font-size:10px;min-height:32px;padding:6px 10px}}
@media(max-height:660px) and (max-width:920px){.workspace{grid-template-rows:135px minmax(0,1fr)}.hero-title{font-size:40px;margin:5px 0}.hero-copy h1{font-size:14px}.hero-body{display:none}.chat-head{padding-top:8px;padding-bottom:6px}.intro-panel{padding-top:7px;padding-bottom:3px}.mode-row{margin-top:6px}.prompt-row{padding-bottom:0}.composer-caption{display:none}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
</style></head><body>
  <a href="#kenji-input" class="skip">ข้ามไปช่องพิมพ์คำถาม</a>
  <div class="page">
    <header class="top">
      <a class="brand" href="/member/my-mmd" aria-label="กลับ MY MMD"><span class="brand-mark">MMD</span><span class="brand-rule" aria-hidden="true"></span><span class="brand-label"><strong>KENJI</strong><small>MEMBER CONCIERGE</small></span></a>
      <nav class="top-actions" aria-label="ไปส่วนอื่น"><a class="top-link" href="/member/my-mmd">MY MMD <span aria-hidden="true">↗</span></a><a class="top-link top-link--outline" href="/member/liff?intent=status">ตรวจสอบสิทธิ์</a></nav>
    </header>
    <main class="workspace">
      <section class="hero" aria-labelledby="hero-heading">
        <img class="hero-image" src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa4b6b02b82617e25beaa4c_Kenji%20CC%2002.webp" alt="Kenji ผู้ช่วย MMD Privé" fetchpriority="high" decoding="async" width="1086" height="1448">
        <div class="hero-grain" aria-hidden="true"></div>
        <div class="hero-copy">
          <div class="eyebrow">MMD PRIVÉ BANGKOK / MEMBER SERVICES</div>
          <div class="hero-title" aria-hidden="true">Kenji.</div><div class="hero-italic">Your MMD Concierge</div>
          <h1 id="hero-heading">มีอะไรให้ผมจัดการครับ</h1>
          <p class="hero-body">คำถามทั่วไป สมาชิก MY MMD และการเข้าถึงโปรโมชั่นที่ประกาศแล้ว ทุกคำตอบยึดข้อมูลที่ตรวจสอบได้ครับ</p>
          <div class="hero-links"><a href="/member/my-mmd">เข้า MY MMD</a><a href="/my-mmd/coupons">คูปองของฉัน</a></div>
          <div class="hero-divider"></div><div class="hero-footnote">PRIVATE BY DESIGN · ข้อมูลสมาชิกและสิทธิ์ต่าง ๆ ยืนยันจากระบบเท่านั้น</div>
        </div>
      </section>
      <section class="chat-shell" aria-label="สนทนากับ Kenji">
        <header class="chat-head"><div class="chat-heading"><div class="small-avatar" aria-hidden="true">K</div><div class="chat-name"><strong>Kenji</strong><small>Q&A · PROMOTIONS</small></div></div><button class="clear" id="kenji-clear" type="button" aria-label="ลบข้อความในหน้าจอนี้">ล้างหน้าจอ</button></header>
        <div class="member-line"><span id="kenji-member">ยังไม่แสดงข้อมูลสมาชิก</span><a id="kenji-member-link" href="/member/liff?intent=status">ตรวจสอบสิทธิ์</a></div>
        <div class="mode-row" aria-label="เลือกหัวข้อ"><button class="mode" type="button" data-mode="qa" aria-pressed="true">คำถามทั่วไป (Q&A)</button><button class="mode" type="button" data-mode="promo" aria-pressed="false">โปรโมชั่น</button></div>
        <div class="intro-panel" data-mode-panel="qa"><h2>เลือกคำถาม หรือพิมพ์ด้วยตัวเอง</h2><div class="prompt-row"><button type="button" class="prompt" data-prompt="สมัครสมาชิก MMD ต้องทำอย่างไร">สมัครสมาชิก</button><button type="button" class="prompt" data-prompt="เช็กสถานะสมาชิกที่ระบบยืนยันให้หน่อย">เช็กสมาชิก</button><button type="button" class="prompt" data-prompt="เช็ก Points ที่ระบบยืนยันให้หน่อย">Points</button><button type="button" class="prompt" data-prompt="ต่ออายุสมาชิกต้องทำอย่างไร">ต่ออายุ</button><button type="button" class="prompt" data-prompt="ช่องทางชำระเงินและการตรวจยอดเป็นอย่างไร">ชำระเงิน</button></div></div>
        <div class="intro-panel" data-mode-panel="promo" hidden><div class="promo-info"><strong>ดูโปรโมชั่นจากประกาศของ MMD</strong><p>รายการและสิทธิ์ส่วนบุคคลอาจเปลี่ยนแปลงได้ ตรวจสอบคูปองจาก MY MMD ก่อนใช้สิทธิ์ทุกครั้ง</p><a href="/my-mmd/coupons">เปิดคูปองใน MY MMD ↗</a><button type="button" class="prompt" data-prompt="สอบถามเงื่อนไขโปรโมชั่นที่ประกาศแล้ว">ถามเงื่อนไขโปรโมชั่น</button></div></div>
        <div class="history" id="kenji-history" role="log" aria-label="ข้อความสนทนา" aria-live="polite" aria-relevant="additions text"></div>
        <p class="status" id="kenji-status" role="status" aria-live="polite"></p>
        <form class="composer" id="kenji-form"><div class="composer-row"><textarea id="kenji-input" name="message" rows="1" maxlength="800" placeholder="พิมพ์คำถามของคุณ…" aria-label="พิมพ์คำถามถึง Kenji"></textarea><button type="submit" class="send" id="kenji-send" aria-label="ส่งข้อความ">➤</button></div><div class="composer-caption"><span>กดส่งเพื่อถาม · Ctrl/⌘ + Enter เพื่อส่ง</span><a href="/sigil/recovery">ต้องการความช่วยเหลือ?</a></div></form>
      </section>
    </main>
  </div><script nonce="test_nonce">
(function () {
  "use strict";
  const $ = function (id) { return document.getElementById(id); };
  const form = $("kenji-form");
  const input = $("kenji-input");
  const send = $("kenji-send");
  const history = $("kenji-history");
  const status = $("kenji-status");
  const member = $("kenji-member");
  const memberLink = $("kenji-member-link");
  const clear = $("kenji-clear");
  const modes = Array.from(document.querySelectorAll("[data-mode]"));
  const panels = Array.from(document.querySelectorAll("[data-mode-panel]"));
  let busy = false;
  let generation = 0;
  let activeRequest = null;
  const initialGreeting = "เลือกหัวข้อที่สนใจ หรือพิมพ์คำถามได้เลยครับ ผมจะอ้างอิงข้อมูลที่ระบบยืนยันได้เท่านั้น";

  function setStatus(value, tone) {
    status.textContent = value || "";
    status.dataset.tone = tone || "info";
  }
  function updateHeight() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 122) + "px";
  }
  function setBusy(value) {
    busy = Boolean(value);
    send.disabled = busy;
    input.setAttribute("aria-busy", String(busy));
    history.setAttribute("aria-busy", String(busy));
  }
  function safeAction(action) {
    if (!action || typeof action !== "object") return null;
    const label = typeof action.label === "string" ? action.label.trim().slice(0, 80) : "";
    const path = typeof action.url === "string" ? action.url.trim() : "";
    if (!label || !path || !/^\/(?!\/|\\)[a-z0-9/_?&=%#.+~-]*$/i.test(path)) return null;
    try {
      const target = new URL(path, window.location.origin);
      if (target.origin !== window.location.origin) return null;
    } catch (_) { return null; }
    return { label: label, path: path };
  }
  function appendMessage(text, kind, action, reviewRequired) {
    const wrap = document.createElement("article");
    wrap.className = "message message--" + kind;
    if (kind === "bot") {
      const mark = document.createElement("div");
      mark.className = "message__avatar";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "K";
      wrap.appendChild(mark);
    }
    const bubble = document.createElement("div");
    bubble.className = "message__bubble";
    const copy = document.createElement("div");
    copy.textContent = String(text || "");
    bubble.appendChild(copy);
    const safe = safeAction(action);
    if (safe) {
      const link = document.createElement("a");
      link.className = "message__action";
      link.href = safe.path;
      link.textContent = safe.label + " ↗";
      bubble.appendChild(link);
    }
    if (reviewRequired) {
      const note = document.createElement("p");
      note.className = "review-note";
      note.textContent = "ข้อมูลบางส่วนต้องให้ MMD ตรวจสอบก่อนครับ";
      bubble.appendChild(note);
    }
    wrap.appendChild(bubble);
    history.appendChild(wrap);
    history.scrollTop = history.scrollHeight;
  }
  function resetDisplay(preserveDraft) {
    const draft = preserveDraft ? input.value : "";
    generation += 1;
    if (activeRequest) activeRequest.abort();
    activeRequest = null;
    setBusy(false);
    history.replaceChildren();
    appendMessage(initialGreeting, "bot");
    input.value = draft;
    updateHeight();
    member.textContent = "ยังไม่แสดงข้อมูลสมาชิก";
    memberLink.textContent = "ตรวจสอบสิทธิ์";
    memberLink.href = "/member/liff?intent=status";
    setStatus("");
  }
  function applyMember(data) {
    if (!data || typeof data !== "object") return;
    const name = typeof data.display_name === "string" ? data.display_name.trim() : "";
    const tier = typeof data.membership_label === "string" ? data.membership_label.trim() : "";
    if (!name && !tier) return;
    member.textContent = "ยืนยันจากระบบ: " + [name, tier].filter(Boolean).join(" · ");
    memberLink.textContent = "MY MMD";
    memberLink.href = "/member/my-mmd";
  }
  function markSessionLost() {
    resetDisplay(true);
    setStatus("กรุณายืนยัน Member Session ผ่าน LINE ก่อนส่งคำถามครับ", "error");
    memberLink.textContent = "ยืนยันผ่าน LINE";
    memberLink.href = "/member/liff?intent=status";
  }
  async function ask() {
    if (busy) return;
    const message = input.value.trim();
    if (!message) { input.focus(); return; }
    if (message.length > 800) { setStatus("ข้อความยาวเกิน 800 ตัวอักษรครับ", "error"); return; }
    const ownGeneration = generation;
    const controller = new AbortController();
    activeRequest = controller;
    setBusy(true);
    setStatus("กำลังตรวจสอบข้อมูลที่ยืนยันจากระบบ…");
    try {
      const response = await fetch("/api/member/kenji/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify({ message: message }),
        signal: controller.signal,
      });
      const result = await response.json().catch(function () { return null; });
      if (ownGeneration !== generation) return;
      if (response.status === 401) { markSessionLost(); return; }
      if (response.status === 423) { setStatus("ขณะนี้ MMD กำลังดูแลเรื่องนี้ โปรดลองอีกครั้งภายหลังครับ", "error"); return; }
      if (!response.ok || !result || result.ok !== true) {
        setStatus("ยังส่งคำถามไม่สำเร็จ ระบบยังไม่ยืนยันผล กรุณาตรวจสอบก่อนลองใหม่ครับ", "error");
        return;
      }
      appendMessage(message, "user");
      appendMessage(result.reply || "ตอนนี้ยังไม่มีข้อมูลที่ยืนยันได้ครับ", "bot", result.action, result.review_required === true);
      applyMember(result.member);
      input.value = "";
      updateHeight();
      setStatus("");
      history.scrollTop = history.scrollHeight;
    } catch (_) {
      if (ownGeneration === generation) setStatus("การเชื่อมต่อไม่สมบูรณ์ ยังยืนยันการส่งไม่ได้ กรุณาตรวจสอบก่อนลองใหม่ครับ", "error");
    } finally {
      if (ownGeneration === generation) {
        activeRequest = null;
        setBusy(false);
        input.focus();
      }
    }
  }
  form.addEventListener("submit", function (event) { event.preventDefault(); void ask(); });
  input.addEventListener("input", function () { updateHeight(); if (status.dataset.tone === "error") setStatus(""); });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void ask(); }
  });
  document.querySelectorAll("[data-prompt]").forEach(function (button) {
    button.addEventListener("click", function () {
      input.value = button.getAttribute("data-prompt") || "";
      updateHeight();
      input.focus();
    });
  });
  modes.forEach(function (button) {
    button.addEventListener("click", function () {
      const next = button.getAttribute("data-mode");
      modes.forEach(function (item) { item.setAttribute("aria-pressed", String(item === button)); });
      panels.forEach(function (item) { item.hidden = item.getAttribute("data-mode-panel") !== next; });
    });
  });
  clear.addEventListener("click", function () { resetDisplay(false); input.focus(); });
  // No transcript, drafts, member data or tokens are persisted in local or session storage.
  window.addEventListener("pagehide", function () { resetDisplay(false); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") resetDisplay(false);
  });
  resetDisplay(false);
})();
</script></body></html>`;

export function renderKenjiNextLvPage(nonce) {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(nonce)) throw new TypeError("Invalid CSP nonce");
  const html = NEXT_LV_DOCUMENT.replaceAll("test_nonce", nonce);
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, private, max-age=0",
      "content-security-policy": `default-src 'self'; style-src 'self' 'nonce-${nonce}'; script-src 'self' 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data: https://cdn.prod.website-files.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`,
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      "x-mmd-kenji": "member-app-next-lv",
    },
  });
}
