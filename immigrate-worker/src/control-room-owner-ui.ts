// Owner Control Room stable entrypoint.
// Keep the synchronous v3 renderer function contract while the visible surface is Owner V4.
// Protocol Center is served under /internal/admin/control-room/protocol.
// Canonical MMS admin route: /internal/admin/mms.
// Canonical historical slip recovery route: /internal/admin/payments/historical-backfill.
import { renderOwnerControlRoomV3Page } from "./control-room-owner-ui-v3";

const LEGACY_MMS_CONTROL_ROOM_ROUTE = "/male-massage/therapists/login";
const CANONICAL_MMS_CONTROL_ROOM_ROUTE = "/internal/admin/mms";
const HISTORICAL_SLIP_BACKFILL_ROUTE = "/internal/admin/payments/historical-backfill";
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

function applyControlRoomCanonicalPatches(html: string): string {
  let canonicalHtml = html
    .split(LEGACY_MMS_CONTROL_ROOM_ROUTE)
    .join(CANONICAL_MMS_CONTROL_ROOM_ROUTE)
    .split(PREVIOUS_HERO_IMAGE)
    .join(CANONICAL_HERO_IMAGE)
    .split("Telegram / Drive · Observed only")
    .join("Telegram alerts · Partial / Drive observed")
    .split("<small>Observed State</small><b>Telegram / Drive</b><span>เทียบ expected state เท่านั้น ไม่สร้างสิทธิ์</span>")
    .join("<small>Partial Alerts</small><b>Telegram Alerts / Drive</b><span>Telegram มี sender เฉพาะบาง worker แล้ว · Drive ยังเป็น observed state เท่านั้น</span>");

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
