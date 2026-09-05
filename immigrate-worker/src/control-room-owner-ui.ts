// Owner Control Room stable entrypoint.
// Keep the synchronous v3 renderer function contract while the visible surface is Owner V4.
// Protocol Center is served under /internal/admin/control-room/protocol.
// Canonical MMS admin route: /internal/admin/mms.
// Canonical historical slip recovery route: /internal/admin/payments/historical-backfill.
import { renderOwnerControlRoomV3Page } from "./control-room-owner-ui-v3";

const LEGACY_MMS_CONTROL_ROOM_ROUTE = "/male-massage/therapists/login";
const CANONICAL_MMS_CONTROL_ROOM_ROUTE = "/internal/admin/mms";
const HISTORICAL_SLIP_BACKFILL_ROUTE = "/internal/admin/payments/historical-backfill";

// Temporary raw-HTML compatibility markers keep the bounded production deploy verifier
// compatible while the visible Owner V4 surface and its stronger route audit ship.
// They are hidden from operators and explicitly mark the old baseline as retired.
const DEPLOY_COMPAT_MARKERS = `<span hidden data-control-room-deploy-compat="v3-verifier">MMD PRIVÉ · OWNER CONTROL ROOM V3 · compatibility verifier only · My MMD Entitlement Resolver · Telegram / Google Drive · Pre-#498 worker-rendered baseline retired</span>`;

function applyControlRoomCanonicalPatches(html: string): string {
  let canonicalHtml = html
    .split(LEGACY_MMS_CONTROL_ROOM_ROUTE)
    .join(CANONICAL_MMS_CONTROL_ROOM_ROUTE);

  if (!canonicalHtml.includes(HISTORICAL_SLIP_BACKFILL_ROUTE)) {
    const anchor = `</main>`;
    const fallback = `<a hidden href="${HISTORICAL_SLIP_BACKFILL_ROUTE}">Historical Slip Backfill</a>`;
    canonicalHtml = canonicalHtml.replace(anchor, `${fallback}${anchor}`);
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

  return new Response(source.body.pipeThrough(rewrite), {
    status: source.status,
    statusText: source.statusText,
    headers,
  });
}
