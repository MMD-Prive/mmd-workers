import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { i as apiGet, s as isPreviewRuntime, t as ApiError } from "./client-DnJZI2KL.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/LiveState-B_hGkOGT.js
var import_jsx_runtime = require_jsx_runtime();
/**
* Shared read helpers for backend list responses whose item shape is owned by
* the Worker. Nothing is inferred: we only surface scalar fields the backend
* returned, and we drop keys that could leak private storage/contact detail.
*/
/** Keys never rendered in operator UI (raw storage keys, raw contact ids, tokens). */
var HIDDEN = /(r2|object_key|storage_key|bucket|line_user_id|user_id_raw|token|secret|signature|password)/i;
function safeEntries(r) {
	const out = [];
	for (const [k, v] of Object.entries(r)) {
		if (HIDDEN.test(k)) continue;
		if (v === null || v === void 0 || v === "") continue;
		if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out.push([k, String(v)]);
	}
	return out;
}
function pick(r, keys) {
	for (const k of keys) {
		const v = r[k];
		if (typeof v === "string" && v) return v;
		if (typeof v === "number") return String(v);
	}
	return null;
}
function humanKey(k) {
	const s = k.replace(/[_.-]+/g, " ").trim();
	return s.charAt(0).toUpperCase() + s.slice(1);
}
function extractItems(raw) {
	const body = raw && typeof raw["data"] === "object" && raw["data"] !== null && !Array.isArray(raw["data"]) ? raw["data"] : raw;
	for (const key of [
		"items",
		"records",
		"results",
		"queue",
		"approvals"
	]) {
		const v = body?.[key] ?? raw?.[key];
		if (Array.isArray(v)) return v.filter((x) => !!x && typeof x === "object");
	}
	if (Array.isArray(raw?.["data"])) return raw["data"];
	return [];
}
/** GET a same-origin admin list. Preview returns labelled samples only. */
async function fetchList(path, demo, signal) {
	if (isPreviewRuntime()) return {
		authority: "demo",
		schema: "preview",
		items: demo
	};
	const raw = await apiGet(path, signal);
	if (raw && raw["ok"] === false) throw new Error("backend_not_ok");
	return {
		authority: "backend",
		schema: typeof raw?.["schema"] === "string" ? raw["schema"] : null,
		items: extractItems(raw)
	};
}
/** GET a same-origin admin object (overview-style). Scalar entries only. */
async function fetchObject(path, demo, signal) {
	if (isPreviewRuntime()) return {
		authority: "demo",
		data: demo
	};
	const raw = await apiGet(path, signal);
	if (raw && raw["ok"] === false) throw new Error("backend_not_ok");
	return {
		authority: "backend",
		data: (raw && typeof raw["data"] === "object" && raw["data"] !== null ? raw["data"] : raw) ?? {}
	};
}
/** Loading / auth / unavailable states. Never renders substitute data. */
function LiveState({ pending, error, children }) {
	if (pending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-[15px] text-muted-foreground",
		role: "status",
		children: "กำลังโหลดข้อมูลจริง…"
	});
	if (error) {
		const auth = error instanceof ApiError && (error.kind === "unauthorized" || error.kind === "forbidden");
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "rounded-2xl border border-destructive/40 bg-surface p-4",
			role: "alert",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "text-[16px] font-semibold",
				children: auth ? "ต้องเข้าสู่ระบบผู้ดูแลก่อน" : "ระบบหลังบ้านยังไม่พร้อม"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[15px] text-muted-foreground",
				children: "ไม่แสดงข้อมูลแทนของจริง"
			})]
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
/** Renders only backend-returned scalar fields; hides storage/contact keys. */
function RecordCard({ record, title, badge }) {
	const entries = safeEntries(record);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "min-w-0 rounded-xl border border-border bg-surface p-3",
		children: [(title || badge) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "mb-2 flex flex-wrap items-center gap-2",
			children: [title && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
				className: "min-w-0 break-words text-[15px] font-semibold",
				children: title
			}), badge && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "rounded-full border border-gold/40 px-2 py-0.5 font-mono text-[13px] text-muted-foreground",
				children: badge
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", {
			className: "grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2",
			children: entries.map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex min-w-0 gap-2 text-[13px]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
					className: "shrink-0 text-muted-foreground",
					children: humanKey(k)
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
					className: "min-w-0 break-words text-foreground",
					children: v
				})]
			}, k))
		})]
	});
}
//#endregion
export { humanKey as a, fetchObject as i, RecordCard as n, pick as o, fetchList as r, safeEntries as s, LiveState as t };
