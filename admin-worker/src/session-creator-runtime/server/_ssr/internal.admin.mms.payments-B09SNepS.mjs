import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as ModulePlaceholder } from "./ModulePlaceholder-bpubIpNF.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.mms.payments-B09SNepS.js
var import_jsx_runtime = require_jsx_runtime();
function MmsPayments() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "MMS Payments",
		path: "/internal/admin/mms/payments",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModulePlaceholder, {
			title: "Payments & deposit",
			intro: "Deposit and payment evidence prepared for a single decision. The console never marks money as received — the backend owns payment truth.",
			endpoints: [{
				method: "GET",
				path: "/v1/admin/mms/payments",
				note: "Read-only this phase"
			}],
			notes: ["Official verification stays disabled until the MMS payment contract is wired.", "Unmatched amounts or references fail closed as ยังยืนยันไม่ได้."]
		})
	});
}
//#endregion
export { MmsPayments as component };
