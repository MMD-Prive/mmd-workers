import { renderOwnerControlRoomPage as renderLegacyOwnerControlRoomPage } from "./control-room-owner-ui-legacy";

const encoder = new TextEncoder();
const AI_OPS_SCRIPT = '<script src="/v1/admin/ai-ops/client.js?v=1" defer data-mmd-ai-ops="v1"></script>';

function canonicalizeOwnerControlRoom(html: string): string {
  return html
    .replaceAll("/internal/admin/jobs/create-session", "/internal/admin/jobs/create-job")
    .replaceAll("Create Session", "Create Job")
    .replaceAll("<span>SESSION</span>", "<span>JOB</span>")
    .replaceAll("เริ่ม session จาก canonical client", "เริ่ม Job จาก canonical client")
    .replaceAll("MMD PRIVÉ · OWNER CONTROL ROOM · 05 SEP 2026", "MMD PRIVÉ · OWNER CONTROL ROOM · 07 SEP 2026")
    .replace("</body>", `${AI_OPS_SCRIPT}</body>`);
}

export function renderOwnerControlRoomPage(): Response {
  const legacy = renderLegacyOwnerControlRoomPage();
  const headers = new Headers(legacy.headers);
  headers.delete("content-length");
  headers.set("x-mmd-control-room-operator-object", "job");
  headers.set("x-mmd-control-room-create-route", "/internal/admin/jobs/create-job");
  headers.set("x-mmd-ai-ops-layer", "v1");

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const html = await legacy.text();
        controller.enqueue(encoder.encode(canonicalizeOwnerControlRoom(html)));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(body, {
    status: legacy.status,
    statusText: legacy.statusText,
    headers,
  });
}
