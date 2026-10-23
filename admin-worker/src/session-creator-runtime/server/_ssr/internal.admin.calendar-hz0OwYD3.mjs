import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { t as CanonPage } from "./CanonPage-FXlmFGAJ.mjs";
import { n as RecordCard, o as pick, r as fetchList, t as LiveState } from "./LiveState-B_hGkOGT.mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.calendar-hz0OwYD3.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var DEMO = [{
	job_ref: "ตัวอย่าง-JOB-01",
	job_date: "2026-09-28",
	start_time: "20:00",
	model_name: "ตัวอย่าง · Ami",
	deposit_status: "pending",
	cal_mapping: "mapped"
}];
var DATE_KEYS = [
	"job_date",
	"date",
	"start_date",
	"starts_at",
	"start"
];
function today() {
	return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function CalendarPage() {
	const [date, setDate] = (0, import_react.useState)(today());
	const [all, setAll] = (0, import_react.useState)(false);
	const q = useQuery({
		queryKey: ["admin-calendar"],
		queryFn: ({ signal }) => fetchList("/v1/admin/calendar", DEMO, signal),
		retry: false
	});
	const shown = (0, import_react.useMemo)(() => {
		const items = q.data?.items ?? [];
		if (all) return items;
		return items.filter((r) => (pick(r, DATE_KEYS) ?? "").startsWith(date));
	}, [
		q.data,
		date,
		all
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CanonPage, {
		module: "งาน",
		path: "/internal/admin/calendar",
		title: "ปฏิทินงาน",
		intro: "อ่านอย่างเดียวจาก GET /v1/admin/calendar · แสดงเฉพาะช่องที่ระบบหลังบ้านส่งมา · Session เป็นอ็อบเจกต์ของระบบหลังบ้าน",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "date",
					value: date,
					onChange: (e) => {
						setDate(e.target.value);
						setAll(false);
					},
					"aria-label": "เลือกวันที่",
					className: "h-11 rounded-md border border-border bg-surface px-3 text-[15px]"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => {
						setDate(today());
						setAll(false);
					},
					className: "h-11 rounded-md border border-border px-3 text-[15px] hover:bg-surface-2",
					children: "วันนี้"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setAll(true),
					"aria-pressed": all,
					className: "h-11 rounded-md border border-border px-3 text-[15px] hover:bg-surface-2",
					children: "ทั้งหมด"
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveState, {
			pending: q.isPending,
			error: q.error,
			children: shown.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[15px] text-muted-foreground",
				children: "ไม่มีรายการจากระบบหลังบ้านสำหรับวันที่นี้"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "space-y-2",
				children: shown.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecordCard, {
					record: r,
					title: pick(r, [
						"title",
						"job_ref",
						"job_id",
						"session_id"
					]),
					badge: pick(r, [
						"status",
						"cal_mapping",
						"cal_status"
					])
				}, pick(r, [
					"job_ref",
					"job_id",
					"session_id",
					"id"
				]) ?? i))
			})
		})]
	});
}
//#endregion
export { CalendarPage as component };
