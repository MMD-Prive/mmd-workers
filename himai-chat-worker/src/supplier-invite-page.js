import { getSupplierInvitePreview } from "./supplier-portal.js";

const DEFAULT_SUPPLIER_LIFF_ID = "2011701290-xBE3CirT";

export async function renderSupplierInvitePage(request, env = {}) {
  const url = new URL(request.url);
  const inviteToken = cleanInline(url.searchParams.get("invite"), 512);
  if (!inviteToken) {
    return pageResponse(renderUnavailable(
      "ลิงก์ส่วนตัวนี้ต้องเปิดจากข้อความที่ผมส่งให้คุณ"
    ), 403);
  }

  let preview;
  try {
    preview = await getSupplierInvitePreview(env, inviteToken);
  } catch (error) {
    console.error("Himai Supplier invite cover:", error);
    return pageResponse(renderUnavailable(
      "ผมกำลังตรวจลิงก์ส่วนตัวให้คุณ กรุณาลองเปิดใหม่อีกครั้ง"
    ), 503);
  }

  if (!preview) {
    return pageResponse(renderUnavailable(
      "ลิงก์นี้หมดอายุหรือถูกใช้งานแล้ว กรุณาติดต่อ MMD Privé เพื่อรับลิงก์ใหม่"
    ), 403);
  }

  const liffId = cleanInline(env.HIMAI_SUPPLIER_LIFF_ID || DEFAULT_SUPPLIER_LIFF_ID, 200);
  const portalUrl = new URL("https://liff.line.me/" + encodeURIComponent(liffId));
  portalUrl.searchParams.set("invite", inviteToken);
  portalUrl.searchParams.set("_liff", "1");

  return pageResponse(renderSupplierInvite(preview, portalUrl.toString()));
}

function pageResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
      "content-security-policy": [
        "default-src 'none'",
        "style-src 'unsafe-inline'",
        "img-src 'self' data:",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; "),
    },
  });
}

