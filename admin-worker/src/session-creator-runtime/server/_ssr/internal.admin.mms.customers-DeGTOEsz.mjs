import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as ModulePlaceholder } from "./ModulePlaceholder-bpubIpNF.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.mms.customers-DeGTOEsz.js
var import_jsx_runtime = require_jsx_runtime();
function MmsCustomers() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "MMS Customers",
		path: "/internal/admin/mms/customers",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModulePlaceholder, {
			title: "Customer intelligence",
			intro: "Start from an operating brief — who the customer is, what happened last, what is unresolved and what should happen next — then open details, history and evidence.",
			endpoints: [{
				method: "GET",
				path: "/v1/admin/mms/customers",
				note: "Read-only this phase"
			}],
			notes: ["MMS customers are separate records; they never inherit MMD Privé membership or entitlement.", "Conversation memory is continuity context only, never payment or access truth."]
		})
	});
}
//#endregion
export { MmsCustomers as component };
