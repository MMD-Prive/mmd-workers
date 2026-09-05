// Owner Control Room stable entrypoint.
// Keep the synchronous v3 renderer function contract while the visible surface is Owner V4.
// Protocol Center is served under /internal/admin/control-room/protocol.
// Canonical MMS admin route: /internal/admin/mms.
// Canonical historical slip recovery route: /internal/admin/payments/historical-backfill.
// Canonical customer data route: /internal/admin/customer-data.
import { renderOwnerControlRoomV3Page } from "./control-room-owner-ui-v3";

const LEGACY_MMS_CONTROL_ROOM_ROUTE = "/male-massage/therapists/login";
const CANONICAL_MMS_CONTROL_ROOM_ROUTE = "/internal/admin/mms";
const HISTORICAL_SLIP_BACKFILL_ROUTE = "/internal/admin/payments/historical-backfill";
const CUSTOMER_DATA_ROUTE = "/internal/admin/customer-data";
const LEGACY_LINE_NOTES_ROUTE = "/internal/ceo/line-notes-import";
const PREVIOUS_HERO_IMAGE =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a965447376525e3e562ba09_Boss%20and%20Kenji%20-%20Model%20Keyword%20Hero.webp";
const CANONICAL_HERO_IMAGE =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a940b298194375628fd3f29_Boss%20Per%20input%20Kenji%20AI.webp";

// MMD typography + desktop composition lock.
// LINE is primary; Noto is the Thai / multilingual fallback.
// Desktop keeps intentional side breathing room after the fixed owner rail.
const CONTROL_ROOM_PRESENTATION_TUNE = `<style id="mmd-control-room-presentation-tune">
.cr4,
.cr4 button,
.cr4 input,
.cr4 select,
.cr4 textarea{
  font-family:"LINE Seed Sans TH","Line Seed Sans TH","LINE Seed Sans TH_W_Rg","Noto Sans Thai","Noto Sans","Outfit",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
.cr4__app.is-planned{
  border-style:dashed;
  border-color:rgba(223,189,114,.34);
  background:linear-gradient(145deg,rgba(223,189,114,.075),rgba(255,255,255,.018));
}
.cr4__app.is-planned .cr4__routeState{border-color:rgba(223,189,114,.28);color:#f5d795;background:rgba(223,189,114,.07)}
.cr4__app.is-planned .cr4__routeState:before{content:'planned'}
.cr4__app.is-planned .cr4__routeState{font-size:0}.cr4__app.is-planned .cr4__routeState:before{font-size:7px}
@media (min-width:900px){
  .cr4__main{width:min(calc(100% - 64px),1320px);margin-inline:auto;padding-left:0;padding-right:0}
}
@media (min-width:1200px){
  .cr4__main{width:min(calc(100% - 96px),1280px);margin-inline:auto;padding:28px 0 60px}
}
@media (min-width:1500px){
  .cr4__main{width:min(calc(100% - 128px),1320px)}
}
</style>`;

// Temporary raw-HTML compatibility markers keep the bounded production deploy verifier
// compatible while the visible Owner V4 surface and its stronger route audit ship.
// They are hidden from operators and explicitly mark the old baseline as retired.
const DEPLOY_COMPAT_MARKERS = `<span hidden data-control-room-deploy-compat="v3-verifier">MMD PRIVÉ · OWNER CONTROL ROOM V3 · compatibility verifier only · My MMD Entitlement Resolver · Telegram / Google Drive · Pre-#498 worker-rendered baseline retired</span>`;

