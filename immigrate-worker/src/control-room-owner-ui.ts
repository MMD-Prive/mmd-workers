// Owner Control Room stable entrypoint.
// Keep the synchronous v3 renderer contract used by the existing tests/runtime.
// Protocol Center is served under /internal/admin/control-room/protocol.
// Canonical MMS admin route: /internal/admin/mms.
// Canonical historical slip recovery route: /internal/admin/payments/historical-backfill.
import { renderOwnerControlRoomV3Page } from "./control-room-owner-ui-v3";

const LEGACY_MMS_CONTROL_ROOM_ROUTE = "/male-massage/therapists/login";
const CANONICAL_MMS_CONTROL_ROOM_ROUTE = "/internal/admin/mms";
const HISTORICAL_SLIP_BACKFILL_ROUTE = "/internal/admin/payments/historical-backfill";

const ADMIN_DASHBOARD_CARD = `<a class="cr3__app" href="/internal/admin/dashboard"><small>Dashboard</small><h4>Admin Dashboard</h4><p>ภาพรวม admin legacy surface ที่ยังใช้อ้างอิงได้</p><b>เปิด Dashboard →</b></a>`;

const HISTORICAL_SLIP_BACKFILL_CARD = `<a class="cr3__app cr3__app--prime" href="${HISTORICAL_SLIP_BACKFILL_ROUTE}"><small>Payments / Slip Evidence</small><h4>Historical Slip Backfill</h4><p>LINE Album / archive → SHA-256 dedupe → QR/OCR → match context → Payment Proof pending → review</p><b>เปิด Slip Backfill →</b></a>`;

function applyControlRoomCanonicalPatches(html: string): string {
  let canonicalHtml = html
    .split(LEGACY_MMS_CONTROL_ROOM_ROUTE)
    .join(CANONICAL_MMS_CONTROL_ROOM_ROUTE);

  if (!canonicalHtml.includes(HISTORICAL_SLIP_BACKFILL_ROUTE)) {
    canonicalHtml = canonicalHtml.replace(
      ADMIN_DASHBOARD_CARD,
      `${ADMIN_DASHBOARD_CARD}${HISTORICAL_SLIP_BACKFILL_CARD}`,
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
  headers.set("x-mmd-control-room-mms-route", CANONICAL_MMS_CONTROL_ROOM_ROUTE);
  headers.set("x-mmd-control-room-slip-backfill-route", HISTORICAL_SLIP_BACKFILL_ROUTE);

  return new Response(source.body.pipeThrough(rewrite), {
    status: source.status,
    statusText: source.statusText,
    headers,
  });
}