function renderSupplierInvite(preview, portalUrl) {
  const scope = preview.scope_name || "สินค้าของคุณ";
  const contact = formatContactName(preview.contact_name);
  const onDemand = preview.mode === "on_demand";
  const details = onDemand
    ? [
      ["ทำงานแบบสั่งตามออเดอร์", "ผมจะเปิดข้อมูลของ " + scope + " ให้คุณเมื่อมีออเดอร์ที่ต้องดูแล"],
      ["สิ่งที่คุณจะเห็น", "คุณจะเห็นเฉพาะสินค้าและรายการที่เกี่ยวกับ " + scope],
      ["ลิงก์ส่วนตัว", "ผมใช้ลิงก์นี้เพื่อยืนยัน LINE ของคุณครั้งแรก และจะใช้ซ้ำไม่ได้เมื่อเชื่อมสำเร็จ"],
    ]
    : [
      ["ดูสรุปสินค้า", "ผมเปิดให้คุณตรวจสถานะสินค้าและสต๊อกของ " + scope + " ได้จาก LINE"],
      ["แจ้งเตือนผ่าน LINE", "เมื่อสต๊อกเข้าเกณฑ์ใกล้หมด ผมจะแจ้งคุณผ่าน LINE"],
      ["ลิงก์ส่วนตัว", "ผมใช้ลิงก์นี้เพื่อยืนยัน LINE ของคุณครั้งแรก และจะใช้ซ้ำไม่ได้เมื่อเชื่อมสำเร็จ"],
    ];
  const steps = [
    ["1", "เปิดพื้นที่ Supplier", "กดปุ่มด้านล่างเพื่อเปิดใน LINE"],
    ["2", "ยืนยันบัญชี LINE", "ทำครั้งแรกครั้งเดียว เพื่อผูกกับพื้นที่ของคุณ"],
    ["3", "เริ่มดูข้อมูลของคุณ", onDemand
      ? "เห็นข้อมูลสั่งตามออเดอร์ของ " + scope
      : "เห็นสินค้า สต๊อก และรายการที่เกี่ยวกับ " + scope],
  ];
  const detailHtml = details.map(function(item) {
    return "<article class='detail card'><span class='detail-no'>•</span><div><h2>" +
      escapeHtml(item[0]) + "</h2><p>" + escapeHtml(item[1]) + "</p></div></article>";
  }).join("");
  const stepHtml = steps.map(function(item) {
    return "<li><span>" + escapeHtml(item[0]) + "</span><div><b>" +
      escapeHtml(item[1]) + "</b><small>" + escapeHtml(item[2]) + "</small></div></li>";
  }).join("");
  const expiry = formatExpiry(preview.expires_at);

  return renderShell([
    "<section class='hero'>",
      "<p class='eyebrow'>Himai Shop's Suppliers</p>",
      "<h1>" + (contact ? "สวัสดี " + escapeHtml(contact) : "สวัสดีครับ") + "</h1>",
      "<p class='lead'>ผมจาก MMD ส่งพื้นที่ Supplier ส่วนตัวสำหรับ <strong>" + escapeHtml(scope) + "</strong> ให้คุณ</p>",
      "<div class='scope'>" + (onDemand ? "สั่งตามออเดอร์" : "Supplier Stock Summary") + "</div>",
    "</section>",
    "<section class='card intro'>",
      "<p class='section-kicker'>ผมส่งอะไรมาให้คุณ</p>",
      "<h2>" + (onDemand ? "พื้นที่รับงานของคุณใน Himai Shop" : "พื้นที่ดูข้อมูลสินค้าของคุณใน Himai Shop") + "</h2>",
      "<p>" + (onDemand
        ? "ผมส่งลิงก์นี้เพื่อให้คุณดูข้อมูลที่เกี่ยวกับออเดอร์ของ " + escapeHtml(scope) + " โดยตรง"
        : "ผมส่งลิงก์นี้เพื่อให้คุณดูสรุปสินค้าและสต๊อกของ " + escapeHtml(scope) + " โดยตรง") + "</p>",
    "</section>",
    "<section class='details' aria-label='รายละเอียดพื้นที่ Supplier'>" + detailHtml + "</section>",
    "<section class='steps card'>",
      "<p class='section-kicker'>เริ่มใช้งานอย่างไร</p>",
      "<ol>" + stepHtml + "</ol>",
    "</section>",
    "<a class='cta' href='" + escapeAttr(portalUrl) + "'>เปิดพื้นที่ Supplier ใน LINE <span aria-hidden='true'>→</span></a>",
    "<p class='expiry'>ลิงก์ส่วนตัวนี้เปิดได้ถึง " + escapeHtml(expiry) + "</p>",
    "<p class='privacy'>พื้นที่นี้แสดงเฉพาะข้อมูลที่เกี่ยวกับสินค้าของคุณ</p>",
  ].join(""));
}

function renderUnavailable(message) {
  return renderShell([
    "<section class='hero compact'>",
      "<p class='eyebrow'>Himai Shop's Suppliers</p>",
      "<h1>ลิงก์ส่วนตัว</h1>",
    "</section>",
    "<section class='card intro unavailable'>",
      "<p>" + escapeHtml(message) + "</p>",
    "</section>",
  ].join(""));
}

function renderShell(body) {
  return [
    "<!doctype html>",
    "<html lang='th'>",
    "<head>",
      "<meta charset='utf-8'>",
      "<meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>",
      "<meta name='theme-color' content='#f7f2e8'>",
      "<meta name='color-scheme' content='light'>",
      "<title>Himai Shop Supplier</title>",
      "<style>" + STYLES + "</style>",
    "</head>",
    "<body><main class='shell'>",
      "<header class='top'><div class='brand'>Himai Shop</div><span>Supplier workspace</span></header>",
      body,
      "<footer>MMD Privé · Himai Shop</footer>",
    "</main></body></html>",
  ].join("\n");
}

function formatExpiry(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ตามเวลาที่ระบุในข้อความนี้";
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }) + " น.";
}

function formatContactName(value) {
  const name = cleanInline(value, 120).replace(/^(?:คุณ\s*)+/u, "").trim();
  if (!name || /^supplier$/i.test(name)) return "";
  return "คุณ" + name;
}

