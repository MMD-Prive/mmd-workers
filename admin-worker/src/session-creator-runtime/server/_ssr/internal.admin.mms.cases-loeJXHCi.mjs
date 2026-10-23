import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as ModulePlaceholder } from "./ModulePlaceholder-bpubIpNF.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.mms.cases-loeJXHCi.js
var import_jsx_runtime = require_jsx_runtime();
function MmsCases() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "MMS Cases",
		path: "/internal/admin/mms/cases",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModulePlaceholder, {
			title: "Customer cases & follow-up",
			intro: "Open service issues with what happened, what was promised, what is unresolved and the next step. Case state is backend-owned.",
			endpoints: [{
				method: "GET",
				path: "/v1/admin/mms/cases",
				note: "Read-only this phase"
			}],
			notes: ["Case updates and compensation stay blocked until the MMS write contract is wired.", "Cases the backend cannot resolve fail closed as review required."]
		})
	});
}
//#endregion
export { MmsCases as component };
