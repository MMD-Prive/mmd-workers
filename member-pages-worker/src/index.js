const WORKER = "member-pages-worker";
const VERSION = "20260620-member-membership-latest";

const MEMBERSHIP_PATHS = new Set(["/member/membership", "/member/membership/"]);

const PACKAGES = [
  {
    key: "standard",
    eyebrow: "STANDARD PACKAGE",
    title: "Standard",
    subtitle: "แพ็กเกจของคนมีระดับ",
    price: "เริ่มจาก ฿15,000",
    note: "เหมาะสำหรับสมาชิกที่ต้องการเริ่มใช้ MMD Privé อย่างเป็นระบบ มีพื้นที่สมาชิกและเส้นทางชำระเงินที่ชัดเจน",
    points: [
      "เข้าสู่ Member Area และตรวจสถานะสมาชิก",
      "ใช้เส้นทางชำระเงินหรือ renew ผ่านระบบ",
      "เหมาะกับการเริ่มต้นแบบสุภาพ เป็นส่วนตัว และไม่ซับซ้อน",
    ],
  },
  {
    key: "premium",
    eyebrow: "PREMIUM PACKAGE",
    title: "Premium",
    subtitle: "แพ็กเกจของคนที่ต้องการความพรีเมียม",
    price: "เริ่มจาก ฿25,000",
    note: "สำหรับสมาชิกที่ต้องการประสบการณ์ที่ถูกจัดวางละเอียดขึ้น เหมาะกับ preference ที่เฉพาะตัวและต้องการการดูแลที่นิ่งกว่า",
    points: [
      "เหมาะกับ companion preference ที่ละเอียดขึ้น",
      "การดูแลและการจัดลำดับคำขอพรีเมียมกว่า Standard",
      "ใช้ร่วมกับประวัติสมาชิกและ dashboard เพื่อความต่อเนื่อง",
    ],
  },
  {
    key: "vip",
    eyebrow: "VIP CURATION",
    title: "VIP",
    subtitle: "ถูกจัดลำดับและดูแลเป็นส่วนตัวกว่า",
    price: "Private review",
    note: "สำหรับสมาชิกที่มีประวัติและความต้องการชัดเจน MMD จะพิจารณาความเหมาะสมของคำขอและจัดลำดับการดูแลเป็นรายกรณี",
    points: [
      "การจัดลำดับคำขอเป็นส่วนตัวกว่า",
      "เหมาะกับคำขอที่ต้องการความละเอียดและความต่อเนื่อง",
      "ขึ้นกับสถานะสมาชิก ประวัติ และการตรวจสอบของระบบ",
    ],
  },
];

export function isMembershipPath(url) {
  return MEMBERSHIP_PATHS.has(url.pathname.toLowerCase());
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          allow: "GET, HEAD, OPTIONS",
          "x-mmd-worker": WORKER,
          "x-mmd-version": VERSION,
        },
      });
    }

    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          allow: "GET, HEAD, OPTIONS",
          "content-type": "text/plain; charset=utf-8",
          "x-mmd-worker": WORKER,
          "x-mmd-version": VERSION,
        },
      });
    }

    if (!isMembershipPath(url)) {
      return new Response("Not Found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-mmd-worker": WORKER,
          "x-mmd-version": VERSION,
        },
      });
    }

    return renderMembershipPage(request);
  },
};

