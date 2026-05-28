import { redirect } from "../lib/response";
import type { Env } from "../types";

const SIGIL_RENEWAL_PAGE_PATH = "/sigil/renewal";
const SIGIL_RENEWAL_ALIAS_PATH = "/renewal";
const SIGIL_RENEW_LEGACY_PATH = "/sigil/renew";
const SIGIL_RENEWAL_CSS_PATH = "/sigil/renewal.css";
const INME_RENEWAL_SCRIPT_PATH = "/assets/inme/inme-renewal.js";
const SIGIL_RENEWAL_ASSET_BASE_URL = "https://sigil.mmdbkk.com";
const SIGIL_RENEWAL_BUILD = "sigil-renewal-single-page-20260529a";

const SIGIL_RENEWAL_HTML = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>MMD SĪGIL Renewal</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Antonio:wght@600;700&family=Noto+Sans+Thai:wght@300;400;500;600;700;800&family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${SIGIL_RENEWAL_ASSET_BASE_URL}${SIGIL_RENEWAL_CSS_PATH}" />
  </head>
  <body>
    <main class="mmd-renewal-lv10 sigil-renewal-page" data-build="${SIGIL_RENEWAL_BUILD}">
      <section class="sr-hero">
        <div class="sr-hero__media" aria-hidden="true"></div>
        <div class="sr-hero__veil" aria-hidden="true"></div>
        <div class="sr-shell sr-hero__grid">
          <section class="sr-copy">
            <div class="sr-pill">PRIVATE SIGIL ACCESS</div>
            <p class="sr-eyebrow">Single-page Renewal Flow</p>
            <h1><span class="sr-copy__white">ต่ออายุสิทธิ์</span><span class="sr-copy__gold">MMD SĪGIL</span></h1>
            <p class="sr-lead">กรอกข้อมูลเท่าที่จำได้ก่อนครับ เดี๋ยวระบบจะเช็กสถานะสมาชิกให้ก่อน แล้วค่อยสรุปทางต่อ ชำระเงิน และส่งเข้า renewal intake ตัวเดียวจบ</p>

            <div class="sr-mode-grid">
              <button type="button" class="mmd-choice sr-mode-card active" data-action="VIP_RENEWAL">
                <strong>Renew Membership</strong>
                <span>เช็กสถานะเดิมก่อน แล้วต่ออายุใน flow เดียว</span>
              </button>
              <button type="button" class="mmd-choice sr-mode-card" data-action="PER_REVIEW">
                <strong>Per Review</strong>
                <span>ถ้าต้องการให้ทีมอ่านเคสและ points ประกอบก่อน</span>
              </button>
            </div>
          </section>

          <aside class="mmd-hero-summary sr-summary">
            <div class="sr-summary__head">
              <div>
                <p class="sr-summary__eyebrow">Renewal Summary</p>
                <strong id="heroIdentity">รอข้อมูลจากคุณ</strong>
              </div>
              <div class="sr-summary__badge" id="heroPath">รอเช็กสถานะก่อน</div>
            </div>
            <div class="sr-summary__status">
              <span>สถานะล่าสุด</span>
              <strong id="heroStatus">รอให้ผมอ่านข้อมูลให้ก่อนครับ</strong>
            </div>
            <div class="sr-summary__rows">
              <div class="sr-summary__row"><span>ชื่อเล่น</span><strong id="sumNick">—</strong></div>
              <div class="sr-summary__row"><span>Email</span><strong id="sumEmail">—</strong></div>
              <div class="sr-summary__row"><span>Contact</span><strong id="sumContact">—</strong></div>
              <div class="sr-summary__row"><span>Proof</span><strong id="sumProof">ไม่มี</strong></div>
              <div class="sr-summary__row"><span>Payment Path</span><strong id="sumPay">Points / Per Review</strong></div>
            </div>
            <div class="sr-summary__footer">
              <span>Decision Layer</span>
              <strong id="sumStatus" data-status-kind="waiting">รอให้ผมอ่านข้อมูลให้ก่อนครับ</strong>
            </div>
          </aside>
        </div>
      </section>

      <div class="sr-shell sr-stack">
        <section class="mmd-rule sr-rule">
          <div class="sr-rule__item"><strong>1.</strong><span>Identity → Status check → Summary/Decision → Payment → Intake</span></div>
          <div class="sr-rule__item"><strong>2.</strong><span>ใช้ API จริง <code>POST /member/api/renewal/status</code> และ <code>POST /member/api/renewal/intake</code> เท่านั้น</span></div>
          <div class="sr-rule__item"><strong>3.</strong><span>เมื่อผ่านแล้วจะวิ่งต่อ Airtable → promotion → links → Telegram ตาม production flow เดิม</span></div>
        </section>

        <section class="mmd-card sr-card">
          <div class="sr-card__head">
            <div>
              <p class="sr-card__eyebrow">Identity</p>
              <h2>ข้อมูลสำหรับเช็ก renewal</h2>
            </div>
            <button type="button" class="sr-soft-btn" id="checkBtn">เช็กสถานะเบื้องต้น</button>
          </div>

          <div class="sr-form-grid">
            <label class="sr-field">
              <span>ชื่อเล่นที่ใช้เรียก</span>
              <input id="nick" type="text" placeholder="เช่น Ken / Mew" />
            </label>
            <label class="sr-field">
              <span>Email ปัจจุบัน</span>
              <input id="emailNow" type="email" placeholder="name@example.com" />
            </label>
            <label class="sr-field">
              <span>Email เดิม (ถ้ามี)</span>
              <input id="emailOld" type="email" placeholder="old@example.com" />
            </label>
            <label class="sr-field">
              <span>เบอร์โทร</span>
              <input id="phone" type="tel" placeholder="08x-xxx-xxxx" />
            </label>
            <label class="sr-field">
              <span>Telegram Username</span>
              <input id="telegram" type="text" placeholder="@username" />
            </label>
            <label class="sr-field sr-field--file">
              <span>หลักฐานเดิม / สลิป / รูปเก่า</span>
              <input id="oldProof" type="file" accept="image/*" />
            </label>
            <label class="sr-field sr-field--full">
              <span>บริบทเพิ่มเติมสำหรับทีม</span>
              <textarea id="context" rows="4" placeholder="เช่น จำ package เดิมไม่ได้, เคยใช้ email เก่า, อยากต่อ VIP, มี points ค้าง ฯลฯ"></textarea>
            </label>
          </div>
        </section>

        <section class="mmd-card sr-card">
          <div class="sr-card__head">
            <div>
              <p class="sr-card__eyebrow">Payment</p>
              <h2>วิธีชำระเงินที่ต้องการ</h2>
            </div>
          </div>

          <div class="sr-pay-grid">
            <button type="button" class="mmd-pay sr-pay-card active" data-pay="Points / Per Review">
              <strong>Points / Per Review</strong>
              <span>ใช้เมื่อทีมต้องดู points หรือเคส renewal เพิ่มก่อน</span>
            </button>
            <button type="button" class="mmd-pay sr-pay-card" data-pay="Top up Points">
              <strong>Top up Points</strong>
              <span>ใช้เมื่อ points ยังไม่พอและต้องเติมเฉพาะส่วนที่ขาด</span>
            </button>
            <button type="button" class="mmd-pay sr-pay-card" data-pay="Bank Transfer">
              <strong>Bank Transfer</strong>
              <span>แนบหลักฐานแล้วส่งเข้า intake เพื่อให้ทีมตามต่อใน flow เดียว</span>
            </button>
          </div>

          <div class="sr-consent">
            <label>
              <input id="consent" type="checkbox" />
              <span>ยืนยันให้ระบบเช็กสถานะและส่ง renewal intake เข้าระบบต่อให้</span>
            </label>
          </div>

          <div class="sr-submit">
            <button type="button" class="sr-primary-btn" id="submitBtn">ยืนยันและส่ง renewal</button>
            <p>หน้าต่ออายุนี้จะใช้ source_page = <code>sigil_inme_renewal</code> และคง payload contract เดิมที่ผ่าน production อยู่แล้ว</p>
          </div>
        </section>
      </div>
    </main>

    <script src="${SIGIL_RENEWAL_ASSET_BASE_URL}${INME_RENEWAL_SCRIPT_PATH}" defer></script>
  </body>
