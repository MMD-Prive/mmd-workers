/**
 * Read-only release evidence inside the authenticated, fixture-only Admin Console.
 * Snapshot is deliberately NOT represented as live Cloudflare state.
 * No API tokens, owner email, customer data, session IDs, or write controls.
 */
export const STAGING_RELEASE_SNAPSHOT = Object.freeze({
  observedOn: "2026-11-09",
  worker: "mmd-admin-console-3143-staging",
  sourceSha: "217a23730c4c70a7f2cb68e550bf7a74227ae424",
  activeVersion: "6ee6eee7-235c-478e-bd12-3dbda2b3519c",
  activeDeployment: "e83168cd-a3e1-4b10-b993-44e04b02c451",
  ownerAccess: "configured",
  workersDev: "enabled",
  stagingFixDeployment: "unverified",
  smoke: "pending",
});

const RELEASE_PANEL = [
  '<details id="ac-staging-release-status" class="ac-staging-release" aria-labelledby="ac-staging-release-heading">',
  ' <summary id="ac-staging-release-heading" class="ac-staging-release__summary">',
  '  <span class="ac-staging-release__intro"><span class="ac-staging-release__eyebrow">OWNER OPERATIONS · RELEASE &amp; SECURITY</span>',
  '   <strong>Cloudflare Staging · Admin Console #3143</strong></span>',
  '  <span class="ac-staging-release__state">รอพิสูจน์ Security / Smoke</span>',
  ' </summary>',
  ' <div class="ac-staging-release__body">',
  '  <p><strong>ข้อมูล ณ 9 พฤศจิกายน 2569</strong> · เป็นบันทึกผลตรวจ ไม่ใช่สถานะเรียลไทม์ และไม่ใช่หลักฐานว่าผ่าน E2E</p>',
  '  <dl class="ac-staging-release__grid">',
  '   <div><dt>PR #3150 / #3152</dt><dd>Merge แล้ว · Security CI ของ #3152 ผ่าน</dd></div>',
  '   <div><dt>Cloudflare workers.dev</dt><dd>พบว่าเปิดอยู่ ณ เวลาตรวจ (ไม่ใช่การอนุมัติให้ใช้งาน Production)</dd></div>',
  '   <div><dt>Cloudflare Access</dt><dd>มี Policy ผูก Worker ID เฉพาะ Owner</dd></div>',
  '   <div><dt>Secret Bindings</dt><dd>พบ 2 ชื่อ · ยังยืนยันการหมุนค่าแยก Production ไม่ได้</dd></div>',
  `   <div><dt>Source SHA · ฟอร์ม #3143</dt><dd><code>${STAGING_RELEASE_SNAPSHOT.sourceSha}</code></dd></div>`,
  `<div><dt>Active Worker Version</dt><dd><code>${STAGING_RELEASE_SNAPSHOT.activeVersion}</code></dd></div>`,
  `<div><dt>Active Deployment ID</dt><dd><code>${STAGING_RELEASE_SNAPSHOT.activeDeployment}</code></dd></div>`,
  '   <div><dt>Deployed Security Fix</dt><dd>ยังไม่ยืนยัน · Bundle ที่อ่านได้ยังมี protect() รุ่น #3150</dd></div>',
  '   <div><dt>Cloudflare Browser E2E</dt><dd>ยังไม่มีผลครบชุด Owner Login / Create Job / Per Rename / Filters / Gallery / Form State / Logout / Blocked Writes</dd></div>',
  '   <div><dt>Local Smoke · #3150</dt><dd>Chromium ผ่านด้วยบัญชีและข้อมูลทดสอบ · แยกจากผลบน Cloudflare</dd></div>',
  '   <div><dt>PostHog · Webflow Staging</dt><dd>ตรวจ event ที่ปลายทางบน mmdprive.webflow.io วันที่ 9 พ.ย. 2569 · Public 3 ครั้ง ได้ mmd_web_loaded และ pageview อย่างละ 3 · Internal 2 หน้าที่ทดสอบไม่พบ event ตรง URL · หลัง 17:38 น. จนถึงเวลาตรวจไม่พบ event ที่ระบุ URL ของ /internal หรือเส้นทางย่อยบนโฮสต์นี้</dd></div>',
  '   <div><dt>Production</dt><dd>รายงานนี้ไม่ได้อนุญาตการ Deploy หรือเปลี่ยน Routes ของ Production</dd></div>',
  '  </dl>',
  '  <p class="ac-staging-release__next"><strong>Release Gate:</strong> ยืนยัน Secret Rotation → ตรวจ Bundle #3152 → ทดสอบ Cloudflare-hosted E2E/Smoke → บันทึกหลักฐานและผล Rollback</p>',
  '  <nav class="ac-staging-release__links" aria-label="หลักฐานการตรวจ Staging">',
  '   <a target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" href="https://github.com/MMD-Prive/mmd-workers/pull/3150">PR #3150</a>',
  '   <a target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" href="https://github.com/MMD-Prive/mmd-workers/pull/3152">PR #3152</a>',
  '   <a target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" href="https://github.com/MMD-Prive/mmd-workers/pull/3158/checks">PR #3158 · CI</a>',
  '   <a target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" href="https://app.notion.com/p/411d2496ab9881baa5e6d214c147e0b8?pvs=204">ผลตรวจ PostHog · Webflow Staging</a>',
  '   <a target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" href="https://github.com/MMD-Prive/mmd-workers/blob/bf9999f2f92180260dccf222af14c9c129609271/admin-console-staging/README.md">Release Gate / Rollback</a>',
  '  </nav>',
  '  <p class="ac-staging-release__footnote">หน้า Staging ใช้ Fixture และเปิด Create Job / Payments แบบจำกัด; เมนู Admin อื่นใน Console ไม่ได้แปลว่า Staging ให้บริการครบทุกเครื่องมือ</p>',
  ' </div>',
  '</details>',
].join("\n");

