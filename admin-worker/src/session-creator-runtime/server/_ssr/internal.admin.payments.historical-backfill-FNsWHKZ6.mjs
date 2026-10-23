import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { t as CLIENT_ROOM_ITEMS } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as CanonPage } from "./CanonPage-FXlmFGAJ.mjs";
import { n as RecordCard, o as pick, t as LiveState } from "./LiveState-B_hGkOGT.mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
import { t as PaymentEvidenceFlow } from "./PaymentEvidenceFlow-B5yntzyp.mjs";
import { r as fetchHistoricalBackfill } from "./money-CgZ4DJmI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.payments.historical-backfill-FNsWHKZ6.js
var import_jsx_runtime = require_jsx_runtime();
function Backfill() {
	const q = useQuery({
		queryKey: ["historical-backfill"],
		queryFn: ({ signal }) => fetchHistoricalBackfill(signal),
		retry: false
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CanonPage, {
		module: "ลูกค้า",
		path: "/internal/admin/payments/historical-backfill",
		title: "Historical Slip Intake",
		intro: "กู้สลิปเก่า/สลิปที่ส่งมือ แยกจาก Slip Intake อัตโนมัติจาก LINE · OCR และการอัปโหลดเป็นหลักฐานเท่านั้นจนกว่าจะผ่าน review",
		items: CLIENT_ROOM_ITEMS,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaymentEvidenceFlow, { compact: true }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveState, {
				pending: q.isPending,
				error: q.error,
				children: (q.data?.items.length ?? 0) === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[15px] text-muted-foreground",
					children: "ยังไม่มีรายการย้อนหลังจากระบบหลังบ้าน"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "space-y-2",
					children: q.data.items.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecordCard, {
						record: r,
						title: pick(r, [
							"client_display",
							"per_rename",
							"backfill_id",
							"id"
						]),
						badge: pick(r, ["status"])
					}, pick(r, ["backfill_id", "id"]) ?? i))
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "rounded-2xl border border-border bg-surface-2 p-4 text-[15px] text-muted-foreground",
				children: "อัปโหลด / reprocess / review ของสลิปย้อนหลัง ใช้หน้าจอ production เดิม เพราะรูปแบบคำขอของ intake, reprocess และ review ยังไม่มีในโปรเจกต์นี้ — หน้านี้จึงไม่ส่งคำขอเขียนใด ๆ"
			})
		]
	});
}
//#endregion
export { Backfill as component };
