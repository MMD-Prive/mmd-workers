import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { a as apiPost, i as apiGet, o as cn, s as isPreviewRuntime, t as ApiError } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link, w as useHydrated, x as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { C as LoaderCircle, K as ChevronDown, L as Copy, T as Link2, m as RefreshCw, nt as ArrowLeft, tt as ArrowRight } from "../_libs/lucide-react.mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { n as buttonVariants } from "./button-C7XS-FYH.mjs";
import { a as AlertDialogDescription$1, c as AlertDialogTitle$1, i as AlertDialogContent$1, n as AlertDialogAction$1, o as AlertDialogOverlay$1, r as AlertDialogCancel$1, s as AlertDialogPortal$1, t as AlertDialog$1 } from "../_libs/@radix-ui/react-alert-dialog+[...].mjs";
import { t as LiveState } from "./LiveState-B_hGkOGT.mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
import { i as jobsQueryOptions, n as caseLinkAction, r as jobDateLabels, t as JobsScopeError } from "./jobs-DEY8sWDt.mjs";
import { t as Route } from "./internal.admin.jobs.all-CnRkNwIp.mjs";
import { n as hasLinkedCustomer, t as CustomerIdentityAction } from "./CustomerIdentityAction-DeT6j4Ki.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.jobs.all-lmuQBYsh.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var AlertDialog = AlertDialog$1;
var AlertDialogPortal = AlertDialogPortal$1;
var AlertDialogOverlay = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogOverlay$1, {
	className: cn("fixed inset-0 z-50 bg-overlay/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className),
	...props,
	ref
}));
AlertDialogOverlay.displayName = AlertDialogOverlay$1.displayName;
var AlertDialogContent = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AlertDialogPortal, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogOverlay, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogContent$1, {
	ref,
	className: cn("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg", className),
	...props
})] }));
AlertDialogContent.displayName = AlertDialogContent$1.displayName;
var AlertDialogHeader = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col space-y-2 text-center sm:text-left", className),
	...props
});
AlertDialogHeader.displayName = "AlertDialogHeader";
var AlertDialogFooter = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className),
	...props
});
AlertDialogFooter.displayName = "AlertDialogFooter";
var AlertDialogTitle = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogTitle$1, {
	ref,
	className: cn("text-lg font-semibold", className),
	...props
}));
AlertDialogTitle.displayName = AlertDialogTitle$1.displayName;
var AlertDialogDescription = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogDescription$1, {
	ref,
	className: cn("text-sm text-muted-foreground", className),
	...props
}));
AlertDialogDescription.displayName = AlertDialogDescription$1.displayName;
var AlertDialogAction = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogAction$1, {
	ref,
	className: cn(buttonVariants(), className),
	...props
}));
AlertDialogAction.displayName = AlertDialogAction$1.displayName;
var AlertDialogCancel = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogCancel$1, {
	ref,
	className: cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className),
	...props
}));
AlertDialogCancel.displayName = AlertDialogCancel$1.displayName;
function formatThb(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return `฿${Math.round(value).toLocaleString("en-US")}`;
}
function isCancelled(finance) {
	return /^cancel/i.test(finance?.session_status ?? "") || /^cancel/i.test(finance?.payment_status ?? "");
}
/** Presentation only: a row-level cancellation must not be hidden by missing finance status. */
function jobCardFinance(job) {
	const status = job.status;
	if (status && /^cancel/i.test(status)) return {
		...job.finance,
		session_status: status
	};
	return job.finance;
}
function jobCardText(job) {
	const text = job.text?.trim();
	if (!text) return null;
	if (!isCancelled(jobCardFinance(job))) return text;
	return text.split("·").map((part) => part.trim()).filter((part) => !/^cancelled$/i.test(part)).join(" · ") || null;
}
function financeChips(finance) {
	if (!finance) return [];
	return [
		["ยอดลูกค้า", finance.amount_thb],
		["มัดจำ", finance.deposit_due_thb],
		["คงเหลือ", finance.balance_thb],
		["โมเดล", finance.model_payout_thb]
	].filter(([label, value]) => formatThb(value) !== null && !(isCancelled(finance) && label !== "ยอดลูกค้า" && value === 0));
}
function paymentBadge(finance) {
	if (!finance) return null;
	if (isCancelled(finance)) return {
		label: "ยกเลิกแล้ว",
		tone: "cancelled"
	};
	switch (finance.payment_status) {
		case "paid": return {
			label: "ชำระแล้ว",
			tone: "paid"
		};
		case "partial": return {
			label: "ชำระบางส่วน",
			tone: "partial"
		};
		case "pending": return {
			label: "รอชำระ",
			tone: "pending"
		};
		default: return null;
	}
}
function matchesFilter(job, filter) {
	const f = jobCardFinance(job);
	if (filter === "all") return true;
	if (filter === "cancelled") return isCancelled(f);
	if (isCancelled(f)) return false;
	if (filter === "paid") return f?.payment_status === "paid";
	return f?.payment_status === "pending" || f?.payment_status === "partial";
}
function canRequestPaymentLink(finance) {
	return !!finance && finance.payment_status !== "paid" && !isCancelled(finance);
}
function discountLabel(d) {
	if (!d || typeof d.value !== "number") return null;
	return d.type === "percent" ? `${d.value}%` : formatThb(d.value);
}
function discountModeLabel(mode) {
	if (mode === "customer_request") return "ลูกค้าขอลด · MMD รับผิดชอบเอง";
	if (mode === "promotion") return "โปรโมชั่น · MMD กับโมเดลคนละครึ่ง";
	return null;
}
/** Always-visible card pill. Pure: string | null, no reason text (stays in the expanded box). */
function discountBadge(finance) {
	const d = finance?.pricing?.discount;
	if (!d || typeof d.value !== "number" || d.value <= 0) return null;
	if (typeof d.amount_thb === "number" && d.amount_thb <= 0) return null;
	const amount = formatThb(d.amount_thb);
	let head;
	if (d.type === "percent") head = `ส่วนลด ${d.value}%` + (amount ? ` −${amount}` : "");
	else {
		const value = amount ?? formatThb(d.value);
		if (!value) return null;
		head = `ส่วนลด −${value}`;
	}
	const mode = discountModeLabel(d.mode);
	return mode ? `${head} · ${mode}` : head;
}
var LINK_ERRORS = {
	already_paid: "งานนี้ชำระแล้ว",
	job_cancelled: "งานนี้ถูกยกเลิกแล้ว",
	payment_link_expired: "ลิงก์หมดอายุแล้ว",
	payment_link_unavailable: "ยังไม่มีลิงก์ชำระเงิน",
	job_not_found: "ไม่พบงานนี้ในระบบ"
};
function paymentLinkErrorMessage(code) {
	return code && LINK_ERRORS[code] || "ขอลิงก์ชำระเงินไม่สำเร็จ กรุณาลองใหม่";
}
function customerPaymentMessage(url) {
	return `ลิงก์ชำระเงินสำหรับงานของคุณ\n${url}\nเมื่อโอนแล้วแนบสลิปในหน้าเดียวกันได้เลยค่ะ`;
}
/** Fresh, uncached read. Never log or persist the returned URL. */
async function fetchPaymentLink(sessionId) {
	const params = new URLSearchParams({
		view: "payment_link",
		session_id: sessionId
	});
	let res;
	try {
		res = await apiGet(`/v1/admin/dashboard?${params.toString()}`);
	} catch (e) {
		throw new Error(paymentLinkErrorMessage(e instanceof ApiError ? e.code : void 0));
	}
	const url = res?.payment_link?.url;
	if (res?.ok !== true || typeof url !== "string" || !/^https:\/\//i.test(url)) throw new Error(paymentLinkErrorMessage(res?.error));
	return {
		url,
		expires_at: res.payment_link?.expires_at ?? null
	};
}
function canVoidJob(finance) {
	return !!finance && finance.payment_status === "pending" && !isCancelled(finance);
}
var VOID_ERRORS = {
	unauthorized: "เซสชันผู้ดูแลหมดอายุ กรุณาเข้าสู่ระบบใหม่",
	forbidden_origin: "คำขอนี้ไม่ได้มาจากหน้าระบบที่อนุญาต",
	invalid_session_id: "รหัสงานไม่ถูกต้อง",
	confirmation_required: "ต้องยืนยันก่อนยกเลิกงาน",
	job_not_found: "ไม่พบงานนี้",
	job_already_progressed: "งานนี้ยืนยัน/เสร็จแล้ว ยกเลิกด้วยวิธีนี้ไม่ได้",
	payment_activity_exists: "งานนี้มีการชำระเงินแล้ว ต้องให้ทีมตรวจเงินจัดการ ยกเลิกด้วยปุ่มนี้ไม่ได้",
	payment_evidence_exists: "มีสลิป/หลักฐานการชำระแล้ว ต้องให้ทีมตรวจเงินจัดการ",
	void_unavailable: "ระบบยังไม่พร้อม ลองใหม่"
};
function voidErrorMessage(code) {
	return code && VOID_ERRORS[code] || "ยกเลิกงานไม่สำเร็จ กรุณาลองใหม่";
}
function buildVoidBody(sessionId, reason) {
	const trimmed = (reason ?? "").trim().slice(0, 200);
	return trimmed ? {
		session_id: sessionId,
		reason: trimmed,
		confirm: true
	} : {
		session_id: sessionId,
		confirm: true
	};
}
async function voidJob(sessionId, reason) {
	let res;
	try {
		res = await apiPost("/v1/admin/job/void", buildVoidBody(sessionId, reason));
	} catch (e) {
		throw new Error(voidErrorMessage(e instanceof ApiError ? e.code ?? (e.status === 401 ? "unauthorized" : void 0) : void 0));
	}
	if (res?.ok !== true || res.voided !== true) throw new Error(voidErrorMessage(res?.error));
	return {
		already_voided: res.already_voided === true,
		warning: res.warning ?? null
	};
}
function canShowProgress(finance) {
	return !!finance && (finance.payment_status === "partial" || finance.payment_status === "paid") && !isCancelled(finance);
}
function canReissueConfirmationLinks(finance) {
	return !!finance && (finance.payment_status === "partial" || finance.payment_status === "paid") && !isCancelled(finance);
}
function canCheckSlip(finance) {
	return !!finance && (finance.payment_status === "pending" || finance.payment_status === "partial") && !isCancelled(finance);
}
function formatAck(iso) {
	if (!iso || Number.isNaN(Date.parse(iso))) return null;
	return new Date(iso).toLocaleString("th-TH", {
		dateStyle: "medium",
		timeStyle: "short"
	});
}
function progressPills(finance) {
	const c = formatAck(finance?.customer_ack_at);
	const m = formatAck(finance?.model_ack_at);
	return [c ? {
		label: `ลูกค้ายืนยันแล้ว ${c}`,
		done: true
	} : {
		label: "รอลูกค้ายืนยัน",
		done: false
	}, m ? {
		label: `โมเดลรับทราบแล้ว ${m}`,
		done: true
	} : {
		label: "รอโมเดลรับทราบ",
		done: false
	}];
}
function VoidJobAction({ sessionId, title, amountThb, onVoided }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [reason, setReason] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [done, setDone] = (0, import_react.useState)(null);
	const confirm = async () => {
		if (busy) return;
		if (isPreviewRuntime()) return setError("ใช้ได้เฉพาะบน www.mmdbkk.com");
		setBusy(true);
		setError(null);
		try {
			const r = await voidJob(sessionId, reason);
			setOpen(false);
			setDone(r.warning === "payment_intent_not_marked" ? "ยกเลิกงานแล้ว แต่รายการชำระเงินยังไม่ถูกปิด ให้แจ้งทีมตรวจเงิน" : "ยกเลิกงานแล้ว");
			onVoided();
		} catch (e) {
			setError(e instanceof Error ? e.message : "ยกเลิกงานไม่สำเร็จ กรุณาลองใหม่");
		} finally {
			setBusy(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => {
					setError(null);
					setOpen(true);
				},
				className: "inline-flex min-h-11 items-center rounded-xl border border-destructive/50 px-3 text-[14px] text-destructive hover:bg-destructive/10",
				children: "ยกเลิกงาน (void)"
			}),
			done && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "text-[14px] font-semibold",
				children: done
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialog, {
				open,
				onOpenChange: (v) => !busy && setOpen(v),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AlertDialogContent, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AlertDialogHeader, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogTitle, { children: "ยกเลิกงานนี้?" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogDescription, {
						asChild: true,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-2 text-[14px]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "font-semibold text-foreground break-words",
									children: title
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "break-all font-mono text-[12px]",
									children: sessionId
								}),
								formatThb(amountThb) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["ยอดลูกค้า ", formatThb(amountThb)] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "งานจะถูกทำเครื่องหมายว่ายกเลิก ไม่ถูกลบ และลิงก์ชำระเงินของงานนี้จะใช้ไม่ได้ ใช้กับงานซ้ำหรืองานที่สร้างผิดที่ยังไม่มีการชำระเงินเท่านั้น" })
							]
						})
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: reason,
						maxLength: 200,
						onChange: (e) => setReason(e.target.value),
						placeholder: "เช่น งานซ้ำ",
						"aria-label": "เหตุผลการยกเลิก (ไม่บังคับ)",
						className: "h-11 w-full rounded-lg border border-border bg-background px-3 text-[15px]"
					}),
					error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "text-[14px] text-destructive",
						children: error
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AlertDialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogCancel, {
						disabled: busy,
						className: "min-h-11",
						children: "ไม่ยกเลิก"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: busy,
						onClick: () => void confirm(),
						className: "inline-flex min-h-11 items-center justify-center rounded-md bg-destructive px-4 text-[14px] font-semibold text-destructive-foreground disabled:opacity-50",
						children: busy ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"
					})] })
				] })
			})
		]
	});
}
var ORIGINS = /* @__PURE__ */ new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
var LIFF = {
	customer: "2010862595-yT4DCEMc",
	model: "2010864854-N34SgCqq"
};
var PATHS = {
	customer: /* @__PURE__ */ new Set(["/sigil/confirm/job-confirmation", "/confirm/job-confirmation"]),
	model: /* @__PURE__ */ new Set(["/sigil/confirm/job-model", "/confirm/job-model"])
};
function confirmationMiniAppUrl(value, role) {
	if (typeof value !== "string") return null;
	try {
		const canonical = new URL(value);
		if (!ORIGINS.has(canonical.origin) || canonical.username || canonical.password || canonical.hash || !PATHS[role].has(canonical.pathname) || [...canonical.searchParams.keys()].join() !== "t") return null;
		const token = canonical.searchParams.get("t");
		if (!token || token.length > 8e3) return null;
		const miniApp = new URL(`https://miniapp.line.me/${LIFF[role]}/`);
		if (role === "customer") miniApp.searchParams.set("intent", "status");
		miniApp.searchParams.set("return_to", `${canonical.pathname}?t=${encodeURIComponent(token)}`);
		return miniApp.toString();
	} catch {
		return null;
	}
}
/**
* Reissue customer/model confirm links. Worker owns signing + TTL; this UI only
* asks and displays role-specific LINE Mini App links after payment approval.
*/
var path = (id) => `/v1/admin/jobs/${encodeURIComponent(id)}/confirm-links/reissue`;
function errMsg(body) {
	const e = body?.["error"];
	const m = (e && typeof e === "object" ? e["message"] ?? e["code"] : e) ?? body?.["message"];
	return typeof m === "string" && m.length < 200 ? m : null;
}
function ConfirmLinksAction({ sessionId }) {
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [links, setLinks] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [review, setReview] = (0, import_react.useState)(null);
	const [copied, setCopied] = (0, import_react.useState)(null);
	async function run() {
		setError(null);
		setReview(null);
		setLinks(null);
		if (isPreviewRuntime()) {
			setError("พรีวิว: ไม่ออกลิงก์จริง");
			return;
		}
		setBusy(true);
		try {
			const res = await fetch(path(sessionId), {
				method: "POST",
				credentials: "include",
				cache: "no-store",
				headers: {
					"content-type": "application/json",
					accept: "application/json"
				},
				body: JSON.stringify({ session_id: sessionId })
			});
			const body = await res.json().catch(() => null);
			const detail = errMsg(body);
			if (res.status === 404 || res.status === 405) return setError("ระบบหลังบ้านยังไม่เปิดช่องนี้ — ดูลิงก์ใน Airtable Sessions (customer_url / model_url) ไปก่อน");
			if (res.status === 401 || res.status === 403) return setError("ไม่มีสิทธิ์ หรือหมดเวลาเข้าสู่ระบบ — เข้าสู่ระบบใหม่");
			if (res.status === 409 || res.status === 422) return setReview(detail ?? "งานนี้ต้องตรวจสอบก่อนออกลิงก์");
			if (res.status === 429) return setError("กดถี่เกินไป รอสักครู่แล้วลองใหม่");
			if (!res.ok) return setError(`ระบบไม่ออกลิงก์ให้ (${res.status})${detail ? ` · ${detail}` : ""}`);
			const d = body?.["data"] ?? body ?? {};
			const status = typeof d["status"] === "string" ? d["status"] : null;
			if (status === "review_required" || status === "needs_review" || d["review_required"] === true) return setReview(errMsg(d) ?? (typeof d["reason"] === "string" ? d["reason"] : null) ?? "งานนี้ต้องตรวจสอบก่อนออกลิงก์");
			const next = {
				customer: confirmationMiniAppUrl(d["customer_url"], "customer"),
				model: confirmationMiniAppUrl(d["model_url"], "model"),
				expiresAt: typeof d["expires_at"] === "string" ? d["expires_at"] : null
			};
			if (!next.customer && !next.model) return setError("ระบบตอบกลับแต่ไม่มีลิงก์ที่ใช้ได้");
			setLinks(next);
		} catch {
			setError("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
		} finally {
			setBusy(false);
		}
	}
	async function copy(label, url) {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(label);
			setTimeout(() => setCopied(null), 1500);
		} catch {}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: run,
				disabled: busy,
				className: "inline-flex min-h-11 items-center gap-2 rounded-xl border border-gold/40 px-3 text-[14px] hover:bg-gold-muted disabled:opacity-50",
				children: [busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
					className: "size-4 animate-spin",
					"aria-hidden": "true"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, {
					className: "size-4",
					"aria-hidden": "true"
				}), "ออกลิงก์ยืนยันใหม่ (MY MMD / MY MODEL)"]
			}),
			error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "mt-2 text-[13px] text-destructive",
				children: error
			}),
			review && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				role: "status",
				className: "mt-2 text-[13px] text-gold",
				children: ["ต้องตรวจสอบ: ", review]
			}),
			links?.expiresAt && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 text-[12px] text-muted-foreground",
				children: ["หมดอายุ ", new Date(links.expiresAt).toLocaleString("th-TH")]
			}),
			links && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-2 space-y-2",
				children: [["ลูกค้า · MY MMD", links.customer], ["โมเดล · MY MODEL", links.model]].map(([label, url]) => url ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex flex-wrap items-center gap-2 rounded-lg border border-border p-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[13px] font-medium",
							children: label
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground",
							children: url
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => copy(label, url),
							className: "inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2 text-[13px] hover:bg-surface-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, {
									className: "size-3.5",
									"aria-hidden": "true"
								}),
								" ",
								copied === label ? "ก็อปแล้ว" : "ก็อป"
							]
						})
					]
				}, label) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "text-[13px] text-muted-foreground",
					children: [label, ": ระบบไม่ได้ส่งลิงก์มา"]
				}, label))
			})
		]
	});
}
var toneClass = {
	pending: "border-gold/50 bg-gold-muted text-foreground",
	partial: "border-gold/50 bg-surface-2 text-foreground",
	paid: "border-primary/50 bg-primary/10 text-foreground",
	cancelled: "border-destructive/50 bg-destructive/10 text-foreground"
};
function PaymentBadge({ finance }) {
	const badge = paymentBadge(finance);
	if (!badge) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: `inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-semibold ${toneClass[badge.tone]}`,
		children: badge.label
	});
}
function DiscountBadge({ finance }) {
	const label = discountBadge(finance);
	if (!label) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "inline-flex h-8 items-center rounded-full border border-gold/50 bg-gold-muted px-3 text-[13px] font-semibold",
		children: label
	});
}
function FinanceChips({ finance }) {
	if (!finance) return null;
	const shown = financeChips(finance);
	if (!shown.length) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mt-3 flex flex-wrap gap-2",
		children: shown.map(([label, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px]",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-muted-foreground",
					children: label
				}),
				" ",
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-semibold tabular-nums",
					children: formatThb(v)
				})
			]
		}, label))
	});
}
function Row({ label, value }) {
	if (!value) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex justify-between gap-3 text-[14px]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "tabular-nums",
			children: value
		})]
	});
}
function PricingHistory({ pricing }) {
	if (!pricing) return null;
	const addons = pricing.addons ?? [];
	const d = pricing.discount;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
		className: "group mt-3 rounded-xl border border-border bg-background/40",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", {
			className: "flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-[14px] font-semibold",
			children: ["ประวัติราคา / ราคาก่อนลด", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
				className: "size-4 transition group-open:rotate-180",
				"aria-hidden": "true"
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-4 px-3 pb-3 sm:grid-cols-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-1",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] font-semibold",
							children: "ราคาลูกค้าก่อนลด"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: "ราคาหลัก",
							value: formatThb(pricing.client_base_thb)
						}),
						addons.map((a, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: `+ ${a.option}`,
							value: formatThb(a.client_thb)
						}, `c-${i}`)),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: "รวมก่อนลด",
							value: formatThb(pricing.client_gross_thb)
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-1",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] font-semibold",
							children: "ค่าตัวโมเดลก่อนลด"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: "ราคาหลัก",
							value: formatThb(pricing.model_base_thb)
						}),
						addons.map((a, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: `+ ${a.option}`,
							value: formatThb(a.model_thb)
						}, `m-${i}`)),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: "รวมก่อนลด",
							value: formatThb(pricing.model_gross_thb)
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-1 sm:col-span-2 border-t border-border pt-3",
					children: [
						d ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								label: `ส่วนลด ${discountLabel(d) ?? ""}`.trim(),
								value: formatThb(d.amount_thb) ? `−${formatThb(d.amount_thb)}` : null
							}),
							discountModeLabel(d.mode) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[13px] text-muted-foreground",
								children: discountModeLabel(d.mode)
							}),
							d.mode === "promotion" && d.reason && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "break-words text-[13px] text-muted-foreground",
								children: ["เหตุผล: ", d.reason]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								label: "MMD รับส่วนลด",
								value: formatThb(d.mmd_share_thb)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								label: "โมเดลรับส่วนลด",
								value: formatThb(d.model_share_thb)
							})
						] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[14px] text-muted-foreground",
							children: "ไม่มีส่วนลด"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: "สุทธิลูกค้า",
							value: formatThb(pricing.client_net_thb)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: "สุทธิโมเดล",
							value: formatThb(pricing.model_net_thb)
						})
					]
				})
			]
		})]
	});
}
function PaymentLinkAction({ sessionId }) {
	const [state, setState] = (0, import_react.useState)({ s: "idle" });
	const [copied, setCopied] = (0, import_react.useState)(null);
	if (!sessionId) return null;
	const load = async () => {
		if (isPreviewRuntime()) return setState({ s: "preview" });
		setState({ s: "loading" });
		try {
			setState({
				s: "ok",
				link: await fetchPaymentLink(sessionId)
			});
		} catch (e) {
			setState({
				s: "error",
				message: e instanceof Error ? e.message : "ขอลิงก์ไม่สำเร็จ"
			});
		}
	};
	const copy = async (text, which) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(which);
			setTimeout(() => setCopied(null), 2e3);
		} catch {
			setCopied(null);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3 space-y-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => void load(),
				disabled: state.s === "loading",
				className: "inline-flex min-h-11 items-center gap-2 rounded-xl border border-gold/40 px-3 text-[14px] hover:bg-gold-muted disabled:opacity-50",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, {
					className: "size-4",
					"aria-hidden": "true"
				}), state.s === "loading" ? "กำลังขอลิงก์…" : "ลิงก์ชำระเงิน"]
			}),
			state.s === "preview" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "text-[14px] text-muted-foreground",
				children: "ใช้ได้เฉพาะบน www.mmdbkk.com"
			}),
			state.s === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "text-[14px] text-destructive",
				children: state.message
			}),
			state.s === "ok" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2 rounded-xl border border-border bg-background/40 p-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						readOnly: true,
						value: state.link.url,
						"aria-label": "ลิงก์ชำระเงิน",
						onFocus: (e) => e.currentTarget.select(),
						className: "h-11 w-full rounded-lg border border-border bg-background px-2 font-mono text-[13px]"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => void copy(state.link.url, "url"),
								className: "inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-[14px]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, {
									className: "size-4",
									"aria-hidden": "true"
								}), " คัดลอกลิงก์"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => void copy(customerPaymentMessage(state.link.url), "msg"),
								className: "inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-[14px]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, {
									className: "size-4",
									"aria-hidden": "true"
								}), " คัดลอกข้อความส่งลูกค้า"]
							}),
							copied && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								role: "status",
								className: "self-center text-[14px] font-semibold",
								children: "คัดลอกแล้ว"
							})
						]
					}),
					state.link.expires_at && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-[13px] text-muted-foreground",
						children: [
							"หมดอายุ",
							" ",
							Number.isNaN(Date.parse(state.link.expires_at)) ? state.link.expires_at : new Date(state.link.expires_at).toLocaleString("th-TH")
						]
					})
				]
			})
		]
	});
}
function JobProgress({ finance }) {
	if (!canShowProgress(finance)) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[13px] font-semibold",
			children: "ความคืบหน้างาน"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-1.5 flex flex-wrap gap-2",
			children: progressPills(finance).map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: `inline-flex min-h-8 items-center rounded-full border px-3 text-[13px] ${p.done ? "border-primary/50 bg-primary/10 font-semibold text-foreground" : "border-border bg-surface-2 text-muted-foreground"}`,
				children: p.label
			}, p.label))
		})]
	});
}
function SlipCheckLink({ finance }) {
	if (!canCheckSlip(finance)) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
			href: "/internal/admin/payments",
			className: "inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-[14px] hover:bg-surface-2",
			children: "ตรวจสลิป / การชำระเงิน"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1 text-[13px] text-muted-foreground",
			children: "สลิปจาก LINE OFC จะเข้า Telegram Payment Confirm — ตรวจและกด Official Verify ที่หน้าชำระเงิน"
		})]
	});
}
var FILTERS = [
	["all", "ทั้งหมด"],
	["pending", "รอชำระ"],
	["paid", "ชำระแล้ว"],
	["cancelled", "ยกเลิก"]
];
function AllJobsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const selectedId = search.session_id || search.job_id;
	const hydrated = useHydrated();
	const query = useQuery({
		...jobsQueryOptions(search),
		enabled: hydrated
	});
	const selectedMismatch = query.error instanceof JobsScopeError;
	const [filter, setFilter] = (0, import_react.useState)("all");
	const jobs = query.data?.jobs ?? [];
	const visibleJobs = jobs.filter((job) => matchesFilter(job, filter));
	const pagination = query.data?.pagination;
	const openPage = (page) => navigate({ search: (prev) => ({
		...prev,
		page
	}) });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "งาน",
		path: "/internal/admin/jobs/all",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-5xl space-y-6 px-4 py-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "flex flex-wrap items-end justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] font-semibold uppercase tracking-[.18em] text-gold",
							children: "งาน · ระบบหลังบ้าน"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "mt-2 text-3xl font-semibold",
							children: selectedId ? "รายละเอียดงานที่เลือก" : "All Jobs"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground",
							children: "ดูสถานะงาน ลิงก์ชำระเงิน ประวัติราคา และยกเลิกงานซ้ำที่ยังไม่ชำระ"
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => void query.refetch(),
						className: "inline-flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-[15px] hover:bg-surface-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, {
							className: "size-4",
							"aria-hidden": "true"
						}), " รีเฟรช"]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex items-center gap-2 text-[14px] text-muted-foreground",
							children: ["วันที่", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "date",
								value: search.date ?? "",
								onChange: (event) => navigate({ search: (prev) => ({
									...prev,
									date: event.target.value || void 0,
									page: 1
								}) }),
								className: "h-10 rounded-lg border border-border bg-background px-2 text-foreground",
								"aria-label": "กรองตามวันที่งาน"
							})]
						}),
						search.date && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => navigate({ search: (prev) => ({
								...prev,
								date: void 0,
								page: 1
							}) }),
							className: "h-10 rounded-lg border border-border px-3 text-[14px]",
							children: "ทั้งหมด"
						}),
						selectedId && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "min-w-0 break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-[13px]",
							children: selectedId
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-2",
					role: "group",
					"aria-label": "กรองสถานะชำระเงิน",
					children: [FILTERS.map(([key, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-pressed": filter === key,
						onClick: () => setFilter(key),
						className: `h-11 rounded-full border px-4 text-[14px] ${filter === key ? "border-gold bg-gold-muted font-semibold" : "border-border"}`,
						children: label
					}, key)), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[13px] text-muted-foreground",
						children: "เรียงงานที่สร้างล่าสุดก่อน"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveState, {
					pending: !hydrated || query.isPending,
					error: selectedMismatch ? null : query.error,
					children: selectedMismatch ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						role: "alert",
						className: "rounded-2xl border border-destructive/40 bg-surface p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "text-[17px] font-semibold",
							children: "ข้อมูลที่ตอบกลับไม่ตรงกับงานที่เลือก"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-[14px] text-muted-foreground",
							children: "ซ่อนรายการไว้เพื่อป้องกันการเปิดผิดเคส กรุณากลับไปหน้าเดิมหรือรีเฟรช"
						})]
					}) : visibleJobs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
						role: "status",
						className: "rounded-2xl border border-border bg-surface p-5 text-[15px] text-muted-foreground",
						children: jobs.length > 0 ? "ไม่มีงานตามตัวกรองนี้ในหน้านี้" : selectedId ? "ไม่พบงานนี้ในข้อมูลที่ระบบหลังบ้านส่งมา" : "ไม่มีรายการงานจากระบบหลังบ้าน"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
						className: "space-y-3",
						"aria-label": "รายการงาน",
						children: visibleJobs.map((job, index) => {
							const finance = jobCardFinance(job);
							const text = jobCardText(job);
							const id = job.session_id ?? job.id ?? job.job_id ?? `row-${index}`;
							const action = caseLinkAction(job, search);
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
								className: `rounded-2xl border border-border bg-surface p-4 ${isCancelled(finance) ? "opacity-60" : ""}`,
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex flex-wrap items-start justify-between gap-3",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "min-w-0",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
														className: "flex flex-wrap items-center gap-2",
														children: [
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
																className: "break-words text-[17px] font-semibold",
																children: job.title || [job.model_name, job.customer_name].filter(Boolean).join(" · ") || job.job_id || job.session_id || "งาน"
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaymentBadge, { finance }),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DiscountBadge, { finance })
														]
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
														className: "mt-1 text-[14px] text-muted-foreground",
														children: [...jobDateLabels(job), paymentBadge(finance) ? void 0 : job.status].filter(Boolean).join(" · ") || "ระบบยังไม่ส่งรายละเอียดเพิ่มเติม"
													}),
													text && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
														className: "mt-1 text-[14px] text-muted-foreground",
														children: text
													}),
													(job.job_id || job.session_id) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
														className: "mt-2 break-all font-mono text-[12px] text-muted-foreground",
														children: job.job_id || job.session_id
													})
												]
											}),
											action.kind === "open" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
												to: action.href.split("?")[0],
												search: action.search,
												className: "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-gold/40 px-3 text-[14px] hover:bg-gold-muted",
												children: ["เปิดเคส ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, {
													className: "size-4",
													"aria-hidden": "true"
												})]
											}),
											action.kind === "back" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
												to: "/internal/admin/jobs/all",
												search: {
													...search.client_id ? { client_id: search.client_id } : {},
													...search.application_id ? { application_id: search.application_id } : {}
												},
												className: "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border px-3 text-[14px] hover:bg-surface-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, {
													className: "size-4",
													"aria-hidden": "true"
												}), " กลับไปรายการงานทั้งหมด"]
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FinanceChips, { finance }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PricingHistory, { pricing: job.finance?.pricing }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(JobProgress, { finance }),
									hasLinkedCustomer(job.client_id) && canRequestPaymentLink(finance) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaymentLinkAction, { sessionId: job.session_id ?? job.id }),
									!hasLinkedCustomer(job.client_id) && !isCancelled(finance) && job.session_id && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-3",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerIdentityAction, {
											sessionId: job.session_id,
											onVerified: (id) => {
												if (id) query.refetch();
											}
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlipCheckLink, { finance }),
									!selectedMismatch && hasLinkedCustomer(job.client_id) && canReissueConfirmationLinks(finance) && job.session_id && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConfirmLinksAction, { sessionId: job.session_id }),
									!selectedMismatch && canVoidJob(finance) && (job.session_id ?? job.id) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-4 border-t border-border pt-3",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VoidJobAction, {
											sessionId: job.session_id ?? job.id,
											title: job.title || [job.model_name, job.customer_name].filter(Boolean).join(" · ") || "งาน",
											amountThb: job.finance?.amount_thb,
											onVoided: () => void query.refetch()
										})
									})
								]
							}, `${id}-${index}`);
						})
					})
				}),
				!selectedId && pagination && (pagination.total_pages ?? 1) > 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
					"aria-label": "เปลี่ยนหน้ารายการงาน",
					className: "flex items-center justify-between rounded-xl border border-border bg-surface p-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							disabled: !pagination.has_prev,
							onClick: () => openPage(Math.max(1, (pagination.page ?? 1) - 1)),
							className: "inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 disabled:opacity-40",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, {
								className: "size-4",
								"aria-hidden": "true"
							}), " ก่อนหน้า"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-[14px] text-muted-foreground",
							children: [
								"หน้า ",
								pagination.page ?? search.page ?? 1,
								" / ",
								pagination.total_pages
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							disabled: !pagination.has_next,
							onClick: () => openPage((pagination.page ?? 1) + 1),
							className: "inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 disabled:opacity-40",
							children: ["ถัดไป ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, {
								className: "size-4",
								"aria-hidden": "true"
							})]
						})
					]
				})
			]
		})
	});
}
//#endregion
export { AllJobsPage as component };