</html>`;

function htmlHeaders(page: string): Headers {
  return new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-mmd-worker": "immigrate-worker",
    "x-mmd-page": page,
  });
}

export function isSigilRenewalPageRoute(pathname: string): boolean {
  return pathname === SIGIL_RENEWAL_PAGE_PATH || pathname === `${SIGIL_RENEWAL_PAGE_PATH}/`
    || pathname === SIGIL_RENEWAL_ALIAS_PATH || pathname === `${SIGIL_RENEWAL_ALIAS_PATH}/`;
}

export function isSigilRenewalAssetRoute(pathname: string): boolean {
  return pathname === SIGIL_RENEWAL_CSS_PATH || pathname === INME_RENEWAL_SCRIPT_PATH;
}

export async function handleSigilRenewalAssetRoute(request: Request, env: Env): Promise<Response | null> {
  if (!isSigilRenewalAssetRoute(new URL(request.url).pathname)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
  if (!env.ASSETS) {
    return new Response("Asset binding unavailable", {
      status: 503,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const assetResponse = await env.ASSETS.fetch(request);
  const headers = new Headers(assetResponse.headers);
  headers.set("cache-control", "public, max-age=300");
  if (new URL(request.url).pathname.endsWith(".css")) {
    headers.set("content-type", "text/css; charset=utf-8");
  } else {
    headers.set("content-type", "application/javascript; charset=utf-8");
  }
  return new Response(request.method === "HEAD" ? null : assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}

export function maybeRedirectLegacySigilRenew(request: Request): Response | null {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname !== SIGIL_RENEW_LEGACY_PATH && pathname !== `${SIGIL_RENEW_LEGACY_PATH}/`) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const target = new URL(request.url);
  target.pathname = SIGIL_RENEWAL_PAGE_PATH;
  return redirect(target.toString(), 302);
}

export function renderSigilRenewalPage(request: Request): Response {
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: htmlHeaders("sigil-renewal") });
  }
  return new Response(SIGIL_RENEWAL_HTML, {
    status: 200,
    headers: htmlHeaders("sigil-renewal"),
  });
}