export function renderMembershipPage(request) {
  const url = new URL(request.url);
  const selectedPlan = (url.searchParams.get("plan") || url.searchParams.get("package") || "").toLowerCase();
  const query = url.search || "";
  const dashboardHref = appendQuery("/member/dashboard", query);
  const paymentHref = appendQuery("/pay/membership", query);
  const profileHref = appendQuery("/member/profile", query);

  const packageCards = PACKAGES.map((item) => renderPackageCard(item, selectedPlan, query)).join("");

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Privé | Membership</title>
    <meta name="robots" content="noindex, nofollow" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      html { min-height: 100%; background: #090604; }
      body {
        margin: 0;
        min-height: 100vh;
        color: #fff7e8;
        background:
          radial-gradient(circle at 18% 0%, rgba(248, 197, 108, 0.24), transparent 34%),
          radial-gradient(circle at 88% 16%, rgba(132, 24, 12, 0.34), transparent 38%),
          linear-gradient(145deg, #070403 0%, #110b06 48%, #050403 100%);
        font-family: Inter, "Avenir Next", "Segoe UI", "Noto Sans Thai", Arial, sans-serif;
      }
      a { color: inherit; }
      .mmd-member-membership {
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
        padding: 28px 0 44px;
      }
      .mmd-member-membership__nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 34px;
      }
      .mmd-member-membership__brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        font-weight: 900;
        letter-spacing: .16em;
        text-transform: uppercase;
        color: #ffd98d;
      }
      .mmd-member-membership__mark {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        background: linear-gradient(135deg, #ffe0a3, #b98632 54%, #56380d);
        box-shadow: 0 0 28px rgba(255, 201, 104, .32);
      }
      .mmd-member-membership__nav-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 10px;
      }
      .mmd-member-membership__ghost {
        min-height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255, 216, 151, .28);
        border-radius: 999px;
        padding: 0 14px;
        color: #fff1d0;
        background: rgba(255, 255, 255, .045);
        text-decoration: none;
        font-size: 13px;
        font-weight: 800;
      }
      .mmd-member-membership__hero {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(280px, .92fr);
        gap: 24px;
        align-items: stretch;
        margin-bottom: 24px;
      }
      .mmd-member-membership__panel {
        border: 1px solid rgba(255, 216, 151, .18);
        border-radius: 32px;
        background: rgba(11, 8, 6, .74);
        box-shadow: 0 24px 80px rgba(0, 0, 0, .34);
        backdrop-filter: blur(18px);
      }
      .mmd-member-membership__intro {
        padding: clamp(28px, 5vw, 54px);
      }
      .mmd-member-membership__eyebrow {
        margin: 0 0 14px;
        color: #ffd98d;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: .2em;
        text-transform: uppercase;
      }
      .mmd-member-membership h1 {
        max-width: 760px;
        margin: 0 0 18px;
        color: #ffffff;
        font-size: clamp(42px, 8vw, 92px);
        line-height: .93;
        letter-spacing: -0.065em;
      }
      .mmd-member-membership__lead {
        max-width: 700px;
        margin: 0 0 24px;
        color: #fff0cf;
        font-size: clamp(16px, 2vw, 20px);
        line-height: 1.75;
      }
      .mmd-member-membership__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 18px;
      }
      .mmd-member-membership__button {
        min-height: 48px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 0 18px;
        color: #120b04;
        background: linear-gradient(135deg, #ffe3a3, #d6a044);
        text-decoration: none;
        font-size: 14px;
        font-weight: 950;
        box-shadow: 0 14px 42px rgba(255, 201, 104, .18);
      }
      .mmd-member-membership__button.secondary {
        color: #fff4dc;
        background: rgba(255, 255, 255, .07);
        border: 1px solid rgba(255, 216, 151, .25);
        box-shadow: none;
      }
      .mmd-member-membership__status {
        padding: clamp(24px, 4vw, 34px);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 20px;
      }
      .mmd-member-membership__status-card {
        border-radius: 24px;
        padding: 20px;
        background: linear-gradient(145deg, rgba(255, 220, 157, .16), rgba(255, 255, 255, .04));
        border: 1px solid rgba(255, 216, 151, .20);
      }
      .mmd-member-membership__status-title {
        margin: 0 0 10px;
        color: #fff;
        font-size: 21px;
        font-weight: 950;
      }
      .mmd-member-membership__status-copy {
        margin: 0;
        color: #ffe9bc;
        font-size: 15px;
        line-height: 1.7;
      }
      .mmd-member-membership__grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        margin-top: 16px;
      }
      .mmd-member-membership__package {
        position: relative;
        overflow: hidden;
        min-height: 100%;
        padding: 24px;
        border: 1px solid rgba(255, 216, 151, .18);
        border-radius: 28px;
        background: rgba(255, 255, 255, .055);
      }
      .mmd-member-membership__package.is-selected {
        border-color: rgba(255, 219, 145, .72);
        box-shadow: 0 0 0 1px rgba(255, 219, 145, .26), 0 22px 70px rgba(218, 160, 70, .14);
      }
      .mmd-member-membership__package::before {
        content: "";
        position: absolute;
        inset: -1px -1px auto auto;
        width: 140px;
        height: 140px;
        background: radial-gradient(circle, rgba(255, 215, 132, .20), transparent 64%);
        pointer-events: none;
      }
      .mmd-member-membership__package-kicker {
        margin: 0 0 12px;
        color: #ffd98d;
        font-size: 11px;
        font-weight: 950;
        letter-spacing: .17em;
      }
      .mmd-member-membership__package h2 {
        margin: 0 0 8px;
        color: #fff;
        font-size: 30px;
        line-height: 1.05;
      }
      .mmd-member-membership__package-subtitle {
        margin: 0 0 14px;
        color: #ffe3a9;
        font-size: 16px;
        font-weight: 850;
      }
      .mmd-member-membership__price {
        margin: 0 0 14px;
        color: #fff;
        font-size: 19px;
        font-weight: 950;
      }
      .mmd-member-membership__note {
        margin: 0 0 18px;
        color: #f4dfbb;
        font-size: 14px;
        line-height: 1.75;
      }
      .mmd-member-membership__list {
        display: grid;
        gap: 10px;
        margin: 0 0 20px;
        padding: 0;
        list-style: none;
      }
      .mmd-member-membership__list li {
        position: relative;
        padding-left: 18px;
        color: #fff1d3;
        font-size: 14px;
        line-height: 1.58;
      }
      .mmd-member-membership__list li::before {
        content: "";
        position: absolute;
        left: 0;
        top: .65em;
        width: 7px;
        height: 7px;
        border-radius: 99px;
        background: #ffd98d;
      }
      .mmd-member-membership__package-link {
        width: 100%;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        color: #140d05;
        background: #ffd98d;
        text-decoration: none;
        font-size: 14px;
        font-weight: 950;
      }
      .mmd-member-membership__blackcard {
        margin-top: 16px;
        padding: clamp(22px, 4vw, 34px);
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        align-items: center;
        border-color: rgba(255, 216, 151, .22);
        background:
          linear-gradient(135deg, rgba(255, 255, 255, .07), rgba(255, 255, 255, .025)),
          radial-gradient(circle at top right, rgba(255, 214, 135, .16), transparent 42%);
      }
      .mmd-member-membership__blackcard h2 {
        margin: 0 0 10px;
        color: #fff;
        font-size: clamp(28px, 5vw, 54px);
        line-height: .98;
        letter-spacing: -0.045em;
      }
      .mmd-member-membership__blackcard p {
        max-width: 790px;
        margin: 0;
        color: #ffe8bd;
        font-size: 15px;
        line-height: 1.75;
      }
      .mmd-member-membership__footer {
        margin: 22px 0 0;
        color: #d9c39e;
        font-size: 12px;
        line-height: 1.7;
      }
      @media (max-width: 920px) {
        .mmd-member-membership__hero,
        .mmd-member-membership__blackcard {
          grid-template-columns: 1fr;
        }
        .mmd-member-membership__grid {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 640px) {
        .mmd-member-membership {
          width: min(100% - 22px, 1180px);
          padding-top: 18px;
        }
        .mmd-member-membership__nav {
          align-items: flex-start;
          flex-direction: column;
        }
        .mmd-member-membership__nav-actions,
        .mmd-member-membership__actions {
          width: 100%;
        }
        .mmd-member-membership__ghost,
        .mmd-member-membership__button {
          width: 100%;
        }
        .mmd-member-membership__intro,
        .mmd-member-membership__status,
        .mmd-member-membership__package {
          border-radius: 24px;
        }
      }
    </style>
  </head>
  <body>
    <main class="mmd-member-membership" data-mmd-page="member-membership" data-mmd-version="${VERSION}">
      <nav class="mmd-member-membership__nav" aria-label="Membership navigation">
        <div class="mmd-member-membership__brand"><span class="mmd-member-membership__mark" aria-hidden="true"></span><span>MMD Privé</span></div>
        <div class="mmd-member-membership__nav-actions">
          <a class="mmd-member-membership__ghost" href="${escapeAttribute(dashboardHref)}">Member Dashboard</a>
          <a class="mmd-member-membership__ghost" href="${escapeAttribute(profileHref)}">Member Profile</a>
        </div>
      </nav>

      <section class="mmd-member-membership__hero" aria-labelledby="mmd-member-membership-title">
        <div class="mmd-member-membership__panel mmd-member-membership__intro">
          <p class="mmd-member-membership__eyebrow">Member-facing Package Selection</p>
          <h1 id="mmd-member-membership-title">Membership</h1>
          <p class="mmd-member-membership__lead">เลือกแพ็กเกจสมาชิกของ MMD Privé ให้ตรงกับระดับการดูแลที่ต้องการ หน้านี้เป็นพื้นที่สำหรับเริ่ม ต่ออายุ หรืออัปเกรดสมาชิก หลังจากส่งข้อมูลหรือหลักฐานชำระเงินแล้ว ระบบจะตรวจสอบก่อนยืนยันสถานะเสมอ</p>
          <div class="mmd-member-membership__actions">
            <a class="mmd-member-membership__button" href="${escapeAttribute(paymentHref)}">Start / Renew / Upgrade</a>
            <a class="mmd-member-membership__button secondary" href="${escapeAttribute(dashboardHref)}">Continue to Dashboard</a>
          </div>
        </div>

        <aside class="mmd-member-membership__panel mmd-member-membership__status" aria-label="Membership status note">
          <div class="mmd-member-membership__status-card">
            <p class="mmd-member-membership__status-title">Verification first</p>
            <p class="mmd-member-membership__status-copy">สลิปหรือหลักฐานชำระเงินเป็นข้อมูลประกอบเท่านั้น สถานะสมาชิกและสิทธิ์การใช้งานจะเริ่มหลังจากยอดถูกตรวจสอบและจับคู่กับบัญชีทางการเรียบร้อยแล้ว</p>
          </div>
          <div class="mmd-member-membership__status-card">
            <p class="mmd-member-membership__status-title">Companion preference</p>
            <p class="mmd-member-membership__status-copy">การเลือกแพ็กเกจช่วยบอกระดับการดูแล ไม่ใช่การยืนยันงานหรือยืนยัน companion ทันที คำขอจะถูกตรวจสอบตามสถานะและความเหมาะสมก่อนเสมอ</p>
          </div>
        </aside>
      </section>

      <section class="mmd-member-membership__grid" aria-label="Membership packages">
        ${packageCards}
      </section>

      <section class="mmd-member-membership__panel mmd-member-membership__blackcard" aria-label="Black Card note">
        <div>
          <p class="mmd-member-membership__eyebrow">BLACK CARD NOTE</p>
          <h2>ไม่ใช่ซื้อ แต่ถูกพิจารณา</h2>
          <p>Black Card เป็นชั้นสิทธิ์ที่ MMD พิจารณาแบบเป็นส่วนตัวตามประวัติ ความเหมาะสม และความไว้วางใจของระบบ ไม่ใช่แพ็กเกจที่กดซื้อเพื่อปลดล็อกทันที และไม่ผูกกับการชำระเงินครั้งเดียว</p>
        </div>
        <a class="mmd-member-membership__button secondary" href="${escapeAttribute(dashboardHref)}">Check status</a>
      </section>

      <p class="mmd-member-membership__footer">MMD Privé keeps `/member/*` as the customer-facing Member Area. Private system and admin layers remain under `/sigil/*`. Query parameters are preserved for continuity.</p>
    </main>
  </body>
</html>`;

  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      pragma: "no-cache",
      expires: "0",
      "x-mmd-worker": WORKER,
      "x-mmd-page": "member-membership",
      "x-mmd-version": VERSION,
    },
  });
}

function renderPackageCard(item, selectedPlan, query) {
  const selectedClass = selectedPlan === item.key ? " is-selected" : "";
  const href = appendQuery("/pay/membership", query, { plan: item.key });
  const points = item.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("");

  return `<article class="mmd-member-membership__package${selectedClass}" data-plan="${escapeAttribute(item.key)}">
    <p class="mmd-member-membership__package-kicker">${escapeHtml(item.eyebrow)}</p>
    <h2>${escapeHtml(item.title)}</h2>
    <p class="mmd-member-membership__package-subtitle">${escapeHtml(item.subtitle)}</p>
    <p class="mmd-member-membership__price">${escapeHtml(item.price)}</p>
    <p class="mmd-member-membership__note">${escapeHtml(item.note)}</p>
    <ul class="mmd-member-membership__list">${points}</ul>
    <a class="mmd-member-membership__package-link" href="${escapeAttribute(href)}">เลือก ${escapeHtml(item.title)}</a>
  </article>`;
}

function appendQuery(basePath, query, extraParams = {}) {
  const params = new URLSearchParams(query || "");
  for (const [key, value] of Object.entries(extraParams)) {
    if (value == null || String(value).trim() === "") continue;
    params.set(key, String(value));
  }
  const rendered = params.toString();
  return rendered ? `${basePath}?${rendered}` : basePath;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
