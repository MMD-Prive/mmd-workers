/* Kenji Knowledge simple loader — Per voice, mobile first, read-only worker bridge. */
(function () {
  "use strict";

  var ROOT_ID = "mmdKenjiKnowledgeV9";
  var ADMIN_AUTH_ENDPOINT = "/v1/admin/auth/me";
  var KNOWLEDGE_META_ENDPOINT = "/v1/admin/kenji/knowledge/meta";
  var KNOWLEDGE_LIST_ENDPOINT = "/v1/admin/kenji/knowledge/list";
  var KNOWLEDGE_PUBLISHED_ENDPOINT = "/v1/internal/kenji/knowledge/published";
  var SAFE_COPY = "หน้านี้อ่านข้อมูลอย่างเดียว Kenji ช่วยจำ ช่วยสรุป และช่วยหยิบกลับมาใช้ต่อ แต่ไม่อนุมัติสลิป ไม่เปิดสมาชิก ไม่ยืนยัน booking และไม่ปลดล็อกสิทธิ์แทน MMD";

  var img = {
    heroDesktop: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a5ba32f52334f4687bc374c_Kenji%20Knowledge%20Desk.webp",
    heroMobile: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a5ba330cd7a8d988bf4b4f3_Kenji%20Knowledge%20Mob.webp",
    footer: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a5ba3303273d555c71ad755_Kenji%20Knowledge%2002.webp"
  };

  var root = document.getElementById(ROOT_ID);
  if (!root) return;
  if (root.dataset.simpleLoader === "v2") return;
  root.dataset.simpleLoader = "v2";

  injectStyle();
  root.className = "mkk2";
  root.innerHTML = render();
  setupReveal();
  setupAnchors();
  connectWorkerReadOnly();

  function render() {
    return ''
      + '<div class="mkk2-bg" aria-hidden="true"></div>'
      + '<div class="mkk2-shell">'
      + '  <header class="mkk2-nav">'
      + '    <a class="mkk2-brand" href="/internal/admin/control-room" aria-label="Kenji Knowledge">'
      + '      <span class="mkk2-mark">K</span><span><b>KENJI KNOWLEDGE</b><small>SIGIL MEMORY ROOM</small></span>'
      + '    </a>'
      + '    <a class="mkk2-contact" href="/internal/admin/control-room">Control Room</a>'
      + '  </header>'
      + '  <main class="mkk2-main">'
      + '    <section class="mkk2-hero">'
      + '      <div class="mkk2-copy" data-mkk2-reveal>'
      + '        <span class="mkk2-kicker">SIGIL · KENJI KNOWLEDGE</span>'
      + '        <h1>Kenji จำไว้ให้แล้วครับ<em>เปิดมาใช้ต่อได้เลย</em></h1>'
      + '        <p>หน้านี้เก็บเรื่องที่ MMD ตัดสินไว้แล้วครับ เช่น route, flow, สี, copy, worker note และรูปที่ใช้ เวลาแก้หน้าหรือทำหน้าต่อไป จะได้ไม่ต้องเดาใหม่ทุกครั้ง</p>'
      + '        <div class="mkk2-status"><i></i><div><span>สถานะตอนนี้</span><strong id="mkk2WorkerStatus">กำลังเชื่อม worker แบบอ่านอย่างเดียว</strong></div></div>'
      + '        <div class="mkk2-actions"><a class="mkk2-btn mkk2-primary" href="#mkk2Map">ดูหมวดความจำ</a><a class="mkk2-btn mkk2-secondary" href="#mkk2Latest">ดูสิ่งที่ต้องจำล่าสุด</a></div>'
      + '      </div>'
      + '      <aside class="mkk2-visual" data-mkk2-reveal>'
      + '        <picture><source media="(max-width: 767px)" srcset="' + img.heroMobile + '"><img src="' + img.heroDesktop + '" alt=""></picture>'
      + '        <div class="mkk2-label"><span>Knowledge Guide</span><strong>Kenji</strong></div>'
      + '      </aside>'
      + '    </section>'
      + '    <section class="mkk2-strip">'
      + '      <article data-mkk2-reveal><span>01</span><strong>จำไว้</strong><p>เก็บสิ่งที่ตกลงแล้ว ไม่ต้องถามซ้ำ</p></article>'
      + '      <article data-mkk2-reveal><span>02</span><strong>หยิบใช้</strong><p>เอา flow, route, copy ไปต่อหน้าใหม่ได้เลย</p></article>'
      + '      <article data-mkk2-reveal><span>03</span><strong>ไม่หลุดโทน</strong><p>คุมภาษา สี และ mood ให้เป็น MMD / SIGIL ตามที่ล็อกไว้</p></article>'
      + '    </section>'
      + '    <section class="mkk2-layout">'
      + '      <div class="mkk2-left">'
      + '        <section class="mkk2-panel" id="mkk2Map" data-mkk2-reveal>'
      + '          <div class="mkk2-head"><span>Knowledge Map</span><h2>เรื่องที่ Kenji แยกไว้ให้</h2><p>ดูตามหมวดได้เลยครับ เวลาอยากต่อยอดหน้าไหน จะได้รู้ว่าต้องหยิบ memory ชุดไหนก่อน</p></div>'
      + '          <div class="mkk2-map">'
      + '            <article><b>Payment</b><strong>สลิป / หลักฐาน / ตรวจยอด</strong><p>จำไว้ว่า evidence only ไม่ใช่ชำระสำเร็จ จนกว่า MMD ตรวจจริง</p></article>'
      + '            <article><b>Member</b><strong>สถานะสมาชิก / Points / Dashboard</strong><p>ใช้กับ LIFF, dashboard, renewal และการเช็กสถานะ</p></article>'
      + '            <article><b>Public</b><strong>Public Access / Casting Floor</strong><p>ใช้ public theme: ขาว, charcoal, smoked glass, wine accent</p></article>'
      + '            <article><b>SIGIL</b><strong>Private layer / admin logic</strong><p>ใช้กับห้องลึกกว่า public เช่น admin, review, knowledge room</p></article>'
      + '            <article><b>TMIB</b><strong>ตัวละครและบทบาท</strong><p>Kenji, Yuki, TarT, Hito, Hiro, Hima, Hiei และ role lock ของแต่ละคน</p></article>'
      + '            <article><b>Webflow</b><strong>Full code mb / mobile first</strong><p>เก็บ pattern หน้าใหม่ให้ทำเร็วขึ้นและไม่ต้องเริ่มใหม่</p></article>'
      + '          </div>'
      + '        </section>'
      + '        <section class="mkk2-panel" id="mkk2Latest" data-mkk2-reveal>'
      + '          <div class="mkk2-head"><span>Latest Memory</span><h2>สิ่งที่ต้องจำตอนนี้</h2><p>ถ้าทำต่อจากหน้านี้ ให้ยึด 3 ข้อนี้ก่อนครับ</p></div>'
      + '          <div class="mkk2-memory">'
      + '            <article class="is-active"><b>01</b><div><strong>Footer ใช้ SIGIL mood</strong><p>ท้ายหน้าเข้มขึ้น ลึกขึ้น เหมือนห้องเก็บข้อมูลของ Kenji</p></div></article>'
      + '            <article><b>02</b><div><strong>สีหน้าใช้ charcoal / wine / warm ivory</strong><p>ไม่ขาว public จนเกินไป และไม่ทองจัดจนเป็น luxury cliché</p></div></article>'
      + '            <article><b>03</b><div><strong>ภาษา Kenji ต้องเข้าใจง่าย</strong><p>พูดสั้น ชัด เหมือนคนช่วยจัดระบบ ไม่ใช่คู่มือราชการ</p></div></article>'
      + '          </div>'
      + '        </section>'
      + '        <section class="mkk2-panel" data-mkk2-reveal>'
      + '          <div class="mkk2-head"><span>Worker Read</span><h2>เชื่อมกับ worker แล้วอ่านอะไรได้บ้าง</h2><p>' + esc(SAFE_COPY) + '</p></div>'
      + '          <div class="mkk2-worker" id="mkk2WorkerCards"><article><b>Auth</b><strong>กำลังอ่านสิทธิ์</strong><p>รอคำตอบจาก /v1/admin/auth/me</p></article><article><b>Meta</b><strong>กำลังอ่าน meta</strong><p>รอคำตอบจาก /v1/admin/kenji/knowledge/meta</p></article><article><b>List</b><strong>กำลังอ่าน list</strong><p>รอคำตอบจาก /v1/admin/kenji/knowledge/list</p></article></div>'
      + '        </section>'
      + '      </div>'
      + '      <aside class="mkk2-right">'
      + '        <section class="mkk2-side" data-mkk2-reveal><span>Kenji Note</span><strong>ผมจำให้แล้วครับ</strong><p>ถ้าเปอร์เรียก mmd memory หรือ Kenji Knowledge ต่อจากนี้ ผมจะยึดหน้านี้เป็น reference สำหรับ private memory room</p></section>'
      + '        <section class="mkk2-side mkk2-jump" data-mkk2-reveal><span>Quick Jump</span><a href="#mkk2Map">หมวดความจำ</a><a href="#mkk2Latest">สิ่งที่ต้องจำล่าสุด</a><a href="#mkk2Footer">Footer mood</a></section>'
      + '      </aside>'
      + '    </section>'
      + '    <section class="mkk2-footer" id="mkk2Footer" data-mkk2-reveal><div class="mkk2-footer-img"><img src="' + img.footer + '" alt=""></div><div class="mkk2-footer-copy"><span>SIGIL FOOTER MEMORY</span><h2>ท้ายหน้านี้คือโต๊ะเก็บความจำของ Kenji</h2><p>ข้อมูลสำคัญถูกวางไว้ให้เรียบร้อยครับ ไม่ต้องตะโกน ไม่ต้องขายของ แค่เปิดมาแล้วรู้ทันทีว่าเรื่องนี้ MMD เคยตัดสินไว้ยังไง</p></div></section>'
      + '  </main>'
      + '</div>'
      + '<div class="mkk2-dock"><a href="#mkk2Map">Knowledge</a><a href="#mkk2Latest">Memory</a></div>';
  }

  function connectWorkerReadOnly() {
    Promise.allSettled([
      fetchJson(ADMIN_AUTH_ENDPOINT),
      fetchJson(KNOWLEDGE_META_ENDPOINT),
      fetchJson(KNOWLEDGE_LIST_ENDPOINT),
      fetchJson(KNOWLEDGE_PUBLISHED_ENDPOINT)
    ]).then(function (results) {
      var auth = results[0].status === "fulfilled" ? results[0].value : null;
      var meta = results[1].status === "fulfilled" ? results[1].value : null;
      var list = results[2].status === "fulfilled" ? results[2].value : null;
      var published = results[3].status === "fulfilled" ? results[3].value : null;
      setText("mkk2WorkerStatus", auth && auth.ok ? "เชื่อม worker แล้ว · อ่านได้ตามสิทธิ์" : "เปิดหน้าได้แล้ว · รอสิทธิ์อ่านข้อมูล");
      renderWorkerCards(auth, meta, list, published);
    });
  }

  function fetchJson(endpoint) {
    return fetch(endpoint, { credentials: "same-origin", cache: "no-store" })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          data.__status = response.status;
          data.__ok = response.ok;
          return data;
        });
      });
  }

  function renderWorkerCards(auth, meta, list, published) {
    var node = document.getElementById("mkk2WorkerCards");
    if (!node) return;
    var count = getCount(list) || getCount(published);
    node.innerHTML = ''
      + card("Auth", auth && auth.ok ? "อ่านได้แล้ว" : "ยังต้อง login", auth && auth.ok ? "admin-worker ตอบกลับแล้วครับ" : "ถ้ายังไม่เห็นข้อมูล ให้ login ผ่าน /internal/admin/login ก่อน")
      + card("Meta", meta && meta.ok ? "meta พร้อม" : "ยังไม่พบ meta", meta && meta.ok ? "Kenji Knowledge API พร้อมอ่านค่า meta" : "หน้าไม่พัง แต่อาจยังไม่ได้เปิดข้อมูล meta")
      + card("Memory", count ? count + " รายการ" : "ยังไม่มีรายการ", count ? "อ่านรายการ memory จาก worker ได้แล้ว" : "ยังแสดงคู่มือหลักเป็น fallback ก่อน");
  }

  function getCount(data) {
    if (!data) return 0;
    if (Array.isArray(data.items)) return data.items.length;
    if (Array.isArray(data.records)) return data.records.length;
    if (Array.isArray(data.knowledge)) return data.knowledge.length;
    if (typeof data.count === "number") return data.count;
    return 0;
  }

  function card(kicker, title, text) {
    return '<article><b>' + esc(kicker) + '</b><strong>' + esc(title) + '</strong><p>' + esc(text) + '</p></article>';
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function setupReveal() {
    var items = Array.prototype.slice.call(root.querySelectorAll("[data-mkk2-reveal]"));
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (item) { item.classList.add("is-visible"); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -42px 0px" });
    items.forEach(function (item, index) {
      item.style.transitionDelay = Math.min(index * 45, 220) + "ms";
      observer.observe(item);
    });
  }

  function setupAnchors() {
    root.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function (event) {
        var target = root.querySelector(link.getAttribute("href"));
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>\"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
    });
  }

  function injectStyle() {
    if (document.getElementById("mkk2-style")) return;
    var css = ''
      + '.mkk2,.mkk2 *{box-sizing:border-box}.mkk2{--bg:#0b0b0e;--panel:rgba(22,21,25,.78);--panel2:rgba(31,29,34,.9);--ink:#f7f1e8;--soft:rgba(247,241,232,.72);--muted:rgba(247,241,232,.48);--line:rgba(247,241,232,.13);--wine:#9d2432;--wine2:#70131d;--gold:#c6a05f;--green:#6f9671;position:relative;min-height:100vh;overflow:hidden;padding:14px 14px 96px;color:var(--ink);background:radial-gradient(circle at 86% 0%,rgba(157,36,50,.24),transparent 32%),radial-gradient(circle at 6% 18%,rgba(198,160,95,.12),transparent 28%),linear-gradient(180deg,#121216 0%,#0b0b0e 58%,#050506 100%);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",Inter,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}.mkk2 a{text-decoration:none;color:inherit}.mkk2-bg{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(247,241,232,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(247,241,232,.045) 1px,transparent 1px);background-size:54px 54px;mask-image:linear-gradient(to bottom,transparent,#000 12%,#000 84%,transparent)}.mkk2-shell{position:relative;z-index:1;width:min(1280px,100%);margin:0 auto}.mkk2-nav{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 0 16px}.mkk2-brand{display:inline-flex;align-items:center;gap:10px;min-width:0}.mkk2-mark{width:42px;height:42px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:15px;background:linear-gradient(145deg,rgba(247,241,232,.12),rgba(247,241,232,.035));color:var(--gold);font-size:20px;font-weight:800}.mkk2-brand span{display:grid;gap:4px}.mkk2-brand b{font-size:16px;line-height:1;font-weight:820;letter-spacing:.05em}.mkk2-brand small,.mkk2-kicker,.mkk2-head span,.mkk2-side span,.mkk2-footer-copy span,.mkk2-label span{color:var(--gold);font-size:10px;font-weight:760;letter-spacing:.12em;text-transform:uppercase}.mkk2-contact,.mkk2-btn,.mkk2-jump a{min-height:42px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font-size:13px;font-weight:760;transition:transform .18s ease}.mkk2-contact{padding:0 14px;border:1px solid var(--line);background:rgba(247,241,232,.07);backdrop-filter:blur(18px)}.mkk2-contact:hover,.mkk2-btn:hover,.mkk2-jump a:hover{transform:translateY(-1px)}.mkk2-main{display:grid;gap:14px}.mkk2-hero{display:grid;grid-template-columns:1fr;gap:14px}.mkk2-copy,.mkk2-visual,.mkk2-strip article,.mkk2-panel,.mkk2-side,.mkk2-footer{border:1px solid var(--line);background:var(--panel);box-shadow:0 28px 90px rgba(0,0,0,.34);backdrop-filter:blur(22px)}.mkk2-copy{min-height:430px;display:flex;flex-direction:column;justify-content:center;padding:22px;border-radius:32px}.mkk2 h1{margin:12px 0 0;max-width:780px;color:var(--ink);font-size:clamp(42px,13vw,82px);line-height:.9;letter-spacing:-.074em;font-weight:780}.mkk2 h1 em{display:block;color:var(--wine);font-style:normal}.mkk2 p{margin:12px 0 0;color:var(--soft);font-size:15px;line-height:1.62}.mkk2-status{display:grid;grid-template-columns:12px 1fr;gap:11px;align-items:center;width:min(100%,560px);margin-top:18px;padding:14px;border:1px solid rgba(111,150,113,.2);border-radius:20px;background:rgba(111,150,113,.08)}.mkk2-dot,.mkk2-status i{width:10px;height:10px;border-radius:999px;background:var(--green);box-shadow:0 0 0 6px rgba(111,150,113,.14)}.mkk2-status span{display:block;color:var(--muted);font-size:11px;font-weight:720}.mkk2-status strong{display:block;margin-top:3px;color:var(--ink);font-size:14px}.mkk2-actions{display:grid;grid-template-columns:1fr;gap:9px;margin-top:22px}.mkk2-primary{color:#fff;background:linear-gradient(135deg,#b32335,#70131d);box-shadow:0 18px 46px rgba(157,36,50,.2)}.mkk2-secondary{border:1px solid var(--line);background:rgba(247,241,232,.08)}.mkk2-visual{position:relative;min-height:520px;overflow:hidden;border-radius:32px;background:#050506}.mkk2-visual picture,.mkk2-visual img{display:block;width:100%;height:100%}.mkk2-visual img{position:absolute;inset:0;object-fit:cover;object-position:center center;filter:contrast(1.08) saturate(1.04) brightness(.98);transform:scale(1.01)}.mkk2-visual:after,.mkk2-footer-img:after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(5,5,6,.82),rgba(5,5,6,.08) 58%),radial-gradient(circle at 84% 10%,rgba(157,36,50,.22),transparent 34%)}.mkk2-label{position:absolute;left:16px;right:16px;bottom:16px;z-index:2;display:grid;gap:6px}.mkk2-label span{width:fit-content;min-height:30px;display:inline-flex;align-items:center;padding:0 11px;border:1px solid rgba(198,160,95,.24);border-radius:999px;background:rgba(5,5,6,.58);backdrop-filter:blur(14px)}.mkk2-label strong{font-size:34px;line-height:1;font-weight:820;letter-spacing:-.05em}.mkk2-strip{display:grid;grid-template-columns:1fr;gap:10px}.mkk2-strip article{min-height:118px;display:grid;gap:7px;padding:16px;border-radius:24px}.mkk2-strip span,.mkk2-map b,.mkk2-worker b{color:var(--gold);font-size:11px;font-weight:780;letter-spacing:.1em;text-transform:uppercase}.mkk2-strip strong{font-size:25px;line-height:1.04;letter-spacing:-.04em}.mkk2-layout{display:grid;grid-template-columns:1fr;gap:14px}.mkk2-left,.mkk2-right{display:grid;gap:14px}.mkk2-panel,.mkk2-side{display:grid;gap:14px;padding:18px;border-radius:30px}.mkk2-head h2,.mkk2-footer-copy h2,.mkk2-side strong{margin:7px 0 0;color:var(--ink);font-size:31px;line-height:1.04;letter-spacing:-.052em;font-weight:780}.mkk2-map,.mkk2-worker{display:grid;grid-template-columns:1fr;gap:10px}.mkk2-map article,.mkk2-worker article,.mkk2-memory article{padding:14px;border:1px solid var(--line);border-radius:22px;background:rgba(247,241,232,.055)}.mkk2-map b,.mkk2-worker b{width:fit-content;min-height:28px;display:inline-flex;align-items:center;padding:0 10px;border-radius:999px;background:rgba(198,160,95,.1);font-size:10px}.mkk2-map strong,.mkk2-worker strong{display:block;margin-top:12px;font-size:18px;line-height:1.14;letter-spacing:-.03em}.mkk2-map p,.mkk2-worker p,.mkk2-memory p{margin-top:7px;font-size:13px}.mkk2-memory{display:grid;gap:9px}.mkk2-memory article{display:grid;grid-template-columns:38px 1fr;gap:11px}.mkk2-memory b{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;color:var(--gold);background:rgba(198,160,95,.1);font-size:12px;font-weight:820}.mkk2-memory article.is-active{border-color:rgba(157,36,50,.32);background:linear-gradient(180deg,rgba(157,36,50,.14),rgba(247,241,232,.055))}.mkk2-memory article.is-active b{color:#fff;background:linear-gradient(135deg,#b32335,#70131d)}.mkk2-memory strong{display:block;font-size:14px}.mkk2-jump{align-content:start}.mkk2-jump a{justify-content:flex-start;padding:0 14px;border:1px solid var(--line);background:rgba(247,241,232,.055)}.mkk2-footer{overflow:hidden;border-radius:32px;display:grid;grid-template-columns:1fr;background:var(--panel2)}.mkk2-footer-img{position:relative;min-height:300px;overflow:hidden;background:#050506}.mkk2-footer-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center center;filter:contrast(1.08) saturate(1.04) brightness(.94)}.mkk2-footer-copy{padding:18px}.mkk2-dock{position:fixed;left:12px;right:12px;bottom:12px;z-index:20;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px;border:1px solid var(--line);border-radius:24px;background:rgba(11,11,14,.78);box-shadow:0 24px 70px rgba(0,0,0,.42);backdrop-filter:blur(18px)}.mkk2-dock a{min-height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font-size:13px;font-weight:800}.mkk2-dock a:first-child{color:#fff;background:linear-gradient(135deg,#b32335,#70131d)}.mkk2-dock a:last-child{border:1px solid var(--line);background:rgba(247,241,232,.08)}[data-mkk2-reveal]{opacity:0;transform:translateY(14px)}[data-mkk2-reveal].is-visible{opacity:1;transform:translateY(0);transition:opacity .42s ease,transform .42s cubic-bezier(.2,.82,.2,1)}@media(min-width:720px){.mkk2{padding:24px 24px 110px}.mkk2-mark{width:48px;height:48px}.mkk2-brand b{font-size:20px}.mkk2-actions{grid-template-columns:auto auto;justify-content:start}.mkk2-strip{grid-template-columns:repeat(3,1fr)}.mkk2-map,.mkk2-worker{grid-template-columns:repeat(2,1fr)}.mkk2-footer{grid-template-columns:1.05fr .95fr}.mkk2-footer-img{min-height:380px}.mkk2-footer-copy{display:grid;align-content:center;padding:28px}}@media(min-width:1040px){.mkk2{padding:30px 34px 44px}.mkk2-hero{grid-template-columns:minmax(0,.95fr) minmax(430px,1.05fr);align-items:stretch;margin-top:12px}.mkk2-copy,.mkk2-visual{min-height:640px;border-radius:40px}.mkk2-copy{padding:38px}.mkk2 h1{font-size:clamp(76px,6vw,108px)}.mkk2-layout{grid-template-columns:minmax(0,1fr) 390px;align-items:start}.mkk2-right{position:sticky;top:20px}.mkk2-panel,.mkk2-side{padding:22px;border-radius:34px}.mkk2-map{grid-template-columns:repeat(3,1fr)}.mkk2-worker{grid-template-columns:repeat(3,1fr)}.mkk2-head h2,.mkk2-footer-copy h2,.mkk2-side strong{font-size:34px}.mkk2-footer{border-radius:40px}.mkk2-footer-img{min-height:440px}.mkk2-footer-copy{padding:38px}.mkk2-dock{display:none}}@media(max-width:520px){.mkk2-mark{width:38px;height:38px;border-radius:13px}.mkk2-brand{gap:8px}.mkk2-brand b{font-size:13px}.mkk2-brand small{font-size:8px;letter-spacing:.09em}.mkk2-contact{min-height:36px;padding:0 11px;font-size:12px}.mkk2-copy{min-height:410px;padding:18px}.mkk2 h1{font-size:clamp(40px,14.4vw,62px)}.mkk2-visual{min-height:460px}.mkk2-head h2,.mkk2-footer-copy h2,.mkk2-side strong{font-size:28px}}@media(prefers-reduced-motion:reduce){[data-mkk2-reveal],[data-mkk2-reveal].is-visible,.mkk2-contact,.mkk2-btn,.mkk2-jump a{transition:none!important;transform:none!important;opacity:1!important}}';
    var style = document.createElement("style");
    style.id = "mkk2-style";
    style.textContent = css;
    document.head.appendChild(style);
  }
})();