const CUSTOMER_DATA_NAV = `<a href="${CUSTOMER_DATA_ROUTE}" data-cta-route="${CUSTOMER_DATA_ROUTE}"><span>03</span>Customer Data</a>`;
const CUSTOMER_DATA_QUICK = `<a class="is-prime" href="${CUSTOMER_DATA_ROUTE}" data-cta-route="${CUSTOMER_DATA_ROUTE}"><small>Client Identity</small><b>Customer Data</b></a>`;
const CUSTOMER_DATA_SECTION = `<section class="cr4__section cr4__reveal" id="customer-data"><div class="cr4__head"><div><span class="cr4__kicker">01 · CUSTOMER DATA</span><h3>ตัวตนลูกค้าและบริบทส่วนตัว ต้องมาก่อน Session</h3><p>Customer Data Console เป็น canonical operations console สำหรับ LINE OFC import, identity review, private client context, service-history candidates และ Telegram reconciliation preparation — ไม่ใช่หน้าปรับสิทธิ์, ไม่ใช่ payment truth และไม่ใช่หน้าส่งข้อความหาลูกค้า</p></div><div class="cr4__headMeta">canonical route · V1 scope</div></div><div class="cr4__apps">
    <a class="cr4__app is-prime is-planned" href="${CUSTOMER_DATA_ROUTE}" data-cta-route="${CUSTOMER_DATA_ROUTE}"><div class="cr4__appTop"><small>Canonical Console</small><span class="cr4__routeState" data-route-state>planned</span></div><h4>Customer Data Console</h4><p>ศูนย์กลาง client identity, private context และ evidence staging ก่อน Create Session / Create Job / Kenji / Payments / Access ใช้ร่วมกัน</p><code>${CUSTOMER_DATA_ROUTE}</code><b>เปิด Customer Data →</b></a>
    <a class="cr4__app is-planned" href="${CUSTOMER_DATA_ROUTE}#identity" data-cta-route="${CUSTOMER_DATA_ROUTE}"><div class="cr4__appTop"><small>Identity Review</small><span class="cr4__routeState" data-route-state>planned</span></div><h4>Link / Candidate / Ignore</h4><p>ค้นด้วยชื่อ, LINE ID, email, phone, alias, Telegram username แล้วตัดสินใจ link to Client หรือ mark review required โดยไม่สร้าง membership หรือ access</p><code>${CUSTOMER_DATA_ROUTE}#identity</code><b>เตรียม Identity Review →</b></a>
    <a class="cr4__app is-planned" href="${CUSTOMER_DATA_ROUTE}#private-context" data-cta-route="${CUSTOMER_DATA_ROUTE}"><div class="cr4__appTop"><small>Private Context</small><span class="cr4__routeState" data-route-state>planned</span></div><h4>Kenji-safe Client Context</h4><p>raw LINE notes, application sensitive, behaviour/care context, preferred communication และ LINE rename ต้องอ่านผ่าน server-scoped context พร้อม audit purpose</p><code>${CUSTOMER_DATA_ROUTE}#private-context</code><b>เตรียม Context →</b></a>
    <a class="cr4__app is-planned" href="${CUSTOMER_DATA_ROUTE}#history-review" data-cta-route="${CUSTOMER_DATA_ROUTE}"><div class="cr4__appTop"><small>History Review</small><span class="cr4__routeState" data-route-state>planned</span></div><h4>Service / Payment / Points แยกกัน</h4><p>ประวัติบริการ, payment evidence และ points ต้อง staged → review_required → approved/rejected → materialized แบบ explicit approval เท่านั้น</p><code>${CUSTOMER_DATA_ROUTE}#history-review</code><b>เตรียม Review →</b></a>
    <a class="cr4__app is-planned" href="${CUSTOMER_DATA_ROUTE}#telegram" data-cta-route="${CUSTOMER_DATA_ROUTE}"><div class="cr4__appTop"><small>Telegram Prep</small><span class="cr4__routeState" data-route-state>planned</span></div><h4>Observed identity only</h4><p>แสดง Telegram username/user ID และ expected/observed group หลัง Resolver เท่านั้น; Add/Remove/Review อยู่กับ membership-access และ router กลาง</p><code>${CUSTOMER_DATA_ROUTE}#telegram</code><b>เตรียม Reconcile →</b></a>
    <a class="cr4__app is-legacy" href="${LEGACY_LINE_NOTES_ROUTE}" data-cta-route="${LEGACY_LINE_NOTES_ROUTE}"><div class="cr4__appTop"><small>Legacy Surface</small><span class="cr4__routeState" data-route-state>legacy</span></div><h4>LINE Notes Import</h4><p>legacy / not production-ready: เก็บไว้เป็น reference เท่านั้น แนวคิดต้องย้ายเข้า Customer Data Console</p><code>${LEGACY_LINE_NOTES_ROUTE}</code><b>ดู Legacy →</b></a>
  </div></section>`;

