import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { a as MODEL_ROOM_ITEMS } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as CanonPage } from "./CanonPage-FXlmFGAJ.mjs";
import { n as PublishPanel } from "./StudioPanels-BFHXIFcN.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.studio.model-preview-CBk3TQn0.js
var import_jsx_runtime = require_jsx_runtime();
var SplitComponent = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CanonPage, {
	module: "โมเดล & สตูดิโอ",
	path: "/internal/admin/studio/model-preview",
	title: "Model Preview",
	intro: "Final Preview ใช้ตรวจดูเท่านั้น · publish-plan และ commit ถูกกันโดยระบบหลังบ้าน (can_commit + confirm key)",
	items: MODEL_ROOM_ITEMS,
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PublishPanel, {})
});
//#endregion
export { SplitComponent as component };
