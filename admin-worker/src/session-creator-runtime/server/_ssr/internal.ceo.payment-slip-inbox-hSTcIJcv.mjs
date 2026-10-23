import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as CanonPage } from "./CanonPage-FXlmFGAJ.mjs";
import { n as RecordCard, o as pick, t as LiveState } from "./LiveState-B_hGkOGT.mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
import { t as PaymentEvidenceFlow } from "./PaymentEvidenceFlow-B5yntzyp.mjs";
import { i as fetchReviewQueue } from "./money-CgZ4DJmI.mjs";
import { t as EvidenceViewer } from "./EvidenceViewer-BRlHTk7u.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.ceo.payment-slip-inbox-hSTcIJcv.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function Evidence({ proofId }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mt-2 w-full",
		children: !open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: () => setOpen(true),
			className: "h-11 rounded-md border border-border px-3 text-[14px] hover:bg-surface-2",
			children: "ดูหลักฐาน"
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "max-w-sm",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceViewer, { proofId })
		})
	});
}
function SlipInbox() {
	const q = useQuery({
		queryKey: ["review-queue", 30],
		queryFn: ({ signal }) => fetchReviewQueue(30, signal),
		retry: false
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CanonPage, {
		module: "ลูกค้า",
		path: "/internal/ceo/payment-slip-inbox",
		title: "Payment Slip Inbox",
		intro: "หลักฐานที่รอเปอร์ตัดสิน · เบราว์เซอร์ไม่ mark paid · payments-worker เป็นผู้บันทึกยอดจริง",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaymentEvidenceFlow, { compact: true }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveState, {
				pending: q.isPending,
				error: q.error,
				children: (q.data?.items.length ?? 0) === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[15px] text-muted-foreground",
					children: "ยังไม่มีหลักฐานที่รอตรวจจากระบบหลังบ้าน"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "space-y-2",
					children: q.data.items.map((r, i) => {
						const id = pick(r, ["proof_id", "id"]);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecordCard, {
							record: r,
							title: pick(r, [
								"client_display",
								"per_rename",
								"client_name"
							]) ?? "ยังไม่ผูกลูกค้า",
							badge: pick(r, [
								"source_channel",
								"channel",
								"source"
							])
						}), id && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-start gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Evidence, { proofId: id }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/internal/admin/payments",
								search: { proof_id: id },
								className: "mt-2 inline-flex h-11 items-center rounded-md border border-gold/40 px-3 text-[14px] font-medium hover:bg-surface-2",
								children: "เปิดใน Money Control"
							})]
						})] }, id ?? i);
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-2xl border border-gold/40 bg-gold-muted p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[16px] font-semibold",
						children: "ยืนยันยอด · Official Verify"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-[15px] text-muted-foreground",
						children: "การตัดสิน approve / issue / reject ทำที่ Money Control ซึ่งส่งไปให้ระบบหลังบ้านตรวจและบันทึก"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/internal/admin/payments",
						className: "mt-2 inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline",
						children: "ไป Money Control"
					})
				]
			})
		]
	});
}
//#endregion
export { SlipInbox as component };
