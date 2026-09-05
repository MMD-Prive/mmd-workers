// Owner Control Room stable entrypoint.
// Keep the synchronous v3 renderer contract used by the existing tests/runtime.
// Protocol Center is served under /internal/admin/control-room/protocol.
// Canonical MMS admin route: /internal/admin/mms.
import { renderOwnerControlRoomV3Page } from "./control-room-owner-ui-v3";

const LEGACY_MMS_CONTROL_ROOM_ROUTE = "/male-massage/therapists/login";
const CANONICAL_MMS_CONTROL_ROOM_ROUTE = "/internal/admin/mms";

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
      const canonicalHtml = html
        .split(LEGACY_MMS_CONTROL_ROOM_ROUTE)
        .join(CANONICAL_MMS_CONTROL_ROOM_ROUTE);
      controller.enqueue(new TextEncoder().encode(canonicalHtml));
    },
  });

  const headers = new Headers(source.headers);
  headers.delete("content-length");
  headers.set("x-mmd-control-room-mms-route", CANONICAL_MMS_CONTROL_ROOM_ROUTE);

  return new Response(source.body.pipeThrough(rewrite), {
    status: source.status,
    statusText: source.statusText,
    headers,
  });
}
