import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as ModulePlaceholder } from "./ModulePlaceholder-bpubIpNF.mjs";
import { t as Button } from "./button-C7XS-FYH.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.membership-access-9NeMvxCp.js
var import_jsx_runtime = require_jsx_runtime();
function MembershipAccess() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "Membership Access",
		path: "/internal/admin/membership-access",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ModulePlaceholder, {
			title: "Entitlement & access",
			intro: "Membership state is whatever the resolver says it is. This screen renders that answer and offers one guarded approval action.",
			endpoints: [{
				method: "POST",
				path: "/v1/admin/membership/payment-entitlement/approve",
				note: "explicit operator approval only"
			}],
			notes: [
				"Telegram and Google Drive are downstream observed state only — never a source of entitlement.",
				"No frontend tier inference: tier, points and expiry are display snapshots.",
				"Stale, unauthorized or ambiguous data shows unavailable / pending / needs_review."
			],
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-lg border border-verified/40 bg-verified/5 p-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-verified",
							children: "Source of truth"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 font-mono text-[13px]",
							children: "my_mmd_entitlement_resolver_v1"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[12px] text-muted-foreground",
							children: "Current entitlement, tier, points and expiry are resolved here and rendered unchanged."
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "grid gap-2 sm:grid-cols-2",
					children: [{
						label: "Telegram state",
						note: "Downstream observed only"
					}, {
						label: "Drive folder state",
						note: "Downstream observed only"
					}].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-lg border border-border bg-surface p-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] font-medium",
							children: s.label
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[11px] text-muted-foreground",
							children: s.note
						})]
					}, s.label))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-lg border border-warn/40 bg-warn/5 p-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "text-[13px] font-semibold text-warn",
							children: "Guarded action"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[12px] text-muted-foreground",
							children: "Approve payment entitlement only after the backend has verified payment. The action is disabled until an authoritative pending record is loaded."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							disabled: true,
							className: "mt-3 h-10",
							children: "Approve payment entitlement"
						})
					]
				})
			]
		})
	});
}
//#endregion
export { MembershipAccess as component };