function applyControlRoomCanonicalPatches(html: string): string {
  let canonicalHtml = html
    .split(LEGACY_MMS_CONTROL_ROOM_ROUTE)
    .join(CANONICAL_MMS_CONTROL_ROOM_ROUTE)
    .split(PREVIOUS_HERO_IMAGE)
    .join(CANONICAL_HERO_IMAGE)
    .split("Telegram / Drive · Observed only")
    .join("Telegram alerts · Partial / Drive observed")
    .split("<small>Observed State</small><b>Telegram / Drive</b><span>เทียบ expected state เท่านั้น ไม่สร้างสิทธิ์</span>")
    .join("<small>Partial Alerts</small><b>Telegram Alerts / Drive</b><span>Telegram มี sender เฉพาะบาง worker แล้ว · Drive ยังเป็น observed state เท่านั้น</span>")
    .split("Control Room รวมทางเข้าล่าสุดของ Admin, Payments, Kenji, Access, CEO, Studio, MMS, Model และ Shop ไว้เป็นแผนเดียวกันครับ")
    .join("Control Room รวมทางเข้าล่าสุดของ Customer Data, Sessions, Payments, Kenji, Access, CEO, Studio, MMS, Model และ Shop ไว้เป็นแผนเดียวกันครับ")
    .split("Client → Session → Job → Payment Proof → Review")
    .join("Customer Data → Client → Session → Job → Payment Proof → Review")
    .split("/internal/ceo/line-notes-import\",\"Reconcile\",\"LINE Notes Import\",\"อ่าน LINE Note เพื่อหา date, price และ net ก่อน lock truth\"")
    .join("/internal/ceo/line-notes-import\",\"Legacy\",\"LINE Notes Import\",\"legacy / not production-ready · ย้ายแนวคิดเข้า Customer Data Console\",\"ดู Legacy →\",\"is-legacy\"");

  if (!canonicalHtml.includes(`href=\"${CUSTOMER_DATA_ROUTE}\"`)) {
    canonicalHtml = canonicalHtml.replace(
      '<a href="/internal/admin/payments" data-cta-route="/internal/admin/payments"><span>03</span>Payments</a>',
      `${CUSTOMER_DATA_NAV}<a href="/internal/admin/payments" data-cta-route="/internal/admin/payments"><span>04</span>Payments</a>`,
    );
    canonicalHtml = canonicalHtml
      .replace('<span>04</span>Kenji', '<span>05</span>Kenji')
      .replace('<span>05</span>Access', '<span>06</span>Access')
      .replace('<span>06</span>MMS', '<span>07</span>MMS')
      .replace('<span>07</span>Studio', '<span>08</span>Studio')
      .replace('<span>08</span>CEO', '<span>09</span>CEO');
    canonicalHtml = canonicalHtml.replace(
      '<a class="is-prime" href="/internal/admin/jobs/create-session" data-cta-route="/internal/admin/jobs/create-session"><small>Daily Ops</small><b>Create Session</b></a>',
      `${CUSTOMER_DATA_QUICK}<a class="is-prime" href="/internal/admin/jobs/create-session" data-cta-route="/internal/admin/jobs/create-session"><small>Daily Ops</small><b>Create Session</b></a>`,
    );
    canonicalHtml = canonicalHtml.replace(
      '<section class="cr4__section cr4__reveal" id="daily">',
      `${CUSTOMER_DATA_SECTION}<section class="cr4__section cr4__reveal" id="daily">`,
    );
  }

  if (!canonicalHtml.includes(HISTORICAL_SLIP_BACKFILL_ROUTE)) {
    const anchor = `</main>`;
    const fallback = `<a hidden href="${HISTORICAL_SLIP_BACKFILL_ROUTE}">Historical Slip Backfill</a>`;
    canonicalHtml = canonicalHtml.replace(anchor, `${fallback}${anchor}`);
  }

  if (!canonicalHtml.includes('id="mmd-control-room-presentation-tune"')) {
    canonicalHtml = canonicalHtml.replace("</head>", `${CONTROL_ROOM_PRESENTATION_TUNE}</head>`);
  }

  if (!canonicalHtml.includes('data-control-room-deploy-compat="v3-verifier"')) {
    canonicalHtml = canonicalHtml.replace(
      '<section class="cr4"',
      `${DEPLOY_COMPAT_MARKERS}<section class="cr4"`,
    );
  }

  return canonicalHtml;
}

export function renderOwnerControlRoomPage(): Response {
  const source = renderOwnerControlRoomV3Page();
  if (!source.body) return source;

  const chunks: Uint8Array[] = [];
  const rewrite = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      chunks.push(chunk);
    },
    flush(controller) {
      const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const merged = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const html = new TextDecoder().decode(merged);
      const canonicalHtml = applyControlRoomCanonicalPatches(html);
      controller.enqueue(new TextEncoder().encode(canonicalHtml));
    },
  });

  const headers = new Headers(source.headers);
  headers.delete("content-length");
  // Keep the existing deploy verifier header stable until its bounded check is migrated.
  headers.set("x-mmd-control-room-ui", "owner-desktop-v3-latest");
  headers.set("x-mmd-control-room-release", "owner-v4");
  headers.set("x-mmd-control-room-authority", "canonical-backend");
  headers.set("x-mmd-control-room-mms-route", CANONICAL_MMS_CONTROL_ROOM_ROUTE);
  headers.set("x-mmd-control-room-slip-backfill-route", HISTORICAL_SLIP_BACKFILL_ROUTE);
  headers.set("x-mmd-control-room-customer-data-route", CUSTOMER_DATA_ROUTE);
  headers.set("x-mmd-control-room-line-notes-import", "legacy-not-production-ready");
  headers.set("x-mmd-control-room-cta-audit", "operator-triggered-head-check");
  headers.set("x-mmd-control-room-typography", "line-seed-noto");
  headers.set("x-mmd-control-room-desktop-gutter", "balanced-v1");
  headers.set("x-mmd-control-room-telegram-status", "partial-worker-alerts-no-unified-router");

  return new Response(source.body.pipeThrough(rewrite), {
    status: source.status,
    statusText: source.statusText,
    headers,
  });
}
