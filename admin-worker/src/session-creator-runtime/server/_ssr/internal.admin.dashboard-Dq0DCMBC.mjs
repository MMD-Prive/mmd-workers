import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { t as ApiError } from "./client-DnJZI2KL.mjs";
import { o as TODAY_ROOM_ITEMS } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as CanonPage } from "./CanonPage-FXlmFGAJ.mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
import { t as fetchDashboard } from "./dashboard-CxKAJv39.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.dashboard-Dq0DCMBC.js
var import_jsx_runtime = require_jsx_runtime();
function Dashboard() {
	const q = useQuery({
		queryKey: ["admin-dashboard"],
		queryFn: ({ signal }) => fetchDashboard(signal),
		retry: false
	});
	const authErr = q.error instanceof ApiError && (q.error.status === 401 || q.error.status === 403);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CanonPage, {
		module: "วันนี้",
		path: "/internal/admin/dashboard",
		title: "Dashboard",
		intro: "สรุปธุรกิจและระบบจาก GET /v1/admin/dashboard · ตัวเลขทั้งหมดมาจากระบบหลังบ้าน ไม่คำนวณในเบราว์เซอร์",
		items: TODAY_ROOM_ITEMS,
		children: [
			q.isPending && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[15px] text-muted-foreground",
				role: "status",
				children: "กำลังโหลดข้อมูลจริง…"
			}),
			q.isError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-2xl border border-destructive/40 bg-surface p-4",
				role: "alert",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[16px] font-semibold",
					children: authErr ? "ต้องเข้าสู่ระบบผู้ดูแลก่อน" : "ระบบหลังบ้านยังไม่พร้อม"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-[15px] text-muted-foreground",
					children: "ไม่แสดงตัวเลขแทนของจริง"
				})]
			}),
			q.data && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "grid gap-2 sm:grid-cols-2",
				children: [q.data.metrics.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[15px] text-muted-foreground",
					children: "ระบบหลังบ้านยังไม่ส่งตัวเลขมา"
				}), q.data.metrics.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border bg-surface p-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-muted-foreground",
						children: m.label
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xl font-semibold",
						children: m.value ?? "—"
					})]
				}, m.key))]
			})
		]
	});
}
//#endregion
export { Dashboard as component };
