import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as ModulePlaceholder } from "./ModulePlaceholder-bpubIpNF.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.mms.applications-DUhWPUkA.js
var import_jsx_runtime = require_jsx_runtime();
function MmsApplications() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "MMS Applications",
		path: "/internal/admin/mms/applications",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModulePlaceholder, {
			title: "Therapist applications",
			intro: "Applications with what is complete, what is missing and what needs a decision. Approval authority stays with the backend.",
			endpoints: [{
				method: "GET",
				path: "/v1/admin/mms/applications",
				note: "Read-only this phase"
			}],
			notes: ["Approve/decline actions remain disabled until the MMS write contract is wired.", "Incomplete evidence fails closed as ต้องตรวจเพิ่ม rather than a pass."]
		})
	});
}
//#endregion
export { MmsApplications as component };
