// Owner Control Room stable entrypoint.
// Keep v3 as the visual base and add the Protocol Center as a first-class operator module.
import { renderOwnerControlRoomV3Page } from "./control-room-owner-ui-v3";

export async function renderOwnerControlRoomPage(): Promise<Response> {
  const response = renderOwnerControlRoomV3Page();
  const html = await response.text();

  const navAnchor = '<a href="/member/kenji-ai-20?mode=admin-preview"><i>07</i>Kenji Preview</a>';
  const protocolNav = '<a href="/internal/admin/control-room/protocol"><i>PRO</i>Protocol</a>';
  const appAnchor = '<a class="cr3__app" href="/member/kenji-ai-20?mode=admin-preview">';
  const protocolApp = '<a class="cr3__app" href="/internal/admin/control-room/protocol"><small>Rule Management</small><h4>Protocol Center</h4><p>จัดการกฎกลางของ MMD แบบ operator-first: health, review, QA, publish queue และ audit โดยซ่อน API ไว้ใน technical details</p><b>เปิด Protocol Center →</b></a>';

  const nextHtml = html
    .replace(navAnchor, `${protocolNav}${navAnchor}`)
    .replace(appAnchor, `${protocolApp}${appAnchor}`);

  const headers = new Headers(response.headers);
  headers.set("x-mmd-control-room-protocol", "rule-management-v1");
  headers.set("cache-control", "no-store");
  return new Response(nextHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