function cleanInline(value, max) {
  return String(value == null ? "" : value)
    .trim()
    .slice(0, max)
    .replace(/[\u0000-\u001F\u007F]/g, "");
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function(char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function escapeAttr(value) {
  return escapeHtml(value);
}

const STYLES = `
:root{--bg:#f7f2e8;--paper:#fffdf8;--ink:#30281f;--muted:#766b60;--line:#ded4c4;--taupe:#9d8d7d;--espresso:#493a30;--shadow:0 16px 40px rgba(61,47,34,.10);--font-ui:"LINE Seed Sans TH","Noto Sans Thai","Noto Sans","Sukhumvit Set","Leelawadee UI",system-ui,sans-serif;--font-display:"Noto Serif Thai","Iowan Old Style","Palatino Linotype","Sukhumvit Set",serif}
*{box-sizing:border-box}
html{background:var(--bg);-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 100% 0,rgba(157,141,125,.18),transparent 32%),linear-gradient(180deg,#fbf8f1 0%,var(--bg) 55%,#f2ebdf 100%);color:var(--ink);font:16px/1.68 var(--font-ui);letter-spacing:.005em;-webkit-font-smoothing:antialiased}
.shell{width:min(560px,100%);margin:0 auto;padding:0 16px max(34px,env(safe-area-inset-bottom))}
.top{display:flex;align-items:center;justify-content:space-between;padding:max(18px,env(safe-area-inset-top)) 0 18px;border-bottom:1px solid rgba(222,212,196,.82)}
.brand{font:800 14px/1 var(--font-ui);letter-spacing:.1em;text-transform:uppercase}
.top span{color:var(--muted);font:650 10px/1.2 var(--font-ui);letter-spacing:.09em;text-transform:uppercase}
.hero{padding:38px 2px 18px}.hero.compact{padding-bottom:10px}
.eyebrow,.section-kicker{margin:0 0 8px;color:var(--taupe);font:750 11px/1.35 var(--font-ui);letter-spacing:.1em;text-transform:uppercase}
h1{margin:0;font:700 clamp(36px,9vw,50px)/1.18 var(--font-display);letter-spacing:-.025em}
.lead{max-width:37rem;margin:13px 0 0;color:var(--muted);font-size:16px}.lead strong{color:var(--ink);font-weight:650}
.scope{display:inline-flex;margin-top:15px;padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:rgba(255,253,248,.72);color:var(--espresso);font-size:12px;font-weight:650}
.card{border:1px solid var(--line);border-radius:20px;background:rgba(255,253,248,.92);box-shadow:var(--shadow)}
.intro{padding:22px}.intro h2{margin:0;font-size:22px;letter-spacing:-.025em}.intro p{margin:9px 0 0;color:var(--muted)}.intro.unavailable{margin-top:18px}.intro.unavailable p{margin:0;color:var(--ink)}
.details{display:grid;gap:10px;margin-top:12px}.detail{display:flex;gap:13px;padding:16px}.detail-no{display:grid;place-items:center;flex:0 0 24px;height:24px;border-radius:50%;background:#f0e9de;color:var(--espresso);font-size:15px}.detail h2{margin:0;font-size:16px}.detail p{margin:4px 0 0;color:var(--muted);font-size:14px}
.steps{margin-top:12px;padding:20px}.steps ol{display:grid;gap:14px;margin:14px 0 0;padding:0;list-style:none}.steps li{display:flex;gap:11px}.steps li>span{display:grid;place-items:center;flex:0 0 26px;height:26px;border:1px solid var(--line);border-radius:50%;color:var(--espresso);font:700 13px/1 var(--font-display)}.steps b{display:block;font-size:15px}.steps small{display:block;margin-top:2px;color:var(--muted);font-size:13px}
.cta{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:58px;margin-top:16px;padding:0 20px;border-radius:16px;background:var(--espresso);color:#fffdf8;text-decoration:none;font-weight:700;box-shadow:0 14px 26px rgba(73,58,48,.2)}.cta span{font-size:22px;font-weight:400}.cta:focus-visible{outline:3px solid rgba(73,58,48,.3);outline-offset:3px}
.expiry,.privacy{margin:12px 6px 0;color:var(--muted);font-size:12px;text-align:center}.privacy{margin-top:5px}
footer{padding:26px 0 4px;color:#9e9081;font-size:10px;letter-spacing:.11em;text-align:center;text-transform:uppercase}
@media(min-width:700px){.shell{padding-left:24px;padding-right:24px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;
