import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as ModulePlaceholder } from "./ModulePlaceholder-bpubIpNF.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.mms.therapists-IK6E5vL1.js
var import_jsx_runtime = require_jsx_runtime();
function MmsTherapists() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "MMS Therapists",
		path: "/internal/admin/mms/therapists",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModulePlaceholder, {
			title: "Therapist management",
			intro: "Roster, readiness, specialties, zones and reliability as recorded by the backend. Readiness is never calculated here.",
			endpoints: [{
				method: "GET",
				path: "/v1/admin/mms/therapists",
				note: "Read-only this phase"
			}],
			notes: ["Production therapist updates stay blocked until the MMS write contract is wired.", "Missing readiness or availability shows as Checking rather than an assumed state."]
		})
	});
}
//#endregion
export { MmsTherapists as component };
