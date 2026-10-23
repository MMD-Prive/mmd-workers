import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { o as cn } from "./client-DnJZI2KL.mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { Z as Bot, rt as ArrowLeftRight, y as MessageCircleMore } from "../_libs/lucide-react.mjs";
import { r as KENJI_ROOM_ITEMS } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as CanonPage } from "./CanonPage-FXlmFGAJ.mjs";
import { t as LiveState } from "./LiveState-B_hGkOGT.mjs";
import { n as useOwnerSnapshot } from "./owner-snapshot-BtaivETD.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.telegram-brief-B2xMj7d3.js
var import_jsx_runtime = require_jsx_runtime();
function HealthBadge({ projection, fallback }) {
	const text = projection?.status.toUpperCase() ?? fallback;
	const className = projection?.status === "configured" ? "border-verified/40 text-verified" : projection?.status === "partial" || projection?.status === "degraded" ? "border-warn/40 text-warn" : "border-border text-muted-foreground";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("rounded-full border px-2.5 py-1 font-mono text-[12px]", className),
		children: text
	});
}
function TelegramConcierges() {
	const query = useOwnerSnapshot();
	const hype = query.data?.concierges.hype;
	const henna = query.data?.concierges.henna;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CanonPage, {
		module: "เคนจิ AI",
		path: "/internal/admin/telegram-brief",
		title: "Telegram Concierges",
		intro: "HYPE + HENNA · routing / health / handoff · ทั้งคู่ส่งต่อบริบทและช่วยงานปฏิบัติการ ไม่ใช่แหล่งยืนยันข้อมูลธุรกิจ",
		items: KENJI_ROOM_ITEMS,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveState, {
			pending: query.isPending,
			error: query.error,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "grid gap-3 md:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "min-w-0 rounded-2xl border border-border bg-surface p-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
							className: "flex flex-wrap items-start justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex min-w-0 items-center gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageCircleMore, {
									className: "h-5 w-5 shrink-0 text-gold",
									"aria-hidden": true
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-[18px] font-semibold",
									children: "HYPE"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[13px] text-muted-foreground",
									children: "Telegram Operating Concierge"
								})] })]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HealthBadge, {
								projection: hype,
								fallback: "UNAVAILABLE"
							})]
						}),
						hype?.detail && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-[13px] text-muted-foreground",
							children: hype.detail
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
							className: "mt-4 grid gap-2 text-[14px] text-foreground sm:grid-cols-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Customer-safe status" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Next action" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Supervised handoff" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Router health" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Owner briefing link" })
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-4 text-[13px] leading-relaxed text-muted-foreground",
							children: "ไม่ mark paid, grant membership, add Points, confirm jobs, assign models หรือ override customer truth"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/internal/ceo/kenji-control",
							className: "mt-4 inline-flex min-h-11 items-center rounded-lg border border-gold/50 px-3 text-[15px] font-medium hover:bg-gold-muted",
							children: "เปิด Kenji Control"
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "min-w-0 rounded-2xl border border-border bg-surface p-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
							className: "flex flex-wrap items-start justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex min-w-0 items-center gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bot, {
									className: "h-5 w-5 shrink-0 text-gold",
									"aria-hidden": true
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-[18px] font-semibold",
									children: "HENNA"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[13px] text-muted-foreground",
									children: "MMS Specialist Concierge"
								})] })]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HealthBadge, {
								projection: henna,
								fallback: "CHECK VIA MMS"
							})]
						}),
						!henna && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-[13px] text-muted-foreground",
							children: "ยังไม่มี HENNA-specific health projection · ตรวจสถานะผ่าน MMS backend"
						}),
						henna?.detail && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-[13px] text-muted-foreground",
							children: henna.detail
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
							className: "mt-4 grid gap-2 text-[14px] text-foreground sm:grid-cols-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Therapist applications" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "MMS manual / recovery handoff" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Specialist routing" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Application deep links" })
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-4 text-[13px] leading-relaxed text-muted-foreground",
							children: "Telegram Ops ส่งผ่าน telegram-worker · mms-worker และผู้ดูแลที่ได้รับสิทธิ์ยังเป็นอำนาจสุดท้าย"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/internal/admin/mms",
							className: "mt-4 inline-flex min-h-11 items-center rounded-lg border border-gold/50 px-3 text-[15px] font-medium hover:bg-gold-muted",
							children: "เปิด MMS"
						})
					]
				})]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "rounded-2xl border border-border bg-surface-2 p-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeftRight, {
						className: "h-4 w-4 text-gold",
						"aria-hidden": true
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-[16px] font-semibold",
						children: "HYPE ⇄ HENNA"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 grid gap-2 text-[14px] sm:grid-cols-[1fr_auto_1fr] sm:items-center",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "MMD account / booking / shop / Points / coupon / Hall" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeftRight, {
							className: "hidden h-4 w-4 text-muted-foreground sm:block",
							"aria-hidden": true
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "MMS Therapist / MMS recovery" })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-[13px] text-muted-foreground",
					children: "ข้ามระบบด้วยการส่งต่อบริบทไปยังเจ้าของระบบที่ถูกต้องเท่านั้น · ไม่เดาสถานะและไม่สร้าง business truth"
				})
			]
		})]
	});
}
//#endregion
export { TelegramConcierges as component };
