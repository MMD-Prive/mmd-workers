import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ModulePlaceholder-bpubIpNF.js
var import_jsx_runtime = require_jsx_runtime();
function ModulePlaceholder({ title, intro, endpoints, notes, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto max-w-4xl space-y-6 px-4 py-8",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-xl font-semibold tracking-tight",
				children: title
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-2xl text-[13px] text-muted-foreground",
				children: intro
			})] }),
			children,
			endpoints && endpoints.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-lg border border-border bg-surface p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-gold",
					children: "Authoritative endpoints"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 space-y-2",
					children: endpoints.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "text-[12px]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mr-2 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground",
								children: e.method
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-foreground",
								children: e.path
							}),
							e.note && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "ml-2 text-muted-foreground",
								children: ["— ", e.note]
							})
						]
					}, `${e.method} ${e.path}`))
				})]
			}),
			notes && notes.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-lg border border-border bg-surface-2 p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
					children: "Operating rules"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 list-disc space-y-1.5 pl-5 text-[12px] text-muted-foreground",
					children: notes.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: n }, n))
				})]
			})
		]
	});
}
//#endregion
export { ModulePlaceholder as t };
