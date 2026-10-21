/*!
 * MMD PRIVÉ · Customer Job Confirmation — Webflow runtime bridge
 * Based on MMD Confirmation 38916f467ab0d3bae3b10f73a190853efaaabfd0.
 * Release source: mmd-workers/webflow/sigil/confirm/customer-atelier-v2.js.
 * Loaded by Webflow as an inline runtime bridge.
 *
 * Executes in the mmdbkk.com document origin. No iframe, no redirect
 * (except the pre-existing role route guard), no contract changes.
 *
 * data-mmd-source="lovable-github"
 * data-mmd-bridge-version="1"
 */
(() => {
  "use strict";

  const BRIDGE_VERSION = "8";
  const BRIDGE_FLAG = "__mmdJobConfirmationBridgeV1";
  if (window[BRIDGE_FLAG]) return;
  window[BRIDGE_FLAG] = true;

  const CUSTOMER_ROOT = "mmd-job-confirm-v16";
  const MODEL_ROOT = "mmd-model-confirm-v15";
  const CUSTOMER_PATH = "/sigil/confirm/job-confirmation";

  /* ------------------------------------------------------------------ *
   * 0 · Route guard (ported verbatim in behaviour from the page footer)
   * Route hint only. Backend token verification remains authoritative.
   * ------------------------------------------------------------------ */
  // The token remains opaque; backend expected_role validates its audience.
  if (location.pathname.replace(/\/+$/, "") !== CUSTOMER_PATH) return;

  /* ------------------------------------------------------------------ *
   * 1 · Styles (idempotent — one <style> per id)
   * ------------------------------------------------------------------ */
  function injectStyle(id, css) {
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }

  const BASE_CSS = `
.mmd-atelier {
  --bg:#101214; --bg-deep:#0c0e10; --panel:rgba(26,29,31,.94); --panel-soft:rgba(255,248,238,.035);
  --heading:#fff8ee; --text:#eee2d4; --body:#eee2d4; --muted:#bdae9f; --champagne:#e3bd7c;
  --gold-start:#f0d39d; --gold-end:#d7a65d; --button-ink:#211d17; --line:rgba(255,241,218,.15);
  --ok:#b2c9bd; --bad:#edb4a7; --warn:#e3bd7c; --ok-bg:rgba(178,201,189,.07);
  position:relative; isolation:isolate; min-height:100svh; padding-bottom:calc(24px + env(safe-area-inset-bottom));
  background:var(--bg); color:var(--text); font:400 14px/1.6 "LINE Seed Sans TH","Noto Sans Thai",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  font-synthesis:none; -webkit-font-smoothing:antialiased;
}
.mmd-atelier::before{content:"";position:absolute;z-index:-1;inset:0 0 auto;height:460px;pointer-events:none;background:linear-gradient(180deg,rgba(16,18,20,.76),var(--bg)),url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aae16d800a522b95e70e5be_Group%20Payment%20Ver.webp") center 34%/cover no-repeat}
.mmd-atelier *, .mmd-atelier *::before, .mmd-atelier *::after{box-sizing:border-box;letter-spacing:0}
.mmd-atelier [hidden]{display:none!important}
.mmd-atelier [data-final-payment]{display:none!important}
.mmd-atelier h1,.mmd-atelier h2,.mmd-atelier h3,.mmd-atelier p,.mmd-atelier button,.mmd-atelier input,.mmd-atelier summary{font-family:inherit;letter-spacing:0}
.mmd-atelier h1,.mmd-atelier h2,.mmd-atelier h3{color:var(--heading);background:none;-webkit-text-fill-color:var(--heading)}
.mmd-atelier p{font-size:14px;font-weight:400;margin:0;color:var(--muted)}
.mmd-atelier a{color:var(--champagne);text-decoration:none;overflow-wrap:anywhere}
.mmd-atelier button{cursor:pointer;color:var(--text);font-size:14px;font-weight:500}
.mmd-atelier :is(a,button,input,summary):focus-visible{outline:2px solid var(--gold-start);outline-offset:4px}
.mmd-atelier button:disabled{opacity:.45;cursor:not-allowed}
.mmd-atelier .mjc16__wrap{width:min(calc(100% - 32px),1120px);margin:auto;padding-top:12px}
.mmd-atelier .mjc16__header{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px;border-bottom:1px solid var(--line)}
.mmd-atelier .mjc16__brand{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--heading);white-space:nowrap}
.mmd-atelier .mjc16__brand::before{content:"";width:20px;height:20px;flex:none;background:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa5866567282599e244987e_05-tiny-mark-512px.webp") center/contain no-repeat}
.mmd-atelier .mjc16__assistant{font-size:10px;color:var(--muted);margin:3px 0 0 28px}
.mmd-atelier .mmd-confirm-rules-tools{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;max-width:55%}
.mmd-atelier .mjc16__pill{font-size:11px;color:var(--muted);text-align:right}
.mmd-atelier .mmd-confirm-rules-btn{display:inline-flex;align-items:center;min-height:44px;font-size:11px;padding:0 4px}
.mmd-atelier .mjc16__intro{padding:28px 0 24px}
.mmd-atelier .mjc16__eyebrow,.mmd-atelier .mjc16__section-kicker{font-size:10px;font-weight:500;color:var(--champagne)}
.mmd-atelier h1{font-size:30px;line-height:1.3;font-weight:500;margin:8px 0 0}
.mmd-atelier h2{font-size:18px;line-height:1.4;font-weight:500;margin:0}
.mmd-atelier .mjc16__grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
.mmd-atelier .mjc16__card--job{position:relative;min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:22px}
.mmd-atelier .mjc16__card--job::before{content:"";position:absolute;inset:0 0 auto;height:2px;background:var(--champagne)}
.mmd-atelier .mjc16__model-name{font-size:30px;line-height:1.3;margin:14px 0 4px}
.mmd-atelier .mjc16__job-type{color:var(--muted);font-size:13px;margin-bottom:24px}
.mmd-atelier .mjc16__rows>div{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:11px 0;border-bottom:1px solid var(--line);min-width:0}
.mmd-atelier .mjc16__rows>div:last-child{border:0}
.mmd-atelier .mjc16__rows span{color:var(--muted);font-size:13px;flex-shrink:0}
.mmd-atelier .mjc16__rows b{font-size:14px;font-weight:500;text-align:right;overflow-wrap:anywhere;min-width:0;color:var(--heading);font-variant-numeric:tabular-nums}
.mmd-atelier .mjc16__card--pricing{min-width:0;padding:4px 0 0}
.mmd-atelier .mjc16__pricing{margin-top:8px}
.mmd-atelier .mjc16__pricing .is-total{padding:18px 0;border-bottom:1px solid var(--line)}
.mmd-atelier .mjc16__pricing .is-total b{font-size:26px;color:var(--heading)}
.mmd-atelier .mjc16__pricing .is-total span{color:var(--text)}
.mmd-atelier .mjc16__paycta{margin-top:22px}
.mmd-atelier .mjc16__paycta-btn{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:56px;padding:14px 16px;border:0;border-radius:6px;background:linear-gradient(110deg,var(--gold-start),var(--gold-end));color:var(--button-ink)!important;-webkit-text-fill-color:var(--button-ink)!important;font-size:16px;font-weight:600;text-align:center;text-decoration:none;white-space:normal;line-height:1.4}
.mmd-atelier .mjc16__paycta-btn:hover{filter:brightness(1.04)}
.mmd-atelier .mjc16__paycta-proof,.mmd-atelier .mjc16__success{display:grid;gap:6px;padding:16px 0;color:var(--ok);font-size:13px}
.mmd-atelier .mjc16__paycta-proof a{display:inline-flex;align-items:center;min-height:44px;color:var(--muted);text-decoration:underline;text-underline-offset:4px}
.mmd-atelier .mjc16__methods-panel{border-top:1px solid var(--line);margin-top:16px}
.mmd-atelier .mjc16__methods-panel>summary{display:flex;align-items:center;justify-content:space-between;cursor:pointer;min-height:52px;list-style:none;font-size:13px;color:var(--text)}
.mmd-atelier .mjc16__methods-panel>summary::-webkit-details-marker{display:none}
.mmd-atelier .mjc16__methods-panel>summary::after{content:"+";font-size:22px;color:var(--champagne)}
.mmd-atelier .mjc16__methods-panel[open]>summary::after{content:"−"}
.mmd-atelier .mjc16__payment{padding:0 0 16px}
.mmd-atelier .mjc16__method-links{display:grid;gap:2px}
.mmd-atelier .mjc16__method-links>a{display:flex;align-items:center;justify-content:space-between;min-height:48px;border-bottom:1px solid var(--line);font-size:13px;color:var(--text)}
.mmd-atelier .mjc16__method-links>a::after{content:"↗";color:var(--champagne)}
.mmd-atelier .mjc16__method-links small{display:block;color:var(--muted);font-size:11px}
.mmd-atelier .mjc16__methods-note{font-size:11px;margin-top:10px}
.mmd-atelier .mjc16__pay-state{font-size:12px;color:var(--muted);margin:8px 0}
.mmd-atelier .mjc16__pay-grid{display:grid;gap:12px;margin-top:12px}
.mmd-atelier .mjc16__amount-card{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted)}
.mmd-atelier .mjc16__amount-card strong{color:var(--text);font-size:14px}
.mmd-atelier .mjc16__qr-wrap{display:flex;flex-wrap:wrap;gap:16px;align-items:center}
.mmd-atelier .mjc16__qr-wrap img{width:144px;height:144px;object-fit:contain;background:var(--heading);padding:6px;border-radius:4px}
.mmd-atelier .mjc16__qr-copy{flex:1;min-width:120px;font-size:12px;display:grid;gap:4px}
.mmd-atelier .mjc16__qr-copy a{min-height:44px;display:flex;align-items:center}
.mmd-atelier .mjc16__qr-empty,.mmd-atelier .mjc16__proof{font-size:12px;color:var(--muted);margin:8px 0}
.mmd-atelier .mjc16__qr-empty span,.mmd-atelier .mjc16__proof p{font-size:12px}
.mmd-atelier .mjc16__bank{font-size:13px;padding:12px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
.mmd-atelier .mjc16__bank p{font-size:12px}
.mmd-atelier .mjc16__confirm{margin-top:28px;padding-top:20px;border-top:1px solid var(--line)}
.mmd-atelier .mjc16__confirm h2{font-size:15px;margin:6px 0 8px}
.mmd-atelier .mjc16__check{display:flex;gap:10px;align-items:center;min-height:52px;font-size:12px;color:var(--muted)}
.mmd-atelier .mjc16__check input{width:20px;height:20px;flex:none;accent-color:var(--champagne)}
.mmd-atelier .mjc16__primary,.mmd-atelier .mjc16__retry{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;padding:10px 14px;border:1px solid var(--line);border-radius:6px;color:var(--text);background:var(--panel-soft);white-space:normal}
.mmd-atelier .mjc16__status{font-size:13px;color:var(--muted)}
.mmd-atelier .mjc16__status.is-error{color:var(--bad)}
.mmd-atelier .mjc16__retry{margin-top:12px}
.mmd-atelier .mjc16__map{display:inline-flex;align-items:center;min-height:44px;font-size:12px;margin-top:8px}
.mmd-atelier .mjc16__footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line);margin-top:32px;padding:20px 0;color:var(--muted);font-size:10px}
.mmd-atelier .mjc16__footer strong{font-weight:400;color:var(--text)}
.mmd-atelier [data-session-tracker]{margin-top:28px;border-top:1px solid var(--line);padding-top:22px}
.mmd-atelier .mjc16__tracker-head h2{font-size:18px}
.mmd-atelier .mjc16__tracker-head p{font-size:12px}
.mmd-atelier .mjc16__timeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:16px}
.mmd-atelier .mjc16__timeline-step{font-size:11px;padding:8px 0;border-top:1px solid var(--line);overflow-wrap:anywhere}
.mmd-atelier .mjc16__timeline-step strong{font-size:10px;display:block;color:var(--muted)}
.mmd-atelier .mjc16__timeline-step span{display:block}
.mmd-atelier .mjc16__external-payment{max-width:100%;font:inherit}
.mmd-atelier .mjc16__external-payment :is(a,button){min-height:44px;max-width:100%;font-size:13px;white-space:normal}
.mmd-atelier .mjc16__external-payment :is(h1,h2,h3){font-size:15px}
.mmd-atelier .mjc16__external-payment :is(div,section){max-width:100%}
.mmd-atelier .mjc16__preview-label{font-size:11px;text-align:center;padding:8px;color:var(--muted);border-bottom:1px solid var(--line)}
@media(min-width:768px){.mmd-atelier .mjc16__wrap{width:min(calc(100% - 64px),1120px);padding-top:20px}.mmd-atelier .mjc16__intro{padding:40px 0 30px}.mmd-atelier h1{font-size:36px}.mmd-atelier .mjc16__grid{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:64px}.mmd-atelier .mjc16__card--job{padding:28px}.mmd-atelier .mjc16__model-name{font-size:36px}.mmd-atelier .mjc16__rows>div{padding:14px 0}}
@media(prefers-reduced-motion:reduce){.mmd-atelier *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;

  /* ------------------------------------------------------------------ *
   * 2 · Canonical markup
   * ------------------------------------------------------------------ */
  const ROOT_MARKUP = `
  <div class="mjc16__wrap">
    <header class="mjc16__header">
      <div class="mjc16__brand-stack">
        <div class="mjc16__brand">MMD PRIVÉ</div>
        <div class="mjc16__assistant">JOB CONFIRMATION</div>
      </div>
      <div class="mjc16__pill" data-c-pill>กำลังเปิดข้อมูล</div>
    </header>

    <section class="mjc16__intro">
      <div class="mjc16__eyebrow">MMD PRIVÉ · BANGKOK</div>
      <h1>นัดหมายของคุณ</h1>
    </section>

    <div class="mjc16__grid">
      <section class="mjc16__card mjc16__card--job">
        <div class="mjc16__section-kicker">APPOINTMENT</div>
        <h2 class="mjc16__model-name" data-c-model>—</h2>
        <div class="mjc16__job-type" data-c-type>—</div>
        <div class="mjc16__rows">
          <div><span>วัน</span><b data-c-date>—</b></div>
          <div><span>เวลา</span><b data-c-time>—</b></div>
          <div><span>สถานที่</span><b data-c-location>—</b></div>
          <div data-c-vip-row hidden><span>VIP</span><b data-c-vip>—</b></div>
        </div>
        <a class="mjc16__map" data-c-map href="#" target="_blank" rel="noopener noreferrer" hidden>เปิด Google Maps ↗</a>
      </section>

      <section class="mjc16__card mjc16__card--pricing">
        <div class="mjc16__section-kicker">SUMMARY</div>
        <h2>สรุปยอด</h2>
        <div class="mjc16__rows mjc16__pricing">
          <div><span>ราคาเต็ม</span><b data-c-full>—</b></div>
          <div><span>ส่วนลด</span><b data-c-discount>—</b></div>
          <div class="is-total"><span>ยอดรวม</span><b data-c-net>—</b></div>
          <div><span>มัดจำชำระแล้ว</span><b data-c-deposit>—</b></div>
          <div><span>ยอดคงเหลือ</span><b data-c-balance>—</b></div>
        </div>

    <div class="mjc16__paycta" data-c-paycta hidden>
      <a class="mjc16__paycta-btn" data-c-paycta-link href="#" hidden>ชำระเงิน</a>
      <div class="mjc16__paycta-proof" data-c-paycta-proof role="status" hidden>
        <strong>ส่งสลิปแล้ว · รอตรวจสอบ</strong>
        <a data-c-paycta-check href="#">ตรวจสถานะการชำระเงิน</a>
      </div>
    </div>

    <p class="mjc16__status" data-c-payment-status role="status" aria-live="polite"></p>
    <a class="mjc16__map" href="https://lin.ee/xRqsALs" target="_blank" rel="noopener noreferrer">ติดต่อ MMD</a>
    <section class="mjc16__card mjc16__confirm">
      <div class="mjc16__section-kicker">CONFIRM</div>
      <h2>ยืนยันรายละเอียดนัดหมาย</h2>
      <div class="mjc16__status" role="status" aria-live="polite" data-c-status>กำลังโหลดรายละเอียดงาน…</div>
      <button type="button" class="mjc16__retry" data-c-retry hidden>ลองใหม่</button>
      <label class="mjc16__check"><input type="checkbox" data-c-check disabled><span>รายละเอียดนัดหมายและยอดถูกต้องครับ</span></label>
      <button type="button" class="mjc16__primary" data-c-confirm disabled>ยืนยันรายละเอียด</button>
      <div class="mjc16__success" data-c-success hidden>
        <strong>ยืนยันเรียบร้อยครับ</strong>
        <span>MMD บันทึกรายละเอียดนี้แล้ว สถานะงานจะอัปเดตต่อด้านล่าง</span>
      </div>
    </section>

      </section>
    </div>

    <footer class="mjc16__footer">
      <strong>MMD PRIVÉ · BANGKOK</strong>
      <span>Private by design.</span>
    </footer>
  </div>
`;

  function ensureRoot() {
    const existing = document.querySelectorAll(`#${CUSTOMER_ROOT}, [data-mmd-confirm-role="customer"]`);
    let root = null;
    existing.forEach((el, i) => {
      if (i === 0) root = el;
      else if (el !== root) el.remove();
    });

    if (!root) {
      root = document.createElement("main");
      root.id = CUSTOMER_ROOT;
      const mount =
        document.querySelector("[data-mmd-confirm-mount]") ||
        document.querySelector("main") ||
        document.body;
      if (mount && mount !== document.body && mount.tagName !== "MAIN") mount.appendChild(root);
      else document.body.appendChild(root);
    }

    root.id = CUSTOMER_ROOT;
    root.setAttribute("data-mmd-confirm-role", "customer");
    root.classList.add("mmd-atelier");
    if (root.getAttribute("data-mmd-layout") !== "atelier-v1") root.innerHTML = ROOT_MARKUP;
    root.setAttribute("data-mmd-layout", "atelier-v1");
    return root;
  }

  /* ------------------------------------------------------------------ *
   * 3 · Confirmation runtime (signed token → live contracts)
   * ------------------------------------------------------------------ */
  function bootConfirmation() {
    const R = document.getElementById(CUSTOMER_ROOT);
    if (!R || R.dataset.ready) return;
    R.dataset.ready = "1";
    const API = "https://sigil.mmdbkk.com",
      q = (s) => R.querySelector(s),
      qa = (s) => [...R.querySelectorAll(s)],
      tokens = new URL(location.href).searchParams.getAll("t"),
      token = tokens.length === 1 ? tokens[0].trim() : "",
      E = {
        pill: q("[data-c-pill]"),
        status: q("[data-c-status]"),
        retry: q("[data-c-retry]"),
        model: q("[data-c-model]"),
        type: q("[data-c-type]"),
        date: q("[data-c-date]"),
        time: q("[data-c-time]"),
        location: q("[data-c-location]"),
        vipRow: q("[data-c-vip-row]"),
        vip: q("[data-c-vip]"),
        map: q("[data-c-map]"),
        full: q("[data-c-full]"),
        discount: q("[data-c-discount]"),
        net: q("[data-c-net]"),
        deposit: q("[data-c-deposit]"),
        balance: q("[data-c-balance]"),
        check: q("[data-c-check]"),
        confirm: q("[data-c-confirm]"),
        success: q("[data-c-success]"),
        payCta: q("[data-c-paycta]"),
        payCtaLink: q("[data-c-paycta-link]"),
        payCtaProof: q("[data-c-paycta-proof]"),
        payCtaCheck: q("[data-c-paycta-check]"),
        paymentStatus: q("[data-c-payment-status]"),
      };
    let loaded = false,
      busy = false,
      confirmed = false,
      details = null;
    const steps = Object.fromEntries(qa("[data-step]").map((el) => [el.dataset.step, el])),
      str = (v) => String(v == null ? "" : v).trim(),
      money = (v) => {
        const n = Number(v);
        return v != null && v !== "" && Number.isFinite(n) ? "฿" + n.toLocaleString("th-TH") : "—";
      },
      date = (v) => {
        const x = str(v);
        if (!x) return "—";
        const d = new Date(x.length === 10 ? x + "T00:00:00" : x);
        return Number.isNaN(d.getTime())
          ? x
          : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
      },
      clock = (v) => {
        const x = str(v);
        if (!x) return "";
        if (/^\d{2}:\d{2}$/.test(x)) return x;
        const d = new Date(x);
        return Number.isNaN(d.getTime())
          ? x
          : d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
      },
      range = (a, b) => {
        const x = clock(a),
          y = clock(b);
        return x && y ? x + "–" + y : x || y || "—";
      },
      labels = {
        private: "Private",
        public: "Public",
        exclusive: "Exclusive",
        standard: "Standard",
        premium: "Premium",
        vip: "VIP",
        straight: "Straight",
        gay: "Gay",
        pn: "PN",
        mk: "MK",
        burn: "Burn",
        kiss: "Kiss",
        live: "Live",
      },
      work = (v) =>
        str(v)
          .split(":")
          .filter(Boolean)
          .map((x) => labels[x.toLowerCase()] || x)
          .join(" · ") || "—";

    function status(t, error = false) {
      if (!E.status) return;
      E.status.textContent = t;
      E.status.classList.toggle("is-error", error);
      E.status.hidden = !t;
    }

    async function call(path, body) {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 20000);
      try {
        const r = await fetch(API + path, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const raw = await r.text();
        let d = {};
        try {
          d = raw ? JSON.parse(raw) : {};
        } catch {}
        if (!r.ok || d.ok === false) throw new Error(d.error || d.message || "HTTP " + r.status);
        return d;
      } finally {
        clearTimeout(timer);
      }
    }

    function discountText(p) {
      const a = Number(p?.discount_thb);
      if (!Number.isFinite(a) || a <= 0) return "—";
      const pct = Number(p?.discount_percent);
      return p?.discount_mode === "percent" && Number.isFinite(pct) && pct > 0
        ? pct + "% · -" + money(a)
        : "-" + money(a);
    }

    function resetSteps() {
      Object.values(steps).forEach((el) => el.classList.remove("is-active", "is-done", "is-pending"));
    }

    function flow(mode) {
      resetSteps();
      if (mode === "loading") {
        steps.details?.classList.add("is-active");
        return;
      }
      if (mode === "review") {
        steps.details?.classList.add("is-done");
        steps.price?.classList.add("is-active");
        return;
      }
      if (mode === "payment") {
        steps.details?.classList.add("is-done");
        steps.price?.classList.add("is-done");
        steps.payment?.classList.add("is-active");
        return;
      }
      if (mode === "proof") {
        steps.details?.classList.add("is-done");
        steps.price?.classList.add("is-done");
        steps.payment?.classList.add("is-active");
        steps.done?.classList.add("is-pending");
        return;
      }
      if (mode === "done") {
        steps.details?.classList.add("is-done");
        steps.price?.classList.add("is-done");
        steps.payment?.classList.add("is-done");
        steps.done?.classList.add("is-active");
      }
    }

    function stageText(v) {
      const x = str(v).toLowerCase();
      if (x === "deposit") return "มัดจำ";
      if (x === "balance" || x === "final") return "ยอดคงเหลือ";
      if (x === "full") return "ชำระเต็มจำนวน";
      return "";
    }

    function payUrl() {
      const u = new URL("https://miniapp.line.me/2010830159-0n1O3ANK");
      u.searchParams.set("t", token);
      const lang = str(new URL(location.href).searchParams.get("lang")).toLowerCase();
      if (["th", "en", "zh"].includes(lang)) u.searchParams.set("lang", lang);
      return u.toString();
    }

    /* Prominent pay CTA — derived only from validated backend details. */
    function renderPayCta(d) {
      if (!E.payCta) return;
      E.payCta.hidden = true;
      E.payCtaLink.hidden = true;
      E.payCtaProof.hidden = true;
      E.payCtaLink.removeAttribute("href");
      E.payCtaCheck.removeAttribute("href");
      const p = d?.payment && typeof d.payment === "object" ? d.payment : null;
      if (!token || !d || !p) return;
      const role = str(d.role || d.expected_role).toLowerCase();
      if (role && role !== "customer") return;
      const dead = /^(cancel|canceled|cancelled|void|voided|expired|refunded)$/;
      if ([d.session_status, d.payment_status, d.status, p.stage, p.status].some((v) => dead.test(str(v).toLowerCase()))) return;
      if (p.verified === true) return;
      if (p.proof_received === true) {
        E.payCtaCheck.href = payUrl();
        E.payCtaCheck.referrerPolicy = "no-referrer";
        E.payCtaProof.hidden = false;
        E.payCta.hidden = false;
        return;
      }
      const amt = Number(p.amount_due_thb);
      if (p.accepting_payment === false || !Number.isFinite(amt) || amt <= 0) return;
      const st = str(p.stage).toLowerCase();
      const label = st === "deposit" ? "ชำระมัดจำ " : st === "balance" || st === "final" ? "ชำระยอดคงเหลือ " : "ชำระเงิน ";
      E.payCtaLink.textContent = label + "฿" + amt.toLocaleString("th-TH");
      E.payCtaLink.href = payUrl();
      E.payCtaLink.referrerPolicy = "no-referrer";
      E.payCtaLink.hidden = false;
      E.payCta.hidden = false;

    }

    function renderPayment(d) {
      renderPayCta(d);
      const p = d?.payment;
      E.paymentStatus.textContent = p?.verified === true
        ? "MMD ตรวจยอดแล้ว · ไม่ต้องชำระซ้ำครับ"
        : p?.proof_received === true ? "ได้รับสลิปแล้ว กำลังตรวจยอดครับ"
        : p && p.amount_due_thb != null && Number(p.amount_due_thb) === 0 ? "ไม่มียอดที่ต้องชำระในรายการนี้ครับ" : "";
    }

    function render(d) {
      details = d;
      const p = d.pricing || {};
      E.model.textContent = str(d.model_name) || "—";
      E.type.textContent = work(d.job_type);
      E.date.textContent = date(d.job_date);
      E.time.textContent = range(d.start_time, d.end_time);
      E.location.textContent = str(d.location_name) || "—";
      if (d.vip_detail) {
        E.vip.textContent = str(d.vip_detail);
        E.vipRow.hidden = false;
      } else E.vipRow.hidden = true;
      if (/^https:\/\//i.test(str(d.google_map_url))) {
        E.map.href = d.google_map_url;
        E.map.hidden = false;
      } else E.map.hidden = true;
      E.full.textContent = money(p.full_price_thb);
      E.discount.textContent = discountText(p);
      E.net.textContent = money(p.net_price_thb ?? d.amount_thb);
      const discountAmount = Number(p.discount_thb);
      const hasDiscount = Number.isFinite(discountAmount) && discountAmount > 0;
      const fullRow = E.full?.closest("div");
      const discountRow = E.discount?.closest("div");
      if (fullRow) fullRow.hidden = !hasDiscount;
      if (discountRow) discountRow.hidden = !hasDiscount;
      E.deposit.textContent = money(p.deposit_received_thb);
      E.balance.textContent = money(p.balance_thb);
      loaded = true;
      E.check.disabled = false;
      E.pill.textContent = d.payment?.verified === true ? "ตรวจยอดแล้ว" : d.payment?.proof_received === true ? "รอตรวจสอบ" : "รอยืนยันรายละเอียด";
      E.retry.hidden = true;
      status("");
      flow("review");
      renderPayment(d);
      if (d.confirmation_change_pending) { status("MMD กำลังจัดการคำขอแก้ไข กรุณารอรายละเอียดล่าสุดก่อนยืนยัน", true); E.retry.hidden = false; }
      sync();
    }

    function sync() {
      E.confirm.disabled = busy || confirmed || !loaded || !E.check.checked || details?.confirmation_change_pending === true;
    }

    async function load() {
      if (busy) return;
      busy = true;
      loaded = false;
      details = null;
      E.check.disabled = true;
      E.retry.hidden = true;
      E.pill.textContent = "กำลังเปิดข้อมูล";
      status("กำลังโหลดรายละเอียดงาน…");
      flow("loading");
      renderPayment(null);
      sync();
      if (!token) {
        busy = false;
        E.pill.textContent = "ขอลิงก์ใหม่";
        status("ลิงก์นี้ไม่สมบูรณ์ กรุณาขอลิงก์ใหม่จาก MMD", true);
        sync();
        return;
      }
      try {
        const data = await call("/v1/confirm/details", { t: token, expected_role: "customer" });
        render(data);
        try {
          const context = await call("/v1/confirm/context", { t: token, expected_role: "customer" });
          confirmed = Boolean(context.confirmation?.acknowledged_at) && !data.confirmation_change_pending;
          E.success.hidden = !confirmed;
          E.check.disabled = confirmed;
          E.confirm.textContent = confirmed ? "ยืนยันแล้ว" : "ยืนยันรายละเอียด";
          if (confirmed && !data.payment?.verified && !data.payment?.proof_received) E.pill.textContent = "ยืนยันรายละเอียดแล้ว";
        } catch (_) { /* Details remain readable when optional ACK metadata is unavailable. */ }

      } catch (e) {
        E.pill.textContent = "ลองใหม่อีกครั้ง";
        E.retry.hidden = false;
        status("ยังเปิดรายละเอียดงานไม่ได้ กรุณาลองใหม่", true);
      } finally {
        busy = false;
        sync();
      }
    }

    async function confirm() {
      if (E.confirm.disabled) return;
      busy = true;
      sync();
      status("กำลังยืนยัน…");
      try {
        await call("/v1/confirm/ack", { t: token, expected_role: "customer", confirmation_revision: details?.confirmation_revision });
        confirmed = true;
        E.success.hidden = false;
        E.check.disabled = true;
        E.confirm.textContent = "ยืนยันแล้ว";
        E.pill.textContent = "ยืนยันแล้ว";
        status("");
        renderPayment(details);
        setTimeout(() => {
          const target = R.querySelector("[data-session-tracker]") || E.success;
          target?.scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            block: "start",
          });
        }, 120);
      } catch (e) {
        loaded = false; E.check.checked = false; E.retry.hidden = false;
        status("รายละเอียดอาจเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดและตรวจอีกครั้งก่อนยืนยัน", true);
      } finally {
        busy = false;
        sync();
      }
    }

    E.retry.addEventListener("click", load);
    E.check.addEventListener("change", sync);
    E.confirm.addEventListener("click", confirm);
    load();
    // Return from LIFF or a proof review: always re-read server truth.
    window.addEventListener("focus", () => load());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
    window.setInterval(() => { if (!document.hidden) load(); }, 25000);
  }

  /* ------------------------------------------------------------------ *
   * 4 · Payment ownership
   * Initial payment is handled by the signed /sigil/pay flow.
   * Final/balance payment stays in customer-session-tracker v2 and uses
   * payments-worker /v1/confirm/payment-instructions as the sole authority.
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ *
   * 5 · RULES CTA (always available, even when details fail to load)
   * ------------------------------------------------------------------ */
  function bootRulesCta(attempt = 0) {
    const RULES_PATH = "/rules/customer";

    function buildLink(root) {
      if (!root || root.querySelector("[data-mmd-confirm-rules]")) return null;
      const link = document.createElement("a");
      link.className = "mmd-confirm-rules-btn";
      link.dataset.mmdConfirmRules = "1";
      link.href = RULES_PATH;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "RULES";
      link.setAttribute("aria-label", "Open MMD Rules");
      return link;
    }

    function wireCustomer() {
      const root = document.getElementById(CUSTOMER_ROOT);
      if (!root) return false;
      const header = root.querySelector(".mjc16__header");
      const pill = root.querySelector("[data-c-pill]");
      if (!header || !pill) return false;
      if (root.querySelector("[data-mmd-confirm-rules]")) return true;
      let tools = header.querySelector(".mmd-confirm-rules-tools");
      if (!tools) {
        tools = document.createElement("div");
        tools.className = "mmd-confirm-rules-tools";
        header.appendChild(tools);
        tools.appendChild(pill);
      }
      const link = buildLink(root);
      if (link) tools.insertBefore(link, pill);
      return true;
    }

    function wireModel() {
      const root = document.getElementById(MODEL_ROOT);
      if (!root) return false;
      if (root.querySelector("[data-mmd-confirm-rules]")) return true;
      const tools = root.querySelector(".mm15__tools");
      if (!tools) return false;
      const link = buildLink(root);
      if (!link) return true;
      const pill = root.querySelector("[data-m-pill]");
      if (pill && pill.parentElement === tools) tools.insertBefore(link, pill);
      else tools.appendChild(link);
      return true;
    }

    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    let ready = false;
    if (path === CUSTOMER_PATH) ready = wireCustomer();
    if (path === "/sigil/confirm/job-model") ready = wireModel();
    if (!ready && attempt < 30) window.setTimeout(() => bootRulesCta(attempt + 1), 120);
  }

  /* ------------------------------------------------------------------ *
   * 6 · Customer Session Tracker v2 (external, pinned + SRI)
   * ------------------------------------------------------------------ */
  function humanizeSessionTracker(attempt = 0) {
    const root = document.getElementById(CUSTOMER_ROOT);
    const tracker = root?.querySelector("[data-session-tracker]");
    if (!tracker) {
      if (attempt < 60) setTimeout(() => humanizeSessionTracker(attempt + 1), 150);
      return;
    }
    const title = tracker.querySelector("#mjc16SessionTitle");
    const copy = tracker.querySelector(".mjc16__tracker-head p");
    if (title) title.textContent = "สถานะงาน";
    if (copy) copy.textContent = "หน้านี้จะอัปเดตให้เองเมื่อมีความคืบหน้าครับ";

    const badge = tracker.querySelector("[data-session-badge]");
    const normalizeBadge = () => {
      if (!badge) return;
      const value = (badge.textContent || "").trim();
      if (value === "LIVE STATUS") badge.textContent = "อัปเดตแล้ว";
      if (value === "รอ Session") badge.textContent = "กำลังเตรียมงาน";
    };
    normalizeBadge();
    if (badge && !badge.dataset.humanizedObserver) {
      badge.dataset.humanizedObserver = "1";
      new MutationObserver(normalizeBadge).observe(badge, { childList: true, characterData: true, subtree: true });
    }
  }

  function bootSessionTracker() {
    if (document.querySelector("[data-mmd-customer-session-tracker]")) {
      humanizeSessionTracker();
      return;
    }
    const s = document.createElement("script");
    s.setAttribute("data-mmd-customer-session-tracker", "v2.0.0");
    s.src =
      "https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-workers@3b032db7e591afa1427f572eb9f3a2928cc48e09/webflow/sigil/confirm/customer-session-tracker-v2.js";
    s.integrity = "sha384-uk7VQJnMYofEGMELxY/uuIZBCIw+kWjmPwM05DOLaWu+wMWettoDh7iZZ7zNbWNC";
    s.crossOrigin = "anonymous";
    s.async = false;
    s.addEventListener("load", () => humanizeSessionTracker(), { once: true });
    document.body.appendChild(s);
  }

  /* ------------------------------------------------------------------ *
   * 7 · Boot
   * ------------------------------------------------------------------ */
  function boot() {
    ["mmd-job-confirm-v16-style", "mmd-bangkok-photo-layer-v1", "mmd-tiny-mark-v1", "mmd-confirm-rules-v1-style", "mmd-job-confirm-v2-simplify", "mmd-job-confirm-paycta-v1"].forEach(id => document.getElementById(id)?.remove());
    injectStyle("mmd-customer-atelier-v1", BASE_CSS);
    if (!document.getElementById("mmd-confirm-thai-font")) {
      const font = document.createElement("link"); font.id = "mmd-confirm-thai-font"; font.rel = "stylesheet";
      font.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600&display=swap"; document.head.appendChild(font);
    }

    const root = ensureRoot();

    bootConfirmation();
    bootRulesCta();
    bootSessionTracker();
    humanizeSessionTracker();

    root.setAttribute("data-mmd-source", "lovable-github");
    root.setAttribute("data-mmd-bridge-version", BRIDGE_VERSION);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();


