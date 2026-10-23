import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as ConsoleShell, s as WORK_ROOM_ITEMS } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as AiAdvisory } from "./AiAdvisory-COXlDbpb.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.work-LfKRFsia.js
var import_jsx_runtime = require_jsx_runtime();
function WorkRoom() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "งาน",
		path: "/internal/admin/work",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-4xl space-y-6 px-4 py-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-2xl font-semibold tracking-tight",
					children: "งาน"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground",
					children: "สร้างงานใหม่และติดตามงานวันนี้ ขั้นตอนการสร้างงานยังเป็นชุดเดิม: ลูกค้า → ประเภทงาน → โมเดล → รายละเอียด → ตรวจ → สร้าง โดยระบบหลังบ้านเป็นผู้ตัดสินความถูกต้องทั้งหมด"
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/internal/admin/jobs/create-job",
					className: "block rounded-2xl border border-gold/50 bg-gold-muted p-5 hover:bg-gold-muted/80",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[17px] font-semibold",
						children: "สร้างงานใหม่"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "mt-1 block text-[15px] text-muted-foreground",
						children: "เริ่มจากลูกค้าที่ยืนยันตัวตนแล้วเท่านั้น"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "grid gap-3 sm:grid-cols-2",
					children: WORK_ROOM_ITEMS.filter((i) => i.to !== "/internal/admin/jobs/create-job").map((i) => {
						const content = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[16px] font-semibold",
							children: i.label
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mt-1 block text-[15px] text-muted-foreground",
							children: i.description
						})] });
						const className = "rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2";
						return i.href ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
							href: i.href,
							className,
							children: content
						}, i.code) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: i.to,
							className,
							children: content
						}, i.code);
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AiAdvisory, {
					mode: "auto",
					title: "AI ช่วยดูงานวันนี้",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "ยังไม่มีข้อสังเกตจากระบบสำหรับงานวันนี้" })
				})
			]
		})
	});
}
//#endregion
export { WorkRoom as component };
