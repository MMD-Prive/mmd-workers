import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as ModulePlaceholder } from "./ModulePlaceholder-bpubIpNF.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.mms.matching-BWboNb8p.js
var import_jsx_runtime = require_jsx_runtime();
function MmsMatching() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "MMS Matching",
		path: "/internal/admin/mms/matching",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModulePlaceholder, {
			title: "Matching & assignment",
			intro: "One request at a time: who fits, who is actually available, what is missing and whether it is ready to confirm. Suitability comes from the backend, never from the browser.",
			endpoints: [{
				method: "GET",
				path: "/v1/admin/mms/matching",
				note: "Read-only this phase"
			}],
			notes: ["Assignment writes stay blocked until the MMS write contract is wired.", "Unmatched requests fail closed as ยังจับคู่ไม่ได้."]
		})
	});
}
//#endregion
export { MmsMatching as component };
