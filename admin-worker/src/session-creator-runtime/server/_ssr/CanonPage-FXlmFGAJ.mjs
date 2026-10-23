import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { J as usingDemoData } from "./provider-CvQy8AcV.mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/CanonPage-FXlmFGAJ.js
var import_jsx_runtime = require_jsx_runtime();
/** Room destination grid — navigation only, never authority. */
function RoomDestinations({ items, current }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
		"aria-label": "Room destinations",
		className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-3",
		children: items.map((i) => {
			const className = "block min-h-11 rounded-xl border p-3 hover:bg-surface-2 " + ((i.to ?? i.href) === current ? "border-gold/60 bg-gold-muted" : "border-border bg-surface");
			const content = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono text-[13px] text-gold",
					children: i.code
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "ml-2 text-[15px] font-medium text-foreground",
					children: i.label
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mt-1 block text-[13px] text-muted-foreground",
					children: i.description
				})
			] });
			return i.href ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
				href: i.href,
				className,
				"aria-current": i.href === current ? "page" : void 0,
				children: content
			}, i.code) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: i.to,
				className,
				"aria-current": i.to === current ? "page" : void 0,
				children: content
			}, i.code);
		})
	});
}
/**
* Canonical route page for destinations whose backend read contract is not
* present in this project. Renders no data — only an honest unavailable state
* and navigation. Never demo facts on production.
*/
function CanonPage({ module, path, title, intro, items, unavailable, children }) {
	const demo = usingDemoData();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module,
		path,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-4xl space-y-6 px-4 py-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-2xl font-semibold tracking-tight",
						children: title
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground",
						children: intro
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 font-mono text-[13px] text-muted-foreground",
						children: path
					}),
					demo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn",
						children: "ตัวอย่าง UI · ไม่ใช่ข้อมูลจริง"
					})
				] }),
				children,
				unavailable && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-2xl border border-border bg-surface p-4",
					role: "status",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[16px] font-semibold",
						children: "กำลังรอข้อมูลจริงจากระบบหลังบ้าน"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-[15px] leading-relaxed text-muted-foreground",
						children: unavailable
					})]
				}),
				items && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoomDestinations, {
					items,
					current: path
				})
			]
		})
	});
}
//#endregion
export { RoomDestinations as n, CanonPage as t };
