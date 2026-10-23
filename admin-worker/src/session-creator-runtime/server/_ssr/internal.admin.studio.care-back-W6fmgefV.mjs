import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { a as MODEL_ROOM_ITEMS } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as CanonPage } from "./CanonPage-FXlmFGAJ.mjs";
import { i as fetchObject, n as RecordCard, t as LiveState } from "./LiveState-B_hGkOGT.mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.studio.care-back-W6fmgefV.js
var import_jsx_runtime = require_jsx_runtime();
function CareBack() {
	const q = useQuery({
		queryKey: ["studio-care-back"],
		queryFn: ({ signal }) => fetchObject("/studio/api/care-back/overview", {
			models_needing_update: 2,
			source: "preview"
		}, signal),
		retry: false
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CanonPage, {
		module: "โมเดล & สตูดิโอ",
		path: "/internal/admin/studio/care-back",
		title: "Care-back",
		intro: "อ่านอย่างเดียวจาก GET /studio/api/care-back/overview",
		items: MODEL_ROOM_ITEMS,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveState, {
			pending: q.isPending,
			error: q.error,
			children: q.data && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecordCard, {
				record: q.data.data,
				title: "ภาพรวม Care-back"
			})
		})
	});
}
//#endregion
export { CareBack as component };
