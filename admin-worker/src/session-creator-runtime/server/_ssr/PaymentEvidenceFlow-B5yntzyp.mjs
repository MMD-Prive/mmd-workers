import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/PaymentEvidenceFlow-B5yntzyp.js
var import_jsx_runtime = require_jsx_runtime();
var STEPS = [
	{
		n: "01",
		label: "Slip Intake",
		th: "รับสลิปอัตโนมัติ"
	},
	{
		n: "02",
		label: "Review",
		th: "Pending Proof"
	},
	{
		n: "03",
		label: "Official Verify",
		th: "ยืนยันยอด"
	},
	{
		n: "04",
		label: "Money Truth",
		th: "payments-worker"
	}
];
/** Payment evidence flow — presentation only. Never a payment control. */
function PaymentEvidenceFlow({ compact = false }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-label": "Payment Evidence Flow",
		className: "rounded-2xl border border-border bg-surface p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "grid grid-cols-2 gap-2 sm:grid-cols-4",
				children: STEPS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "rounded-lg border border-border bg-surface-2 px-2.5 py-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono text-[13px] text-gold",
							children: s.n
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "ml-1.5 text-[14px] font-medium",
							children: s.label
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "block text-[13px] text-muted-foreground",
							children: s.th
						})
					]
				}, s.n))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-[13px] leading-relaxed text-muted-foreground",
				children: "สลิปจาก LINE/เว็บเป็นหลักฐานประกอบเท่านั้น อาจอยู่ในสถานะ pending / held / review-required · ระบบหลังบ้านเป็นผู้ยืนยันยอดจริง"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[13px] leading-relaxed text-muted-foreground",
				children: "Ops notification: HYPE / telegram-worker · แจ้งงานปฏิบัติการเท่านั้น · evidence intake → pending proof · payments-worker ยังคงเป็น Money Truth"
			}),
			!compact && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 flex flex-wrap gap-2 text-[13px]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/internal/ceo/payment-slip-inbox",
						className: "min-h-11 content-center rounded-md border border-border px-3 hover:bg-surface-2",
						children: "Payment Slip Inbox"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/internal/admin/payments",
						className: "min-h-11 content-center rounded-md border border-border px-3 hover:bg-surface-2",
						children: "Money Control"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/internal/admin/payments/historical-backfill",
						className: "min-h-11 content-center rounded-md border border-border px-3 hover:bg-surface-2",
						children: "Historical Slip Intake"
					})
				]
			})
		]
	});
}
//#endregion
export { PaymentEvidenceFlow as t };