const RELEASE_STYLE = [
  ".ac-staging-release{margin:10px 0 16px;border:1px solid #d6c8b7;border-radius:13px;background:#fcfaf6;color:#282a2b;overflow:hidden;max-width:100%;}",
  ".ac-staging-release__summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;cursor:pointer;list-style-position:inside;}",
  ".ac-staging-release__intro{display:grid;gap:3px;min-width:0;font-size:13px;line-height:1.45;}",
  ".ac-staging-release__intro strong{font-weight:650;font-size:14px;}",
  ".ac-staging-release__eyebrow{font-size:10px;letter-spacing:.06em;color:#735f49;}",
  ".ac-staging-release__state{font-size:11px;color:#714a23;font-weight:600;background:#f7e9d7;border-radius:20px;padding:5px 9px;white-space:nowrap;}",
  ".ac-staging-release__body{padding:2px 14px 13px;font-size:12px;line-height:1.65;border-top:1px solid #e9e0d7;}",
  ".ac-staging-release__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:20px;row-gap:9px;margin:10px 0;}",
  ".ac-staging-release__grid>div{min-width:0;border-bottom:1px solid #ece5db;padding-bottom:6px;}",
  ".ac-staging-release__grid dt{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#786957;}",
  ".ac-staging-release__grid dd{margin:2px 0 0;overflow-wrap:anywhere;}",
  ".ac-staging-release__grid code{font-size:11px;overflow-wrap:anywhere;}",
  ".ac-staging-release__next{border-left:3px solid #b78f58;padding:6px 9px;margin:12px 0;background:#f7f1e9;}",
  ".ac-staging-release__links{display:flex;flex-wrap:wrap;gap:8px 15px;}",
  ".ac-staging-release__links a{color:#68482f;text-decoration:underline;text-underline-offset:3px;font-weight:650;}",
  ".ac-staging-release__footnote{color:#6d6963;font-size:11px;margin-bottom:0;}",
  "@media(max-width:640px){.ac-staging-release__summary{align-items:flex-start;flex-direction:column;gap:8px}.ac-staging-release__grid{grid-template-columns:minmax(0,1fr)}}",
].join("\n");

/**
 * Inject only into the authenticated Console shell and into its nonce-bearing
 * existing style tag; no additional script, external request, or new route.
 */
export function renderStagingReleasePanel(html) {
  if (typeof html !== "string") return html;
  const home = /<div id="ac-home"[^>]*>/;
  const style = /<style id="sigil-internal-silver-v1"[^>]*>/;
  if (!home.test(html) || !style.test(html) || html.includes('id="ac-staging-release-status"')) return html;
  return html.replace(home, match => match + RELEASE_PANEL)
    .replace(style, match => match + RELEASE_STYLE);
}
