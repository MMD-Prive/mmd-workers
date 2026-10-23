import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { t as X } from "../_libs/lucide-react.mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
import { n as fetchEvidenceUrl } from "./money-CgZ4DJmI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/EvidenceViewer-BRlHTk7u.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Read-only evidence: compact thumbnail, tap to open full-screen overlay.
* Fetches only when mounted with `load` true (lazy).
*/
function EvidenceViewer({ proofId, load = true }) {
	const [big, setBig] = (0, import_react.useState)(false);
	const q = useQuery({
		queryKey: ["evidence", proofId],
		queryFn: ({ signal }) => fetchEvidenceUrl(proofId, signal),
		enabled: load,
		retry: false
	});
	(0, import_react.useEffect)(() => () => {
		if (q.data?.startsWith("blob:")) URL.revokeObjectURL(q.data);
	}, [q.data]);
	(0, import_react.useEffect)(() => {
		if (!big) return;
		const onKey = (e) => e.key === "Escape" && setBig(false);
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [big]);
	if (!load) return null;
	if (q.isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-[13px] text-muted-foreground",
		children: "กำลังโหลดหลักฐาน…"
	});
	if (q.error || !q.data) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-[13px] text-muted-foreground",
		children: "ไม่มีภาพหลักฐานที่เปิดได้จากระบบหลังบ้าน"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick: () => setBig(true),
		"aria-label": "ขยายหลักฐาน",
		className: "block w-full overflow-hidden rounded-lg border border-border bg-surface-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
			src: q.data,
			alt: "หลักฐานการชำระเงิน",
			className: "mx-auto max-h-72 w-auto max-w-full object-contain"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "block py-1.5 text-center text-[13px] text-muted-foreground",
			children: "แตะเพื่อขยาย"
		})]
	}), big && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		role: "dialog",
		"aria-modal": "true",
		"aria-label": "หลักฐานขนาดเต็ม",
		className: "fixed inset-0 z-[60] flex flex-col bg-background/95",
		onClick: () => setBig(false),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex justify-end p-2",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				"aria-label": "ปิด",
				onClick: () => setBig(false),
				className: "grid h-11 w-11 place-items-center rounded-md border border-border bg-surface",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-5 w-5" })
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex-1 overflow-auto p-2",
			onClick: (e) => e.stopPropagation(),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: q.data,
				alt: "หลักฐานการชำระเงิน",
				className: "mx-auto h-auto max-w-full"
			})
		})]
	})] });
}
//#endregion
export { EvidenceViewer as t };
