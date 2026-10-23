import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as ModulePlaceholder } from "./ModulePlaceholder-bpubIpNF.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.access.invite-Ddevj0kx.js
var import_jsx_runtime = require_jsx_runtime();
function AccessInvite() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "Access Invite",
		path: "/internal/admin/access/invite",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModulePlaceholder, {
			title: "Access invitations",
			intro: "Issue, resend and revoke access invitations. Invitation validity, roles and expiry are decided and enforced by the backend.",
			notes: ["The console never grants access locally — it renders the backend's invitation state.", "Failed or unverified invitations fail closed and stay visible for review."]
		})
	});
}
//#endregion
export { AccessInvite as component };
