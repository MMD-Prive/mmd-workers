import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { o as cn } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { a as MODEL_ROOM_ITEMS, n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { n as RoomDestinations } from "./CanonPage-FXlmFGAJ.mjs";
import { n as PublishPanel, r as ReviewPanel, t as IntakePanel } from "./StudioPanels-BFHXIFcN.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.studio.index-C3C5-Gac.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var TABS = [
	{
		id: "intake",
		label: "Intake"
	},
	{
		id: "review",
		label: "Review"
	},
	{
		id: "publish",
		label: "Model Preview Publish"
	}
];
function Studio() {
	const [active, setActive] = (0, import_react.useState)("intake");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "Studio",
		path: "/internal/admin/studio",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto max-w-4xl space-y-5 px-4 py-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoomDestinations, {
					items: MODEL_ROOM_ITEMS,
					current: "/internal/admin/studio"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "space-y-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-[17px] font-semibold",
						children: "Studio workspace"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-muted-foreground",
						children: "Intake → Review → Model Preview Publish. Every action is a guarded call to the Studio Worker; normalisation, Airtable writes, asset verification and the publish gate stay backend-owned."
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					role: "tablist",
					"aria-label": "Studio sections",
					className: "flex flex-wrap gap-1.5",
					children: TABS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						role: "tab",
						type: "button",
						"aria-selected": active === t.id,
						onClick: () => setActive(t.id),
						className: cn("rounded-md border px-3 py-1.5 text-[12px]", active === t.id ? "border-gold/60 bg-gold-muted text-foreground" : "border-border text-muted-foreground hover:bg-surface-2"),
						children: t.label
					}, t.id))
				}),
				active === "intake" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IntakePanel, {}),
				active === "review" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewPanel, {}),
				active === "publish" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PublishPanel, {})
			]
		})
	});
}
//#endregion
export { Studio as component };
