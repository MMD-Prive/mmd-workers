import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as ModulePlaceholder } from "./ModulePlaceholder-bpubIpNF.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.mms.bookings-CInGaiWq.js
var import_jsx_runtime = require_jsx_runtime();
function MmsBookings() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "MMS Bookings",
		path: "/internal/admin/mms/bookings",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModulePlaceholder, {
			title: "Booking requests",
			intro: "Every incoming MMS request with what it needs next: matching, deposit, clarification or confirmation. The backend decides readiness; this surface renders it.",
			endpoints: [{
				method: "GET",
				path: "/v1/admin/mms/bookings",
				note: "Read-only this phase"
			}],
			notes: ["Confirmation and deposit changes stay disabled until the MMS write contract is wired.", "Unverified or incomplete requests fail closed as ยังยืนยันไม่ได้ / review required."]
		})
	});
}
//#endregion
export { MmsBookings as component };
