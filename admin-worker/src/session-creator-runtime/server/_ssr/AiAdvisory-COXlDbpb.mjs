import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { c as Sparkles } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/AiAdvisory-COXlDbpb.js
var import_jsx_runtime = require_jsx_runtime();
/**
* Compact inline AI advisory. Presentation only — AI never carries payment,
* membership, access or entitlement authority, and reply drafts are preview
* only (sending is disabled everywhere in this UI).
*/
function AiAdvisory({ title = "AI ช่วยสรุป", mode, children }) {
	const modeLabel = mode === "auto" ? "AUTO" : mode === "ready_for_per" ? "READY FOR PER" : mode === "per_only" ? "PER ONLY" : void 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-xl border border-accent-foreground/20 bg-accent/60 p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, {
						className: "h-4 w-4 text-accent-foreground",
						"aria-hidden": true
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[15px] font-semibold text-accent-foreground",
						children: title
					}),
					modeLabel && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded-md border border-accent-foreground/30 px-2 py-0.5 text-[13px] text-accent-foreground",
						children: modeLabel
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-2 space-y-2 text-[15px] leading-relaxed text-foreground/90",
				children
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-[13px] text-muted-foreground",
				children: "AI เป็นคำแนะนำ ไม่ใช่อำนาจยืนยัน · การยืนยันจริงตัดสินโดยระบบหลังบ้าน"
			})
		]
	});
}
//#endregion
export { AiAdvisory as t };
