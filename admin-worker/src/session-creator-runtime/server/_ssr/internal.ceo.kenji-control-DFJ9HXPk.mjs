import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { x as isCanonicalRecordId } from "./provider-CvQy8AcV.mjs";
import { r as KENJI_ROOM_ITEMS } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as CanonPage } from "./CanonPage-FXlmFGAJ.mjs";
import { i as fetchObject, n as RecordCard, o as pick, r as fetchList, t as LiveState } from "./LiveState-B_hGkOGT.mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.ceo.kenji-control-DFJ9HXPk.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function KenjiControl() {
	const [input, setInput] = (0, import_react.useState)("");
	const [clientId, setClientId] = (0, import_react.useState)(null);
	const approvals = useQuery({
		queryKey: ["kenji-approvals"],
		queryFn: ({ signal }) => fetchList("/v1/admin/kenji/control/approvals?status=pending", [{
			approval_id: "ตัวอย่าง-1",
			kind: "draft_reply",
			status: "pending"
		}], signal),
		retry: false
	});
	const sel = clientId ? `client_id=${encodeURIComponent(clientId)}` : "";
	const convs = useQuery({
		queryKey: ["kenji-conv", clientId],
		enabled: !!clientId,
		queryFn: ({ signal }) => fetchList(`/v1/admin/kenji/control/conversations?${sel}`, [{
			state: "waiting_for_per",
			channel: "line_ofc"
		}], signal),
		retry: false
	});
	const memory = useQuery({
		queryKey: ["kenji-memory", clientId],
		enabled: !!clientId,
		queryFn: ({ signal }) => fetchObject(`/v1/admin/kenji/control/memory?${sel}`, {
			summary: "ตัวอย่างสรุป",
			source: "preview"
		}, signal),
		retry: false
	});
	const valid = isCanonicalRecordId(input.trim());
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CanonPage, {
		module: "เคนจิ AI",
		path: "/internal/ceo/kenji-control",
		title: "Kenji Control",
		intro: "มุมมองเจ้าของแบบอ่านอย่างเดียว · AI เป็นคำแนะนำ ไม่ใช่อำนาจยืนยัน · ไม่มีการส่งข้อความ อนุมัติ หรือ takeover จากหน้านี้",
		items: KENJI_ROOM_ITEMS,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "space-y-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[16px] font-semibold",
					children: "รออนุมัติ"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveState, {
					pending: approvals.isPending,
					error: approvals.error,
					children: (approvals.data?.items.length ?? 0) === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[15px] text-muted-foreground",
						children: "ไม่มีรายการรออนุมัติจากระบบหลังบ้าน"
					}) : approvals.data.items.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecordCard, {
						record: r,
						title: pick(r, ["title", "kind"]),
						badge: pick(r, ["status"])
					}, pick(r, ["approval_id", "id"]) ?? i))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "space-y-2 rounded-2xl border border-border bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[16px] font-semibold",
						children: "ลูกค้าที่ยืนยันตัวตนแล้ว"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-muted-foreground",
						children: "ใส่ Clients record (rec…) ที่ยืนยันแล้ว · ความจำและบทสนทนาจะแสดงหลังระบุตัวตนเท่านั้น"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						className: "flex flex-wrap gap-2",
						onSubmit: (e) => {
							e.preventDefault();
							if (valid) setClientId(input.trim());
						},
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: input,
							onChange: (e) => setInput(e.target.value),
							placeholder: "rec…",
							"aria-label": "Canonical Clients record",
							className: "h-11 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 font-mono text-[15px]"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							disabled: !valid,
							className: "h-11 rounded-md border border-gold/50 px-4 text-[15px] disabled:opacity-50",
							children: "เปิดดู"
						})]
					})
				]
			}),
			clientId && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "space-y-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[16px] font-semibold",
					children: "สถานะบทสนทนา"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveState, {
					pending: convs.isPending,
					error: convs.error,
					children: (convs.data?.items.length ?? 0) === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[15px] text-muted-foreground",
						children: "ไม่มีข้อมูลบทสนทนา"
					}) : convs.data.items.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecordCard, {
						record: r,
						badge: pick(r, ["state", "status"])
					}, i))
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "space-y-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[16px] font-semibold",
					children: "ความจำของ Kenji · คำแนะนำ"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveState, {
					pending: memory.isPending,
					error: memory.error,
					children: memory.data && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecordCard, { record: memory.data.data })
				})]
			})] })
		]
	});
}
//#endregion
export { KenjiControl as component };
