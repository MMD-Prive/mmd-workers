import worker from "./admin-model-line-link-worker.js";
import { listPendingModelLineClaims } from "./model-line-link-review.js";

const DASHBOARD_PATH = "/v1/admin/dashboard";
const MODEL_LINK_HREF = "/internal/admin/kenji?view=model-link";

export function projectModelLineLinkSummary(result) {
  if (!result || result.ok !== true) {
    return {
      available: false,
      waiting: null,
      conflicts: null,
      href: MODEL_LINK_HREF,
    };
  }

  const items = Array.isArray(result.items) ? result.items : [];
  const count = Number(result.count);
  return {
    available: true,
    waiting: Number.isFinite(count) ? Math.max(0, count) : items.length,
    conflicts: items.filter((item) => String(item?.claim_status || "").toLowerCase() === "conflict").length,
    href: MODEL_LINK_HREF,
  };
}

export function augmentDashboardWithModelLineLinks(payload, summary) {
  const next = payload && typeof payload === "object" ? { ...payload } : {};
  const modelLink = summary || projectModelLineLinkSummary(null);

  next.model_line_link = modelLink;
  next.counts = {
    ...(next.counts && typeof next.counts === "object" ? next.counts : {}),
    model_line_links_pending: modelLink.available ? modelLink.waiting : null,
    model_line_links_conflict: modelLink.available ? modelLink.conflicts : null,
  };
  next.status = {
    ...(next.status && typeof next.status === "object" ? next.status : {}),
    model_line_links: modelLink.available ? "พร้อม" : "ยังยืนยันไม่ได้",
  };
  next.debug = {
    ...(next.debug && typeof next.debug === "object" ? next.debug : {}),
    model_line_link_source: modelLink.available ? "owner_review_queue" : "unavailable",
  };

  const waiting = modelLink.available ? Number(modelLink.waiting || 0) : 0;
  if (waiting > 0) {
    const todos = Array.isArray(next.todos) ? [...next.todos] : [];
    const alreadyPresent = todos.some((item) => item?.href === MODEL_LINK_HREF);
    if (!alreadyPresent && todos.length < 4) {
      todos.push({
        title: "ตรวจ MMD MODEL LINE Link",
        text: `มี Model ${waiting} รายการที่ยืนยัน LINE แล้วและกำลังรอเปอร์เลือก canonical Model record + Drive folder`,
        href: MODEL_LINK_HREF,
        icon: "M",
        tag: modelLink.conflicts ? "MMD MODEL · CONFLICT" : "MMD MODEL",
        color: modelLink.conflicts ? "red" : "gold",
      });
      next.todos = todos;
    }

    if (!next.focus || next.focus.title === "ยังไม่มีเรื่องด่วน") {
      next.focus = {
        title: modelLink.conflicts ? "ตรวจ MMD MODEL LINE conflict" : "มี MMD MODEL รอผูก LINE",
        text: modelLink.conflicts
          ? `มี ${modelLink.conflicts} เคส conflict และรวม ${waiting} เคสที่ต้องให้เปอร์ตรวจด้วยตัวเองก่อน LINK`
          : `มี Model ${waiting} รายการที่ยืนยัน LINE แล้ว รอเปอร์เลือก Model record และตรวจ Drive folder ก่อน LINK`,
        href: MODEL_LINK_HREF,
      };
    }
  }

  return next;
}

export default {
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

    if (request.method.toUpperCase() !== "GET" || path !== DASHBOARD_PATH || response.status !== 200) {
      return response;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) return response;

    let payload;
    try {
      payload = await response.clone().json();
    } catch (_error) {
      return response;
    }
    if (!payload || payload.ok !== true) return response;

    let queueResult;
    try {
      queueResult = await listPendingModelLineClaims(env);
    } catch (_error) {
      queueResult = null;
    }

    const next = augmentDashboardWithModelLineLinks(payload, projectModelLineLinkSummary(queueResult));
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");

    return new Response(JSON.stringify(next), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
