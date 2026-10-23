import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { i as apiGet, s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { q as useDemoMode } from "./provider-CvQy8AcV.mjs";
import { J as Camera, K as ChevronDown, O as ImagePlus, c as Sparkles, t as X } from "../_libs/lucide-react.mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { a as humanKey, o as pick, s as safeEntries, t as LiveState } from "./LiveState-B_hGkOGT.mjs";
import { a as useQueryClient, r as useQuery } from "../_libs/tanstack__react-query.mjs";
import { n as hasLinkedCustomer, t as CustomerIdentityAction } from "./CustomerIdentityAction-DeT6j4Ki.mjs";
import { a as fetchReviewQueueWithContext, c as submitSlipIntake, o as slipSourceLabel, s as submitPaymentReview, t as ReviewError } from "./money-CgZ4DJmI.mjs";
import { t as Route } from "./internal.admin.payments.index-Bz4m3ss-.mjs";
import { t as EvidenceViewer } from "./EvidenceViewer-BRlHTk7u.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.payments.index-COAUgIe2.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var validSummarySession = (value) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value);
var money = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-5;
var unavailable = () => /* @__PURE__ */ new Error("ยังสรุปยอดไม่ได้ ข้อมูลจากระบบหลังบ้านไม่ครบหรือไม่ตรงกับเลขงาน");
async function fetchJobSlipSummary(sessionId, signal) {
	if (!validSummarySession(sessionId) || isPreviewRuntime()) throw unavailable();
	const body = await apiGet(`/v1/admin/payments/review-queue?${new URLSearchParams({
		view: "job_slip_summary",
		session_id: sessionId
	})}`, signal);
	const s = body?.summary;
	if (body?.ok !== true || !s || s.schema !== "job_slip_summary_v1" || s.session_id !== sessionId || s.complete !== true || s.advisory_only !== true || s.money_truth_changed !== false || typeof s.pending_complete !== "boolean" || ![
		s.total_amount_thb,
		s.verified_paid_thb,
		s.remaining_amount_thb,
		s.overpaid_amount_thb
	].every(money) || !Array.isArray(s.issues) || !s.issues.every((i) => typeof i === "string") || !Array.isArray(s.pending_proofs) || !s.deposit || ![
		s.deposit.standard_minimum_thb,
		s.deposit.verified_thb,
		s.deposit.remaining_thb
	].every(money)) throw unavailable();
	const cents = (n) => Math.round(n * 100);
	const total = cents(s.total_amount_thb), paid = cents(s.verified_paid_thb);
	if (total <= 0 || cents(s.remaining_amount_thb) !== Math.max(0, total - paid) || cents(s.overpaid_amount_thb) !== Math.max(0, paid - total)) throw unavailable();
	const optional = [
		s.pending_amount_thb,
		s.projected_remaining_thb,
		s.projected_overpaid_thb,
		s.deposit.pending_thb,
		s.deposit.projected_remaining_thb
	];
	if (s.pending_complete) {
		if (s.issues.length || !optional.every(money) || !Number.isSafeInteger(s.pending_proof_count) || s.pending_proof_count < 0 || s.pending_proofs.length !== s.pending_proof_count) throw unavailable();
		const ids = /* @__PURE__ */ new Set();
		for (const p of s.pending_proofs) {
			if (!/^[A-Za-z0-9_-]{1,120}$/.test(p.proof_id) || ids.has(p.proof_id) || !money(p.amount_thb) || ![
				"deposit",
				"full",
				"final"
			].includes(p.payment_stage)) throw unavailable();
			ids.add(p.proof_id);
		}
		const pending = s.pending_proofs.reduce((n, p) => n + cents(p.amount_thb), 0);
		const deposit = s.pending_proofs.filter((p) => p.payment_stage === "deposit").reduce((n, p) => n + cents(p.amount_thb), 0);
		if (pending !== cents(s.pending_amount_thb) || deposit !== cents(s.deposit.pending_thb) || cents(s.projected_remaining_thb) !== Math.max(0, total - paid - pending) || cents(s.projected_overpaid_thb) !== Math.max(0, paid + pending - total)) throw unavailable();
	} else if (!s.issues.length || s.pending_proof_count !== null || s.pending_proofs.length || !optional.every((v) => v === null)) throw unavailable();
	return s;
}
var thb$1 = (n) => `${n.toLocaleString("th-TH", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
})} บาท`;
function JobSlipSummaryValues({ summary: s }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "break-all text-sm text-muted-foreground",
			children: ["เลขงาน ", s.session_id]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", {
			className: "grid grid-cols-1 gap-2 text-sm sm:grid-cols-2",
			children: [
				["ยอดงานทั้งหมด", s.total_amount_thb],
				["รับเงินยืนยันแล้ว", s.verified_paid_thb],
				["ยอดสลิปรอตรวจ", s.pending_amount_thb],
				["ยังขาดจริงทั้งงาน", s.remaining_amount_thb],
				["หากสลิปรอตรวจผ่าน จะยังขาด", s.projected_remaining_thb]
			].map(([label, value]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-lg border border-border p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
					className: "text-muted-foreground",
					children: label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
					className: "mt-1 font-semibold",
					children: value === null ? "ยังสรุปไม่ได้" : thb$1(value)
				})]
			}, label))
		}),
		s.overpaid_amount_thb > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			role: "status",
			className: "text-sm text-warn",
			children: [
				"รับเงินยืนยันเกินยอดงาน ",
				thb$1(s.overpaid_amount_thb),
				" · ตรวจสอบก่อนดำเนินการ"
			]
		}),
		(s.projected_overpaid_thb ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			role: "status",
			className: "text-sm text-warn",
			children: [
				"หากผ่านทั้งหมด ยอดจะเกินงาน ",
				thb$1(s.projected_overpaid_thb),
				" · ยังไม่ใช่ยอดรับเงินยืนยัน"
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
			className: "rounded-lg border border-border p-3 text-sm",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
					className: "cursor-pointer",
					children: "มัดจำตามเกณฑ์เดิม · แยกจากยอดคงเหลือทั้งงาน"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-2",
					children: [
						"เกณฑ์มัดจำ ",
						thb$1(s.deposit.standard_minimum_thb),
						" · มัดจำยืนยันแล้ว",
						" ",
						thb$1(s.deposit.verified_thb)
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["ยังขาดมัดจำ ", thb$1(s.deposit.remaining_thb)] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
					"หากสลิปค่าบริการรอตรวจผ่าน จะขาดมัดจำ",
					" ",
					s.deposit.projected_remaining_thb === null ? "ยังสรุปไม่ได้" : thb$1(s.deposit.projected_remaining_thb)
				] })
			]
		}),
		!s.pending_complete && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			role: "alert",
			className: "rounded-lg border border-warn/40 p-3 text-sm",
			children: "ยังรวมสลิปรอตรวจไม่ได้ อาจมีข้อมูลไม่ครบหรือรายการซ้ำ ตรวจหลักฐานทีละใบก่อน ยอดยืนยันแล้วด้านบนอ่านจาก ledger เดิม"
		}),
		s.pending_complete && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "text-sm",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
				"สลิปงานนี้ที่รอตรวจ ",
				s.pending_proof_count,
				" ใบ · ไม่รวมทิป สมาชิก หรือรายการของงานอื่น"
			] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: s.pending_proofs.map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
				className: "inline-flex min-h-11 items-center text-primary underline",
				href: `/internal/admin/payments?proof_id=${encodeURIComponent(p.proof_id)}`,
				target: "_blank",
				rel: "noopener noreferrer",
				children: [
					"เปิดสลิป ",
					i + 1,
					" · ",
					thb$1(p.amount_thb),
					" (แท็บใหม่)"
				]
			}) }, p.proof_id)) })]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-muted-foreground",
			children: "รวมเฉพาะหลักฐานที่มีการผูกกับงานแล้ว ไม่รวมรูปที่เลือกค้างบนหน้านี้ · ยอดรอตรวจเป็นข้อมูลช่วยตรวจ ไม่ยืนยันเงินเข้าและไม่เปลี่ยนการอนุมัติเงิน"
		})
	] });
}
function JobSlipSummary({ sessionId, draft = false }) {
	const [input, setInput] = (0, import_react.useState)("");
	const [requested, setRequested] = (0, import_react.useState)("");
	const selected = sessionId ?? requested;
	const preview = isPreviewRuntime();
	const q = useQuery({
		queryKey: [
			"review-queue",
			"job-slip-summary",
			selected
		],
		queryFn: ({ signal }) => fetchJobSlipSummary(selected, signal),
		enabled: validSummarySession(selected) && !preview,
		retry: false,
		staleTime: 0,
		gcTime: 0
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-label": "สรุปสลิปตามเลขงาน",
		className: "space-y-3 rounded-xl border border-border bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-semibold",
				children: "สรุปสลิปตามเลขงาน"
			}),
			sessionId === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "flex flex-wrap items-end gap-2",
				onSubmit: (e) => {
					e.preventDefault();
					setRequested(input.trim());
				},
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "min-w-0 flex-1 text-sm",
					children: ["เลขงาน / Session ID", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: input,
						onChange: (e) => setInput(e.target.value),
						maxLength: 120,
						className: "mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3",
						placeholder: "ระบุเลขงานที่ต้องการตรวจยอด"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "submit",
					disabled: !validSummarySession(input.trim()),
					className: "min-h-11 rounded-lg bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50",
					children: "ดูสรุป"
				})]
			}),
			draft && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-warn",
				children: "กำลังดูงานตามเลขที่เลือกเท่านั้น ยังไม่บันทึกการผูกสลิปที่กำลังแก้ไข"
			}),
			preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted-foreground",
				children: "หน้าตัวอย่างไม่ดึงยอดเงินจริง"
			}) : !selected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted-foreground",
				children: "เลือกเลขงานเพื่อดูยอดยืนยันแล้ว ยอดรอตรวจ และยอดขาด"
			}) : !validSummarySession(selected) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "text-sm text-warn",
				children: "เลขงานไม่ถูกต้อง ยังสรุปไม่ได้"
			}) : q.isFetching || q.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "text-sm",
				children: "กำลังอ่านยอดล่าสุดของงาน…"
			}) : q.isError || !q.data ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "text-sm text-warn",
				children: "ยังสรุปยอดไม่ได้ ข้อมูลไม่ครบหรือระบบอ่านไม่สำเร็จ กรุณาตรวจเลขงานแล้วลองใหม่"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(JobSlipSummaryValues, { summary: q.data }),
			selected && validSummarySession(selected) && !preview && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => void q.refetch(),
				disabled: q.isFetching,
				className: "min-h-11 rounded-lg border border-border px-3 text-sm",
				children: "อ่านยอดล่าสุดอีกครั้ง"
			})
		]
	});
}
/** Explicit Bangkok inputs only; never default to the current date/time. */
function slipTransferIso(date, time) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null;
	const local = `${date}T${time.length === 5 ? time + ":00" : time}`;
	const ms = Date.parse(local + "+07:00");
	if (!Number.isFinite(ms) || new Date(ms + 252e5).toISOString().slice(0, 19) !== local) return null;
	return local + "+07:00";
}
function hasSlipTransferTime(value) {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function slipTransferDraft(value) {
	if (!hasSlipTransferTime(value)) return {
		date: /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "",
		time: ""
	};
	const local = new Date(Date.parse(value) + 252e5).toISOString();
	return {
		date: local.slice(0, 10),
		time: local.slice(11, 19)
	};
}
function formatSlipTransfer(value) {
	if (!value) return null;
	if (!hasSlipTransferTime(value)) return `${value} · ยังไม่มีเวลาโอน`;
	return new Intl.DateTimeFormat("th-TH", {
		timeZone: "Asia/Bangkok",
		dateStyle: "medium",
		timeStyle: "medium",
		hour12: false
	}).format(new Date(value));
}
async function extractEvidence(proofId) {
	if (isPreviewRuntime()) throw new Error("preview");
	const response = await fetch("/v1/admin/payments/review", {
		method: "POST",
		credentials: "include",
		cache: "no-store",
		headers: {
			"content-type": "application/json",
			accept: "application/json"
		},
		body: JSON.stringify({
			action: "extract_evidence",
			proof_id: proofId
		})
	});
	const body = await response.json().catch(() => null);
	if (!response.ok || body?.ok !== true || body.action !== "extract_evidence" || body.proof_id !== proofId || body.money_truth_changed !== false || body.evidence_changed !== false) throw new Error("extraction_unconfirmed");
	const value = body.result;
	return {
		amount: typeof value?.amount_thb === "number" && Number.isFinite(value.amount_thb) && value.amount_thb > 0 && value.amount_thb <= 1e9 ? value.amount_thb : null,
		paidAt: typeof value?.paid_at === "string" && hasSlipTransferTime(value.paid_at) ? value.paid_at : "",
		reference: typeof value?.payment_ref === "string" ? value.payment_ref : "",
		warning: !!body.extraction_error
	};
}
var EvidenceCorrectionError = class extends Error {
	code;
	uncertain;
	constructor(code, uncertain = false) {
		super(code);
		this.code = code;
		this.uncertain = uncertain;
	}
};
async function correctEvidence(input) {
	if (isPreviewRuntime()) throw new EvidenceCorrectionError("preview");
	let response;
	try {
		response = await fetch("/v1/admin/payments/review", {
			method: "POST",
			credentials: "include",
			cache: "no-store",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
				"Idempotency-Key": input.idempotency_key
			},
			body: JSON.stringify(input)
		});
	} catch {
		throw new EvidenceCorrectionError("network", true);
	}
	const body = await response.json().catch(() => null);
	if (!response.ok || body?.ok !== true || body.action !== "correct_evidence" || body.proof_id !== input.proof_id || body.correction_receipt !== input.idempotency_key || body.money_truth_changed !== false) {
		const code = typeof body?.error === "string" ? body.error : "unconfirmed";
		throw new EvidenceCorrectionError(code, ![
			"evidence_snapshot_changed",
			"existing_evidence_value_locked",
			"evidence_already_complete",
			"payment_proof_not_reviewable",
			"evidence_reference_invalid",
			"evidence_amount_invalid",
			"evidence_correction_confirmation_required",
			"evidence_correction_forbidden",
			"payment_proof_datetime_missing",
			"evidence_correction_key_conflict"
		].includes(code) && response.status !== 401 && response.status !== 403);
	}
}
function EvidenceCorrectionForm(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceCorrectionDraft, { ...props }, props.proofId);
}
function EvidenceCorrectionDraft({ proofId, reference, amount, paidAt, onSaved, onRefresh }) {
	const [ref, setRef] = (0, import_react.useState)(reference);
	const [value, setValue] = (0, import_react.useState)(amount === null ? "" : String(amount));
	const initialTime = slipTransferDraft(paidAt);
	const [date, setDate] = (0, import_react.useState)(initialTime.date);
	const [time, setTime] = (0, import_react.useState)(initialTime.time);
	const paidTimestamp = slipTransferIso(date, time);
	const [reason, setReason] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [reading, setReading] = (0, import_react.useState)(false);
	const [readMessage, setReadMessage] = (0, import_react.useState)("");
	const request = (0, import_react.useRef)(null);
	const lock = (0, import_react.useRef)(false);
	const autoReadStarted = (0, import_react.useRef)(false);
	const valid = (!ref.trim() || /^[A-Za-z0-9][A-Za-z0-9._/ -]{2,179}$/.test(ref.trim())) && !!paidTimestamp && /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= 1e9;
	const frozen = busy || reading || !!error;
	const field = "mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-[15px] disabled:opacity-60";
	const readSlip = (0, import_react.useCallback)(async () => {
		if (lock.current || frozen) return;
		lock.current = true;
		setReading(true);
		setReadMessage("");
		try {
			const result = await extractEvidence(proofId);
			if (!value && amount === null && result.amount !== null) setValue(String(result.amount));
			if (!ref && !reference && result.reference) setRef(result.reference);
			if (!hasSlipTransferTime(paidAt) && date === initialTime.date && time === initialTime.time && result.paidAt) {
				const draft = slipTransferDraft(result.paidAt);
				setDate(draft.date);
				setTime(draft.time);
			}
			setReadMessage(result.warning || result.amount === null || !result.paidAt ? "อ่านได้บางส่วน ตรวจข้อมูลจากภาพ แล้วเติมช่องที่ยังว่างได้เลย" : "อ่านภาพแล้ว ตรวจยอด วันที่ และเวลาให้ตรงกับสลิปก่อนบันทึก ข้อมูลที่คุณกรอกไว้ยังอยู่ครบ");
		} catch {
			setReadMessage("ยังอ่านสลิปไม่สำเร็จ ลองอ่านอีกครั้ง หรือกรอกยอด วันที่ และเวลาตามภาพเพื่อดำเนินการต่อ");
		} finally {
			lock.current = false;
			setReading(false);
		}
	}, [
		proofId,
		frozen,
		value,
		amount,
		ref,
		reference,
		paidAt,
		date,
		time,
		initialTime.date,
		initialTime.time
	]);
	(0, import_react.useEffect)(() => {
		if (autoReadStarted.current || isPreviewRuntime() || amount !== null && hasSlipTransferTime(paidAt)) return;
		autoReadStarted.current = true;
		readSlip();
	}, [
		amount,
		paidAt,
		readSlip
	]);
	async function save() {
		if (lock.current || !valid || error && !error.uncertain) return;
		lock.current = true;
		setBusy(true);
		setError(null);
		request.current ??= {
			action: "correct_evidence",
			proof_id: proofId,
			payment_ref: ref.trim(),
			amount_thb: Number(value),
			paid_at: paidTimestamp,
			admin_reason: reason.trim() ? `ยืนยันข้อมูลตามสลิป: ${reason.trim()}` : "ผู้ดูแลยืนยันยอดเงินและวันเวลาโอนตามภาพสลิป",
			evidence_checked: true,
			expected: {
				payment_ref: reference,
				amount_thb: amount,
				paid_at: paidAt
			},
			idempotency_key: crypto.randomUUID()
		};
		try {
			await correctEvidence(request.current);
			onSaved();
		} catch (e) {
			setError(e instanceof EvidenceCorrectionError ? e : new EvidenceCorrectionError("unconfirmed", true));
		} finally {
			lock.current = false;
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		id: "evidence-correction",
		className: "space-y-3 rounded-xl border border-primary/40 bg-surface p-4",
		"aria-label": "แก้ข้อมูลหลักฐาน",
		"aria-busy": reading,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
				className: "text-[15px] font-semibold",
				children: "แก้ข้อมูลหลักฐานจากสลิปเดิม"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "ตรวจยอดเงิน วันที่ และเวลาโอนตามภาพสลิป กดยืนยันข้อมูลตามสลิปเพื่อบันทึก แล้วอนุมัติเงินต่อในรายการนี้ได้เลย"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: readSlip,
				disabled: frozen || isPreviewRuntime(),
				className: "min-h-11 rounded-lg bg-primary px-4 text-[14px] font-medium text-primary-foreground shadow-sm disabled:opacity-40",
				children: reading ? "กำลังอ่านภาพสลิป…" : "อ่านสลิปเดิมอีกครั้ง"
			}),
			(reading || readMessage) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "text-[13px] text-muted-foreground",
				children: reading ? "กำลังอ่านยอดเงิน วันที่ และเวลาจากภาพสลิปเดิม…" : readMessage
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block text-[14px]",
				children: ["วันที่โอน (ประเทศไทย)", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "date",
					value: date,
					onChange: (e) => setDate(e.target.value),
					disabled: frozen || hasSlipTransferTime(paidAt),
					className: field
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block text-[14px]",
				children: ["เวลาโอน (ประเทศไทย)", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "time",
					step: "1",
					value: time,
					onChange: (e) => setTime(e.target.value),
					disabled: frozen || hasSlipTransferTime(paidAt),
					className: field
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block text-[14px]",
				children: ["ยอดเงินตามสลิป (บาท)", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value,
					onChange: (e) => setValue(e.target.value),
					disabled: frozen || amount !== null,
					inputMode: "decimal",
					className: field
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "text-[14px]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
					className: "cursor-pointer",
					children: "เลขอ้างอิงบนสลิป (ถ้ามี)"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					"aria-label": "เลขอ้างอิงบนสลิป (ไม่บังคับ)",
					value: ref,
					onChange: (e) => setRef(e.target.value),
					disabled: frozen || !!reference,
					maxLength: 180,
					autoComplete: "off",
					className: field
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block text-[14px]",
				children: ["หมายเหตุ (ไม่บังคับ)", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					value: reason,
					onChange: (e) => setReason(e.target.value),
					disabled: frozen,
					maxLength: 600,
					rows: 2,
					className: field
				})]
			}),
			!valid && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "ระบุยอดเงิน วันที่ และเวลาโอนให้ครบ"
			}),
			(!error || error.uncertain) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: save,
				disabled: busy || reading || !valid || isPreviewRuntime(),
				className: "min-h-11 rounded-lg bg-primary px-4 text-[14px] font-medium text-primary-foreground disabled:opacity-40",
				children: busy ? "กำลังบันทึก…" : error?.uncertain ? "ส่งข้อมูลเดิมอีกครั้ง" : "ยืนยันข้อมูลตามสลิป"
			}),
			error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				role: "alert",
				className: "space-y-2 text-[14px]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: error.uncertain ? "ยังยืนยันผลการบันทึกไม่ได้ ตรวจสถานะล่าสุดก่อน หรือส่งข้อมูลเดิมด้วยรหัสคำขอเดิม" : "ระบบไม่รับการแก้ไขนี้ ข้อมูลอาจเปลี่ยนไปหรือยังไม่ครบ กรุณาโหลดรายการล่าสุดก่อน" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onRefresh,
					disabled: busy,
					className: "min-h-11 rounded-lg border border-border px-3",
					children: "โหลดหลักฐานล่าสุด"
				})]
			})
		]
	});
}
var correct = {
	title: "ยังจับคู่รายการชำระไม่ได้",
	description: "ระบบยังระบุไม่ได้ว่าสลิปนี้เป็นเงินของงานไหน หรือค่าสมาชิกประเภทใด",
	steps: ["เลือกประเภทเงิน แล้วระบุงานหรือสมาชิกให้ตรงกับสลิป", "ตรวจข้อมูลและหลักฐานอีกครั้งก่อนกดยืนยัน"],
	recovery: "correct",
	actionLabel: "แก้ข้อมูลการชำระ"
};
var refresh = {
	title: "ต้องตรวจข้อมูลล่าสุดก่อน",
	description: "ข้อมูลหลักฐานกับรายการรับเงินไม่ตรงกัน หรือรายการอาจเปลี่ยนไปแล้ว",
	steps: ["โหลดสถานะล่าสุด แล้วตรวจเลขอ้างอิง งาน และยอดในสลิป", "หากยังไม่ตรง ให้บันทึกปัญหาข้อมูลแทนการอนุมัติ"],
	recovery: "refresh",
	actionLabel: "โหลดสถานะล่าสุด"
};
var correctionCodes = /* @__PURE__ */ new Set([
	"operator_context_auto_match_not_resolved",
	"operator_context_auto_match_ambiguous",
	"operator_context_payment_stage_required",
	"operator_context_session_required",
	"operator_context_session_not_found",
	"operator_context_payment_stage_invalid",
	"operator_context_member_email_required",
	"operator_context_member_not_found",
	"operator_context_package_required",
	"client_provenance_required",
	"session_provenance_required",
	"provenance_required"
]);
var refreshCodes = /* @__PURE__ */ new Set([
	"operator_context_stage_mismatch",
	"operator_context_session_mismatch",
	"operator_context_member_mismatch",
	"operator_context_package_mismatch",
	"operator_context_requires_verified_money_evidence",
	"operator_context_session_ambiguous",
	"operator_context_member_ambiguous",
	"canonical_payment_context_missing",
	"canonical_session_context_missing",
	"canonical_payment_ambiguous",
	"canonical_payment_reference_mismatch",
	"canonical_payment_amount_mismatch",
	"payment_context_mismatch",
	"amount_mismatch",
	"context_mismatch",
	"proof_not_found",
	"payment_proof_not_found",
	"proof_not_pending",
	"proof_not_reviewable",
	"payment_proof_not_reviewable",
	"payment_not_pending",
	"already_reviewed",
	"idempotency_key_conflict",
	"idempotency_conflict",
	"review_context_unavailable"
]);
/** Only known preflight failures can unlock editing; unknown outcomes retain the same request. */
function paymentReviewErrorHelp(error) {
	if (error.status === 401 || error.code === "unauthorized") return {
		title: "เซสชันผู้ดูแลหมดอายุ",
		description: "ระบบยังตรวจสิทธิ์ของคำขอนี้ไม่ได้",
		steps: ["เข้าสู่ระบบใหม่ แล้วเปิดรายการนี้เพื่อตรวจสถานะก่อนดำเนินการต่อ"],
		recovery: "login",
		actionLabel: "เข้าสู่ระบบใหม่"
	};
	if (error.status === 403 || error.code === "forbidden") return {
		title: "บัญชีนี้ยังไม่มีสิทธิ์ตัดสินรายการ",
		description: "ต้องใช้บัญชีผู้ดูแลที่มีสิทธิ์ตรวจรับเงิน",
		steps: ["ให้ผู้ดูแลตรวจสิทธิ์บัญชีนี้ก่อนดำเนินการต่อ"],
		recovery: "blocked",
		actionLabel: ""
	};
	if (error.code === "payment_proof_reference_missing" || error.code === "payment_proof_amount_missing" || error.code === "payment_proof_datetime_missing") return {
		title: error.code === "payment_proof_amount_missing" ? "สลิปยังไม่มียอดเงินที่ตรวจสอบได้" : "ตรวจวันที่และเวลาโอนจากสลิป",
		description: "ระบบหยุดก่อนอนุมัติ เพราะข้อมูลหลักฐานยังไม่ครบ การส่งคำขอเดิมซ้ำจะไม่แก้ข้อมูลนี้",
		steps: ["เปิดแก้ข้อมูลหลักฐาน แล้วตรวจยอดเงิน วันที่ และเวลาโอน · เลขอ้างอิงและ QR ไม่บังคับ", "หากยังไม่ผูกลูกค้า ให้ไปผูกลูกค้าและงานของสลิปนี้ก่อน แล้วกลับมาตรวจรายการเดิม"],
		recovery: "blocked",
		actionLabel: ""
	};
	if (correctionCodes.has(error.code || "")) return error.code === "operator_context_auto_match_ambiguous" ? {
		...correct,
		title: "พบมากกว่าหนึ่งรายการที่อาจตรงกัน",
		description: "ระบบยังเลือกงานหรือสมาชิกที่ถูกต้องจากข้อมูลนี้ไม่ได้"
	} : correct;
	if (refreshCodes.has(error.code || "")) return refresh;
	if (error.code === "operator_context_package_requires_special_review") return {
		title: "แพ็กเกจนี้ต้องตรวจข้อตกลงเพิ่มเติม",
		description: "รายการนี้ยังใช้การจับคู่สมาชิกแบบทั่วไปไม่ได้",
		steps: ["ให้ผู้ดูแลตรวจแพ็กเกจและข้อตกลงจริงก่อนดำเนินการต่อ"],
		recovery: "blocked",
		actionLabel: ""
	};
	if (error.code === "preview_write_blocked") return {
		title: "หน้านี้เป็นตัวอย่าง",
		description: "หน้าตัวอย่างไม่ส่งผลการตัดสินไปยังระบบจริง",
		steps: ["เปิด Money Control จากเว็บไซต์จริงเพื่อทำรายการ"],
		recovery: "blocked",
		actionLabel: ""
	};
	return {
		title: "ยังยืนยันผลการบันทึกไม่ได้",
		description: "การเชื่อมต่อหรือระบบรับเงินตอบกลับไม่ครบ จึงยังสรุปไม่ได้ว่าบันทึกสำเร็จหรือไม่",
		steps: ["ตรวจสถานะล่าสุดก่อน หากยังไม่มีผล สามารถส่งคำขอเดิมอีกครั้งได้", "ระบบจะใช้ข้อมูลและรหัสคำขอเดิม ไม่สร้างคำขอใหม่"],
		recovery: "retry",
		actionLabel: "ส่งคำขอเดิมอีกครั้ง"
	};
}
var emptyPaymentContext = () => ({
	kind: "",
	stage: "",
	sessionId: "",
	memberEmail: "",
	packageCode: ""
});
var stages = /* @__PURE__ */ new Set([
	"deposit",
	"final",
	"full",
	"tips"
]);
var packages = /* @__PURE__ */ new Set([
	"mmd_member",
	"elite",
	"red_card",
	"standard",
	"premium"
]);
function paymentContextFields(draft) {
	if (draft.kind === "service") {
		const missing = [];
		if (!stages.has(draft.stage)) missing.push("ประเภทเงิน");
		if (!draft.sessionId.trim() || draft.sessionId.trim().length > 180) missing.push("เลขงาน / Session ID");
		return {
			missing,
			context: missing.length ? null : {
				payment_stage: draft.stage,
				session_id: draft.sessionId.trim()
			}
		};
	}
	if (draft.kind === "membership") {
		const missing = [];
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.memberEmail.trim())) missing.push("อีเมลสมาชิก");
		if (!packages.has(draft.packageCode)) missing.push("แพ็กเกจสมาชิก");
		return {
			missing,
			context: missing.length ? null : {
				payment_stage: "membership",
				member_email: draft.memberEmail.trim().toLowerCase(),
				package_code: draft.packageCode
			}
		};
	}
	return {
		context: null,
		missing: ["สลิปนี้ชำระค่าอะไร"]
	};
}
function ReviewErrorHelp({ error, onCorrect, onRefresh, busy = false }) {
	const help = paymentReviewErrorHelp(error);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		role: "alert",
		className: "space-y-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-[14px]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
				className: "font-semibold text-foreground",
				children: help.title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-foreground",
				children: help.description
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "list-decimal space-y-1 pl-5 text-muted-foreground",
				children: help.steps.map((step) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: step }, step))
			}),
			help.recovery === "correct" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				disabled: busy,
				onClick: onCorrect,
				className: "min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-40",
				children: help.actionLabel
			}),
			(help.recovery === "refresh" || help.recovery === "retry") && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				disabled: busy,
				onClick: onRefresh,
				className: "min-h-11 rounded-lg border border-border bg-surface px-4 font-medium disabled:opacity-40",
				children: "โหลดสถานะล่าสุด"
			}),
			help.recovery === "login" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
				href: "/internal/admin/login?next=%2Finternal%2Fadmin%2Fpayments",
				className: "inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground",
				children: help.actionLabel
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "text-[13px] text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
					className: "cursor-pointer",
					children: "รายละเอียดทางเทคนิค"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "break-all font-mono",
					children: [
						"รหัส: ",
						error.code && /^[a-z0-9_]{1,160}$/.test(error.code) ? error.code : "ไม่ระบุ",
						" · HTTP: ",
						error.status || "ไม่มีคำตอบ"
					]
				})]
			})
		]
	});
}
function PaymentContextForm({ value, onChange, disabled = false, onClientVerified }) {
	const update = (key, next) => onChange({
		...value,
		[key]: next
	});
	const { missing } = paymentContextFields(value);
	const field = "mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-[15px]";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", {
		id: "payment-context-correction",
		tabIndex: -1,
		disabled,
		className: "space-y-3 rounded-xl border border-primary/40 bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", {
				className: "px-1 text-[15px] font-semibold",
				children: "แก้ข้อมูลการชำระ"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "ใช้ข้อมูลของงานหรือสมาชิกที่ตรวจแล้วเท่านั้น ระบบจะตรวจว่ามีรายการจริงและข้อมูลตรงกันอีกครั้งก่อนบันทึก"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block text-[14px]",
				children: [
					"สลิปนี้ชำระค่าอะไร ",
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						children: "*"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						autoFocus: true,
						required: true,
						"aria-required": true,
						value: value.kind,
						onChange: (e) => update("kind", e.target.value),
						className: field,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "เลือกประเภท"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "service",
								children: "งานบริการ"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "membership",
								children: "สมาชิก / ต่ออายุสมาชิก"
							})
						]
					})
				]
			}),
			value.kind === "service" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block text-[14px]",
					children: [
						"ประเภทเงิน ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: "*"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							required: true,
							"aria-required": true,
							value: value.stage,
							onChange: (e) => update("stage", e.target.value),
							className: field,
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "",
									children: "เลือกประเภทเงิน"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "deposit",
									children: "มัดจำ / ค่าจอง"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "final",
									children: "ยอดคงเหลือ / จบงาน"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "full",
									children: "ชำระเต็มจำนวน"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "tips",
									children: "ทิป"
								})
							]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block text-[14px]",
					children: [
						"เลขงาน / Session ID ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: "*"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							required: true,
							"aria-required": true,
							maxLength: 180,
							value: value.sessionId,
							onChange: (e) => update("sessionId", e.target.value),
							className: field,
							placeholder: "เลขงานที่ตรงกับหลักฐานนี้"
						})
					]
				}),
				value.sessionId.trim() && onClientVerified && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerIdentityAction, {
					sessionId: value.sessionId.trim(),
					onVerified: onClientVerified
				}, value.sessionId.trim()),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: "/internal/admin/jobs/all",
					target: "_blank",
					rel: "noopener noreferrer",
					className: "inline-flex min-h-11 items-center text-primary underline",
					children: "ค้นเลขงานในงานทั้งหมด ↗"
				})
			] }),
			value.kind === "membership" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block text-[14px]",
				children: [
					"อีเมลสมาชิก ",
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						children: "*"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						required: true,
						"aria-required": true,
						type: "email",
						value: value.memberEmail,
						onChange: (e) => update("memberEmail", e.target.value),
						className: field,
						autoComplete: "off"
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block text-[14px]",
				children: [
					"แพ็กเกจสมาชิก ",
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						children: "*"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						required: true,
						"aria-required": true,
						value: value.packageCode,
						onChange: (e) => update("packageCode", e.target.value),
						className: field,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "เลือกแพ็กเกจ"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "mmd_member",
								children: "MMD Member"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "elite",
								children: "Elite"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "red_card",
								children: "Red Card"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "standard",
								children: "Private Standard"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "premium",
								children: "Private Premium"
							})
						]
					})
				]
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "text-[13px] text-muted-foreground",
				children: missing.length ? `ยังต้องระบุ: ${missing.join(" · ")}` : "ข้อมูลครบแล้ว ตรวจหลักฐานและเลือก Approve อีกครั้งเพื่อยืนยัน"
			})
		]
	});
}
var QK = ["review-queue", "context"];
var F = {
	id: ["proof_id", "id"],
	customer: [
		"client_display",
		"per_rename",
		"remembered_name",
		"client_name",
		"customer_name"
	],
	stage: ["payment_stage", "stage"],
	status: ["status", "proof_status"],
	channel: [
		"source_channel",
		"channel",
		"source"
	],
	expected: ["expected_amount_thb", "expected_amount"],
	proof: [
		"evidence_amount_thb",
		"proof_amount_thb",
		"amount_thb",
		"amount"
	],
	job: [
		"job_ref",
		"session_ref",
		"session_id",
		"job_id"
	],
	paymentRef: ["payment_ref"],
	received: ["received_at", "created_at"],
	paid: ["paid_at", "transfer_at"],
	extraction: ["extraction_status", "ocr_status"],
	issues: ["extraction_issues", "issues"]
};
/** Flatten include_context payloads (e.g. record.context.*) into one scalar view. */
function flat(r) {
	const out = { ...r };
	for (const [k, v] of Object.entries(r)) if (v && typeof v === "object" && !Array.isArray(v)) {
		for (const [k2, v2] of Object.entries(v)) if (!(k2 in out)) out[k2] = v2;
	}
	return out;
}
var thb = (v) => {
	if (!v) return null;
	const n = Number(v);
	return Number.isFinite(n) ? `฿${n.toLocaleString("en-US")}` : v;
};
var LABEL = {
	approve: "Approve",
	issue: "บันทึกปัญหาข้อมูล",
	reject: "Reject"
};
var Evidence = ({ proofId }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceViewer, { proofId });
function Row({ k, v }) {
	if (!v) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-w-0 justify-between gap-3 text-[14px]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
			className: "shrink-0 text-muted-foreground",
			children: k
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
			className: "min-w-0 break-words text-right",
			children: v
		})]
	});
}
function Detail({ record, onClose, onDone, onRefresh }) {
	const r = flat(record);
	const proofId = pick(r, F.id);
	const [reason, setReason] = (0, import_react.useState)("");
	const [pending, setPending] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [err, setErr] = (0, import_react.useState)(null);
	const keyRef = (0, import_react.useRef)(null);
	const requestRef = (0, import_react.useRef)(null);
	const inFlight = (0, import_react.useRef)(false);
	const [correcting, setCorrecting] = (0, import_react.useState)(false);
	const [contextDraft, setContextDraft] = (0, import_react.useState)(emptyPaymentContext);
	const contextFields = paymentContextFields(contextDraft);
	const [correctingEvidence, setCorrectingEvidence] = (0, import_react.useState)(false);
	const [verifiedClientSession, setVerifiedClientSession] = (0, import_react.useState)(null);
	const needsClientBinding = !hasLinkedCustomer(pick(r, ["client_record_id", "client_id"]));
	const evidenceMissing = !(Number(pick(r, F.proof)) > 0) || !pick(r, F.paymentRef) && !hasSlipTransferTime(pick(r, F.paid));
	const serviceClientMissing = correcting && contextDraft.kind === "service" && verifiedClientSession !== contextDraft.sessionId.trim();
	const approvalBlocked = evidenceMissing || !correcting && needsClientBinding || correcting && (!contextFields.context || serviceClientMissing);
	const openClientBinding = () => {
		if (inFlight.current || uncertain) return;
		keyRef.current = null;
		requestRef.current = null;
		setPending(null);
		setErr(null);
		setCorrecting(true);
		setContextDraft({
			...emptyPaymentContext(),
			kind: "service",
			sessionId: pick(r, F.job) ?? ""
		});
		setVerifiedClientSession(null);
	};
	const help = err ? paymentReviewErrorHelp(err) : null;
	const uncertain = help?.recovery === "retry";
	const preview = isPreviewRuntime();
	const reasonLen = reason.replace(/\s/g, "").length;
	const reasonOk = pending === "approve" || reasonLen > 0;
	const choose = (d) => {
		if (inFlight.current || uncertain || d === "approve" && approvalBlocked) return;
		requestRef.current = null;
		if (keyRef.current?.decision !== d) keyRef.current = {
			decision: d,
			key: crypto.randomUUID()
		};
		setErr(null);
		setPending(d);
	};
	const submit = async () => {
		if (inFlight.current || !pending || !proofId || !reasonOk || !keyRef.current || pending === "approve" && approvalBlocked) return;
		inFlight.current = true;
		setBusy(true);
		setErr(null);
		try {
			requestRef.current ??= {
				proof_id: proofId,
				decision: pending,
				admin_reason: pending === "approve" ? reason.trim() ? `อนุมัติหลังตรวจสลิป: ${reason.trim()}` : "ผู้ดูแลตรวจสลิปและยืนยันอนุมัติเงิน" : `เหตุผลผู้ดูแล: ${reason.trim()}`,
				idempotency_key: keyRef.current.key,
				...pending === "approve" && correcting ? contextFields.context : {}
			};
			const res = await submitPaymentReview(requestRef.current);
			keyRef.current = null;
			onDone(res);
		} catch (e) {
			setErr(e instanceof ReviewError ? e : new ReviewError(null, 0));
		} finally {
			inFlight.current = false;
			setBusy(false);
		}
	};
	const correctContext = () => {
		if (help?.recovery !== "correct" || inFlight.current) return;
		keyRef.current = null;
		requestRef.current = null;
		setPending(null);
		setErr(null);
		setCorrecting(true);
	};
	const internal = safeEntries(r).filter(([k]) => /proof_id|payment_ref|^id$/.test(k));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center justify-between gap-2 border-b border-border px-4 py-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "min-w-0 truncate text-[16px] font-semibold",
				children: pick(r, F.customer) ?? "ยังไม่ผูกลูกค้า"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: onClose,
				"aria-label": "ปิด",
				className: "grid h-11 w-11 place-items-center rounded-md hover:bg-surface-2",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-5 w-5" })
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex-1 space-y-4 overflow-y-auto px-4 py-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
					className: "space-y-1.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							k: "Payment stage",
							v: pick(r, F.stage)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							k: "สถานะ",
							v: pick(r, F.status)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							k: "ยอดที่คาดไว้",
							v: thb(pick(r, F.expected))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							k: "ยอดในสลิป",
							v: thb(pick(r, F.proof))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							k: "งาน / Session",
							v: pick(r, F.job)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							k: "รับเมื่อ",
							v: pick(r, F.received)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							k: "โอนเมื่อ (เวลาไทย)",
							v: formatSlipTransfer(pick(r, F.paid))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							k: "การอ่านสลิป",
							v: pick(r, F.extraction)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							k: "ประเด็น",
							v: pick(r, F.issues)
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(JobSlipSummary, {
					sessionId: correcting && contextDraft.kind === "service" ? contextDraft.sessionId.trim() : pick(r, ["session_id"]) ?? "",
					draft: correcting && contextDraft.kind === "service"
				}),
				proofId && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Evidence, { proofId }),
				(evidenceMissing || !pick(r, F.paymentRef)) && proofId && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-3",
					children: [!correctingEvidence && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: busy || uncertain,
						onClick: () => {
							setCorrectingEvidence(true);
							setErr(null);
							setPending(null);
							keyRef.current = null;
							requestRef.current = null;
						},
						className: "min-h-11 rounded-lg bg-primary px-4 text-[14px] font-medium text-primary-foreground disabled:opacity-40",
						children: "แก้ข้อมูลหลักฐาน"
					}), correctingEvidence && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceCorrectionForm, {
						proofId,
						reference: pick(r, F.paymentRef) || "",
						amount: Number(pick(r, F.proof)) > 0 ? Number(pick(r, F.proof)) : null,
						paidAt: pick(r, F.paid) || "",
						onSaved: () => {
							setCorrectingEvidence(false);
							onRefresh();
						},
						onRefresh: () => {
							onClose();
							onRefresh();
						}
					})]
				}),
				needsClientBinding && !correcting && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "space-y-2 rounded-xl border border-primary/40 bg-surface p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[14px]",
						children: "ยังไม่พบลูกค้าที่ผูกกับสลิปนี้ เลือกงานแล้วตรวจลูกค้าก่อนดำเนินการต่อ"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: openClientBinding,
						disabled: busy || uncertain,
						className: "min-h-11 rounded-lg bg-primary px-4 text-[14px] font-medium text-primary-foreground disabled:opacity-40",
						children: "ไปผูกลูกค้า / งานกับสลิปนี้"
					})]
				}),
				internal.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
					className: "rounded-lg border border-border px-3 py-2 text-[13px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
						className: "cursor-pointer text-muted-foreground",
						children: "อ้างอิงภายใน"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", {
						className: "mt-2 space-y-1",
						children: internal.map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							k: humanKey(k),
							v
						}, k))
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "space-y-3 rounded-xl border border-gold/40 bg-gold-muted p-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "block text-[14px] font-medium",
							htmlFor: "review-reason",
							children: "หมายเหตุ (ไม่บังคับสำหรับ Approve)"
						}),
						correcting && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaymentContextForm, {
							value: contextDraft,
							onChange: (value) => {
								setContextDraft(value);
								if (value.sessionId.trim() !== contextDraft.sessionId.trim()) setVerifiedClientSession(null);
							},
							onClientVerified: setVerifiedClientSession,
							disabled: busy || uncertain
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							id: "review-reason",
							disabled: busy || uncertain,
							value: reason,
							onChange: (e) => setReason(e.target.value),
							rows: 3,
							className: "w-full rounded-md border border-border bg-background px-3 py-2 text-[15px]"
						}),
						pending !== "approve" && reasonLen === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] text-muted-foreground",
							children: "ระบุเหตุผลเฉพาะเมื่อบันทึกปัญหาหรือ Reject"
						}),
						evidenceMissing && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							role: "status",
							className: "text-[14px] text-warn",
							children: "ยังอนุมัติไม่ได้: ตรวจยอดเงินและวันที่–เวลาโอนให้ครบ โดยกดแก้ข้อมูลหลักฐาน เลขอ้างอิงและ QR ไม่บังคับ"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid grid-cols-3 gap-2",
							children: [
								"approve",
								"issue",
								"reject"
							].map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: d !== "approve" && reasonLen === 0 || !proofId || busy || uncertain || !!err || correctingEvidence || d === "approve" && approvalBlocked,
								onClick: () => choose(d),
								"aria-pressed": pending === d,
								className: `min-h-12 rounded-md border px-2 text-[14px] font-medium disabled:opacity-40 ${pending === d ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"}`,
								children: LABEL[d]
							}, d))
						}),
						pending && (!err || uncertain) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-2 rounded-lg border border-border bg-surface p-3",
							role: "region",
							"aria-label": "ยืนยันการตัดสิน",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[14px]",
									children: "ตรวจหลักฐานและข้อมูลให้ถูกต้องก่อนยืนยัน ระบบจะบันทึกผลการตัดสินนี้"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-[13px] text-muted-foreground",
									children: ["การตัดสิน: ", LABEL[pending]]
								}),
								preview && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[13px] text-warn",
									children: "หน้าตัวอย่าง · ปุ่มส่งปิดอยู่"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: submit,
										disabled: busy || preview || !reasonOk,
										className: "min-h-12 flex-1 rounded-md bg-primary px-3 text-[15px] font-medium text-primary-foreground disabled:opacity-40",
										children: busy ? "กำลังส่ง…" : uncertain ? "ส่งคำขอเดิมอีกครั้ง" : `ส่ง ${LABEL[pending]}`
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => setPending(null),
										disabled: busy || uncertain,
										className: "min-h-12 rounded-md border border-border px-3 text-[14px]",
										children: "ยกเลิก"
									})]
								})
							]
						}),
						err && help?.recovery === "blocked" && ["payment_proof_reference_missing", "payment_proof_amount_missing"].includes(err.code || "") && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => choose("issue"),
							disabled: busy || reasonLen === 0,
							className: "min-h-11 rounded-lg border border-border px-4 text-[14px]",
							children: "บันทึกปัญหาข้อมูล"
						}),
						err && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewErrorHelp, {
							error: err,
							onCorrect: correctContext,
							onRefresh: () => {
								if (help?.recovery === "refresh") onClose();
								onRefresh();
							},
							busy
						})
					]
				})
			]
		})]
	});
}
function ReviewDesk({ focusProofId }) {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: QK,
		queryFn: ({ signal }) => fetchReviewQueueWithContext(signal),
		retry: false
	});
	const [open, setOpen] = (0, import_react.useState)(null);
	const [text, setText] = (0, import_react.useState)("");
	const [filters, setFilters] = (0, import_react.useState)({});
	const [receipt, setReceipt] = (0, import_react.useState)(null);
	const [submitted, setSubmitted] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
	const [focusMissing, setFocusMissing] = (0, import_react.useState)(false);
	const focused = (0, import_react.useRef)(false);
	const items = (0, import_react.useMemo)(() => {
		const rows = (q.data?.items ?? []).map(flat);
		const t = (r) => {
			const n = Date.parse(pick(r, F.received) ?? "");
			return Number.isNaN(n) ? -Infinity : n;
		};
		return rows.map((r, i) => ({
			r,
			i
		})).sort((a, b) => t(b.r) - t(a.r) || a.i - b.i).map((x) => x.r);
	}, [q.data]);
	const latestReceived = (0, import_react.useMemo)(() => {
		const v = items.length ? pick(items[0], F.received) : null;
		const n = v ? Date.parse(v) : NaN;
		return Number.isNaN(n) ? null : new Date(n).toLocaleString("th-TH", {
			dateStyle: "medium",
			timeStyle: "short"
		});
	}, [items]);
	(0, import_react.useEffect)(() => {
		if (!focusProofId || focused.current || !q.data) return;
		focused.current = true;
		if (items.find((r) => pick(r, F.id) === focusProofId)) setOpen(focusProofId);
		else setFocusMissing(true);
	}, [
		focusProofId,
		items,
		q.data
	]);
	const facets = (0, import_react.useMemo)(() => {
		const out = [];
		for (const [label, keys] of [
			["สถานะ", F.status],
			["Stage", F.stage],
			["ช่องทาง", F.channel]
		]) {
			const vals = [...new Set(items.map((r) => pick(r, [...keys])).filter((v) => !!v))];
			if (vals.length > 1) out.push([label, vals]);
		}
		return out;
	}, [items]);
	const facetKeys = {
		สถานะ: F.status,
		Stage: F.stage,
		ช่องทาง: F.channel
	};
	const shown = items.filter((r) => {
		for (const [f, v] of Object.entries(filters)) if (v && pick(r, facetKeys[f]) !== v) return false;
		if (!text.trim()) return true;
		const t = text.trim().toLowerCase();
		return safeEntries(r).some(([, v]) => v.toLowerCase().includes(t));
	});
	const current = open ? items.find((r) => pick(r, F.id) === open) : void 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "space-y-3",
		children: [
			receipt && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				role: "status",
				className: "flex items-start justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[14px]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "font-medium",
							children: ["ระบบหลังบ้านตอบรับคำขอ", receipt.status ? ` · ${receipt.status}` : ""]
						}),
						receipt.message && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "break-words",
							children: receipt.message
						}),
						receipt.receipt && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
							className: "text-[13px] text-muted-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
								className: "cursor-pointer",
								children: "ใบรับจากระบบ"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "break-all font-mono",
								children: receipt.receipt
							})]
						}),
						q.isFetching && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] text-muted-foreground",
							children: "กำลังโหลดคิวใหม่…"
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setReceipt(null),
					"aria-label": "ปิดข้อความ",
					className: "grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-surface-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
				})]
			}),
			focusMissing && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[14px]",
				children: "ไม่พบหลักฐานนี้ในคิวปัจจุบัน · อาจถูกตรวจไปแล้วหรืออยู่นอกคิว"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(JobSlipSummary, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveState, {
				pending: q.isPending,
				error: q.error,
				children: items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[15px] text-muted-foreground",
					children: "ยังไม่มีหลักฐานที่รอตรวจจากระบบหลังบ้าน"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						role: "status",
						className: "text-[14px] text-muted-foreground",
						children: [
							items.length,
							" รายการ · ",
							latestReceived ? `รายการล่าสุดที่ระบบได้รับ: ${latestReceived}` : "ระบบไม่ได้ส่งวันที่รับสลิปมา"
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: text,
							onChange: (e) => setText(e.target.value),
							placeholder: "ค้นในรายการที่โหลดมา",
							"aria-label": "ค้นหาในคิว",
							className: "h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-[15px]"
						}), facets.map(([label, vals]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							"aria-label": label,
							value: filters[label] ?? "",
							onChange: (e) => setFilters((f) => ({
								...f,
								[label]: e.target.value
							})),
							className: "h-11 rounded-md border border-border bg-surface px-2 text-[14px]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
								value: "",
								children: [label, ": ทั้งหมด"]
							}), vals.map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: v,
								children: v
							}, v))]
						}, label))]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "space-y-2",
						children: shown.map((r, i) => {
							const id = pick(r, F.id);
							const exp = thb(pick(r, F.expected));
							const got = thb(pick(r, F.proof));
							const stillListed = !!id && submitted.has(id);
							return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								disabled: !id,
								onClick: () => id && setOpen(id),
								className: "min-h-11 w-full min-w-0 rounded-xl border border-border bg-surface p-3 text-left hover:bg-surface-2 disabled:opacity-60",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-start justify-between gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "min-w-0 break-words text-[15px] font-semibold",
											children: pick(r, F.customer) ?? "ยังไม่ผูกลูกค้า"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "flex shrink-0 flex-wrap justify-end gap-1",
											children: [
												stillListed && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[12px] text-warn",
													children: "ส่งแล้ว · รอระบบอัปเดต"
												}),
												slipSourceLabel(pick(r, F.channel)) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "rounded-full border border-primary/40 px-2 py-0.5 text-[12px] text-primary",
													children: slipSourceLabel(pick(r, F.channel))
												}),
												pick(r, F.status) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "rounded-full border border-gold/40 px-2 py-0.5 text-[13px] text-muted-foreground",
													children: pick(r, F.status)
												})
											]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-1 grid grid-cols-2 gap-x-3 text-[14px]",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-muted-foreground",
											children: "คาดไว้ "
										}), exp ?? "—"] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-muted-foreground",
											children: "สลิป "
										}), got ?? "—"] })]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 break-words text-[13px] text-muted-foreground",
										children: [
											pick(r, F.stage),
											pick(r, F.received),
											pick(r, F.job)
										].filter(Boolean).join(" · ")
									})
								]
							}) }, id ?? i);
						})
					})
				] })
			}),
			current && open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "fixed inset-0 z-50 flex justify-end bg-background/60",
				onClick: () => setOpen(null),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					role: "dialog",
					"aria-modal": "true",
					"aria-label": "ตรวจหลักฐาน",
					onClick: (e) => e.stopPropagation(),
					className: "mt-auto h-[92dvh] w-full rounded-t-2xl border border-border bg-background sm:mt-0 sm:h-dvh sm:max-w-lg sm:rounded-none sm:border-y-0 sm:border-r-0",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Detail, {
						record: current,
						onClose: () => setOpen(null),
						onRefresh: () => {
							q.refetch();
							qc.invalidateQueries({ queryKey: ["review-queue", "job-slip-summary"] });
						},
						onDone: (res) => {
							const id = open;
							setReceipt(res);
							setOpen(null);
							setSubmitted((s) => new Set(s).add(id));
							qc.invalidateQueries({ queryKey: ["review-queue"] });
							qc.removeQueries({ queryKey: ["evidence", id] });
						}
					}, open)
				})
			})
		]
	});
}
function errorText(status, code, message) {
	if (message) return message;
	if (code === "too_short") return "วางบันทึกให้ยาวกว่านี้หน่อย";
	if (code === "too_long") return "บันทึกยาวเกิน 30,000 ตัวอักษร ตัดเฉพาะช่วงที่มี error";
	if (status === 429) return "ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่";
	if (status === 402) return "เครดิต AI หมด เติมได้ที่ Settings → Plans & credits";
	return "วิเคราะห์ไม่สำเร็จ ลองใหม่อีกครั้ง";
}
/** Advisory only. Pasted logs → AI explanation; never changes payment state. */
function SlipDiagnosis() {
	const [logs, setLogs] = (0, import_react.useState)("");
	const [answer, setAnswer] = (0, import_react.useState)("");
	const [thinking, setThinking] = (0, import_react.useState)("");
	const [state, setState] = (0, import_react.useState)("idle");
	const [err, setErr] = (0, import_react.useState)("");
	const ctrl = (0, import_react.useRef)(null);
	const run = async () => {
		ctrl.current?.abort();
		const c = new AbortController();
		ctrl.current = c;
		setAnswer("");
		setThinking("");
		setErr("");
		setState("running");
		try {
			const res = await fetch("/api/slip-diagnose", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ logs }),
				signal: c.signal
			});
			if (!res.ok || !res.body) {
				const j = await res.json().catch(() => null);
				setErr(errorText(res.status, j?.error ?? null, j?.message ?? null));
				setState("error");
				return;
			}
			const reader = res.body.getReader();
			const dec = new TextDecoder();
			let buf = "";
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
				const frames = buf.split("\n\n");
				buf = frames.pop() ?? "";
				for (const f of frames) {
					const line = f.split("\n").find((l) => l.startsWith("data:"));
					if (!line) continue;
					const data = line.slice(5).trim();
					if (!data || data === "[DONE]") continue;
					let ev;
					try {
						ev = JSON.parse(data);
					} catch {
						continue;
					}
					if (ev.type === "response.output_text.delta" && ev.delta) setAnswer((a) => a + ev.delta);
					else if (ev.type === "response.reasoning_summary_text.delta" && ev.delta) setThinking((t) => t + ev.delta);
					else if (ev.type === "response.failed" || ev.type === "error") {
						setErr(ev.response?.error?.message ?? "AI หยุดกลางทาง");
						setState("error");
						return;
					}
				}
			}
			setState("done");
		} catch (e) {
			if (c.signal.aborted) setState("stopped");
			else {
				setErr("เชื่อมต่อไม่ได้ ลองใหม่");
				setState("error");
			}
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
		className: "group rounded-2xl border border-border bg-surface",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", {
			className: "flex min-h-14 cursor-pointer list-none items-center gap-2 px-4 text-[16px] font-semibold",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, {
					className: "size-4 text-gold",
					"aria-hidden": true
				}),
				"สลิปไม่เข้า? ให้ AI ช่วยอ่านบันทึก Cloudflare",
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
					className: "ml-auto size-4 transition group-open:rotate-180",
					"aria-hidden": true
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-3 px-4 pb-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[14px] text-muted-foreground",
					children: "คัดลอกบันทึก (Logs) ของตัวรับข้อความ LINE จาก Cloudflare มาวาง · ระบบตัดรหัสลับออกก่อนส่ง · เป็นคำแนะนำเท่านั้น ไม่เปลี่ยนสถานะเงิน"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					value: logs,
					onChange: (e) => setLogs(e.target.value),
					rows: 8,
					maxLength: 3e4,
					"aria-label": "บันทึกจาก Cloudflare",
					placeholder: "วางบันทึกที่นี่…",
					className: "w-full rounded-xl border border-border bg-background p-3 font-mono text-[13px]"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => void run(),
							disabled: state === "running" || logs.trim().length < 20,
							className: "min-h-11 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground disabled:opacity-50",
							children: state === "running" ? "กำลังวิเคราะห์…" : "วิเคราะห์สาเหตุ"
						}),
						state === "running" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => ctrl.current?.abort(),
							className: "min-h-11 rounded-xl border border-border px-4 text-[15px]",
							children: "หยุด"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-[13px] text-muted-foreground",
							children: [logs.length.toLocaleString(), " / 30,000"]
						})
					]
				}),
				state === "running" && !answer && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					role: "status",
					className: "text-[14px] text-muted-foreground",
					children: thinking ? `กำลังคิด: ${thinking.slice(-200)}` : "กำลังอ่านบันทึก…"
				}),
				err && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					role: "alert",
					className: "text-[14px] text-destructive",
					children: err
				}),
				answer && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					"aria-live": "polite",
					className: "whitespace-pre-wrap rounded-xl border border-gold/40 bg-gold-muted p-3 text-[15px] leading-relaxed",
					children: [answer, state === "stopped" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-[13px] text-muted-foreground",
						children: "หยุดแล้ว"
					})]
				})
			]
		})]
	});
}
/** One existing intake request per image. Stop on uncertainty; never retry automatically. */
async function sendSlipQueue(slips, note, onResult) {
	for (const slip of slips) {
		if (slip.result?.ok) continue;
		let result;
		try {
			result = await submitSlipIntake(slip.file, slip.source, note);
		} catch {
			result = {
				ok: false,
				reason: "network",
				code: null
			};
		}
		onResult(slip.id, result);
		if (!result.ok) break;
	}
}
var MAX_BYTES = 10485760;
var TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp"
];
function slipUploadErrorHelp(result) {
	if (result.reason === "unauthorized") return "เซสชันหมดอายุหรือระบบปฏิเสธสิทธิ์ เก็บรูปต้นฉบับไว้แล้วเข้าสู่ระบบใหม่";
	if (result.reason === "preview") return "หน้าตัวอย่างไม่อัปโหลดจริง กรุณาเปิดหน้ารับสลิปจากเว็บไซต์จริง";
	if (result.reason === "not_enabled") return "ช่องทางรับสลิปยังไม่พร้อม รูปที่เลือกยังอยู่ กรุณาโหลดหน้าใหม่ หากยังเกิดซ้ำให้ผู้ดูแลตรวจระบบรับไฟล์";
	if (result.reason === "network") return "การเชื่อมต่อขาด ยังยืนยันไม่ได้ว่ารับไฟล์แล้วหรือไม่ รูปที่เลือกยังอยู่ ลองส่งรูปเดิมอีกครั้งได้ ระบบจะตรวจไฟล์ซ้ำ";
	if (result.code === "unsupported_slip_image_type") return "ไฟล์ชนิดนี้ยังไม่รองรับ กรุณาใช้ภาพ JPG, PNG หรือ WebP";
	if (result.code === "slip_image_too_large") return "รูปใหญ่เกินกำหนด กรุณาลดขนาดให้ไม่เกิน 10MB แล้วเลือกใหม่";
	if (result.code === "private_extractor_binding_missing" || result.code === "historical_evidence_storage_unavailable") return "ระบบอ่านสลิปหรือพื้นที่เก็บไฟล์ส่วนตัวยังไม่พร้อม รูปยังอยู่ ให้ผู้ดูแลตรวจการเชื่อมต่อก่อนลองใหม่";
	if (result.code === "upload_receipt_missing") return "ระบบตอบกลับโดยไม่มีเลขหลักฐาน จึงยังยืนยันการอัปโหลดไม่ได้ รูปยังอยู่ กรุณาตรวจคิวก่อนลองส่งรูปเดิมอีกครั้ง";
	return "ระบบยังยืนยันการรับสลิปไม่ได้ รูปที่เลือกยังอยู่ กรุณาตรวจคิวและรายละเอียดด้านล่างก่อนลองใหม่";
}
/** Multiple independent evidence uploads; payment decisions remain in the review desk. */
function SlipIntakeUpload() {
	const qc = useQueryClient();
	const camRef = (0, import_react.useRef)(null);
	const pickRef = (0, import_react.useRef)(null);
	const [slips, setSlips] = (0, import_react.useState)([]);
	const [note, setNote] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [msg, setMsg] = (0, import_react.useState)(null);
	const inFlight = (0, import_react.useRef)(false);
	const urls = (0, import_react.useRef)(/* @__PURE__ */ new Set());
	const preview = isPreviewRuntime();
	const remaining = slips.filter((s) => !s.result?.ok).length;
	const received = slips.length - remaining;
	(0, import_react.useEffect)(() => () => {
		for (const url of urls.current) URL.revokeObjectURL(url);
	}, []);
	function choose(files, fromCamera) {
		if (!files || inFlight.current) return;
		const accepted = [];
		const errors = [];
		for (const file of Array.from(files)) {
			if (!TYPES.includes(file.type)) {
				errors.push(`${file.name}: ใช้ภาพ JPG, PNG หรือ WebP แทน HEIC/GIF`);
				continue;
			}
			if (!file.size || file.size > MAX_BYTES) {
				errors.push(`${file.name}: ${file.size ? "รูปใหญ่เกิน 10MB" : "ไฟล์รูปว่าง"}`);
				continue;
			}
			const url = URL.createObjectURL(file);
			urls.current.add(url);
			accepted.push({
				id: crypto.randomUUID(),
				file,
				url,
				source: fromCamera ? "cdm_paper" : "line_ofc"
			});
		}
		setSlips((current) => [...current, ...accepted]);
		setMsg(errors.length ? errors.join(" · ") : null);
		if (camRef.current) camRef.current.value = "";
		if (pickRef.current) pickRef.current.value = "";
	}
	function remove(id) {
		if (inFlight.current) return;
		const slip = slips.find((s) => s.id === id);
		if (slip) {
			URL.revokeObjectURL(slip.url);
			urls.current.delete(slip.url);
		}
		setSlips((current) => current.filter((s) => s.id !== id));
	}
	async function send() {
		if (!remaining || inFlight.current || preview) return;
		inFlight.current = true;
		setBusy(true);
		setMsg(null);
		try {
			await sendSlipQueue(slips, note, (id, result) => {
				setSlips((current) => current.map((s) => s.id === id ? {
					...s,
					result
				} : s));
				if (result.ok) qc.invalidateQueries({ queryKey: ["review-queue"] });
			});
		} finally {
			inFlight.current = false;
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "slip-intake-h",
		className: "rounded-2xl border border-border bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				id: "slip-intake-h",
				className: "text-[17px] font-semibold",
				children: "เพิ่มสลิปเข้าคิวตรวจ"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[14px] text-muted-foreground",
				children: "เลือกได้หลายสลิป เช่น โอนครั้งแรกและโอนเพิ่ม · JPG, PNG, WebP ไม่เกิน 10MB ต่อรูป"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[14px] text-muted-foreground",
				children: "แต่ละสลิปเข้าคิวแยกกัน ให้ผูกกับเลขงานเดียวกันตอนตรวจหลักฐาน · ยังไม่ถือว่าเงินเข้า"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 grid grid-cols-2 gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					disabled: busy,
					onClick: () => camRef.current?.click(),
					className: "flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary/10 text-[15px] font-medium text-primary",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Camera, {
						className: "h-5 w-5",
						"aria-hidden": true
					}), " ถ่ายรูปสลิปเพิ่ม"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					disabled: busy,
					onClick: () => pickRef.current?.click(),
					className: "flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border text-[15px] font-medium",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImagePlus, {
						className: "h-5 w-5",
						"aria-hidden": true
					}), " เลือกรูปสลิป"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				ref: camRef,
				type: "file",
				disabled: busy,
				accept: "image/jpeg,image/png,image/webp",
				capture: "environment",
				className: "sr-only",
				"aria-label": "ถ่ายรูปสลิป",
				onChange: (e) => choose(e.target.files, true)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				ref: pickRef,
				type: "file",
				multiple: true,
				disabled: busy,
				accept: "image/jpeg,image/png,image/webp",
				className: "sr-only",
				"aria-label": "เลือกรูปสลิปหลายใบ",
				onChange: (e) => choose(e.target.files, false)
			}),
			msg && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "mt-3 text-[14px] text-warn",
				children: msg
			}),
			slips.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 space-y-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						role: "status",
						"aria-live": "polite",
						className: "text-[14px]",
						children: [
							"ทั้งหมด ",
							slips.length,
							" สลิป · รับเข้าคิวแล้ว ",
							received,
							" · รอส่งหรือรอตรวจผล ",
							remaining
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "space-y-3",
						children: slips.map((slip, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "space-y-2 rounded-xl border border-border p-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "min-w-0 break-all text-[14px] font-medium",
										children: [
											"สลิป ",
											index + 1,
											" · ",
											slip.file.name
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										disabled: busy,
										onClick: () => remove(slip.id),
										"aria-label": `เอาสลิป ${index + 1} ออกจากรายการที่เลือก`,
										className: "shrink-0 rounded-full border border-border bg-background p-3",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
									src: slip.url,
									alt: `รูปสลิป ${index + 1} ที่เลือก`,
									className: "max-h-60 w-full rounded-xl border border-border object-contain bg-background"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", {
									disabled: busy || slip.result?.ok,
									className: "flex gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", {
										className: "mb-1 text-[14px] text-muted-foreground",
										children: "สลิปนี้มาจาก"
									}), [["line_ofc", "LINE"], ["cdm_paper", "กระดาษ CDM"]].map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: `flex min-h-11 flex-1 items-center justify-center rounded-xl border text-[15px] ${slip.source === value ? "border-primary bg-primary/10 text-primary" : "border-border"}`,
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "radio",
											name: `slip-source-${slip.id}`,
											value,
											checked: slip.source === value,
											onChange: () => setSlips((current) => current.map((s) => s.id === slip.id ? {
												...s,
												source: value
											} : s)),
											className: "sr-only"
										}), label]
									}, value))]
								}),
								slip.result && (slip.result.ok ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									role: "status",
									className: "text-[14px]",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: slip.result.duplicate ? "มีหลักฐานนี้อยู่แล้ว ใช้รายการเดิมเพื่อตรวจสถานะ" : "รับสลิปแล้ว เข้าคิวรอตรวจ · ยังไม่ยืนยันเงินเข้า" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
										href: slip.result.reviewPath,
										target: "_blank",
										rel: "noopener noreferrer",
										className: "inline-flex min-h-11 items-center font-medium text-primary underline",
										children: [
											"เปิดหลักฐานสลิป ",
											index + 1,
											" ในคิวตรวจ (แท็บใหม่)"
										]
									})]
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									role: "alert",
									className: "space-y-2 text-[14px]",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: slipUploadErrorHelp(slip.result) }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "หยุดส่งใบถัดไปแล้ว ตรวจรายการนี้ก่อนกดส่งอีกครั้ง ใบที่รับเข้าคิวแล้วจะไม่ส่งซ้ำ" }),
										slip.result.reason === "unauthorized" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
											href: "/internal/admin/login?next=%2Finternal%2Fadmin%2Fpayments",
											className: "inline-flex min-h-11 items-center text-primary underline",
											children: "เข้าสู่ระบบใหม่"
										}),
										slip.result.code && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
											className: "text-[13px] text-muted-foreground",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: "รายละเอียดทางเทคนิค" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "break-all font-mono",
												children: slip.result.code
											})]
										})
									]
								}))
							]
						}, slip.id))
					}),
					remaining > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block text-[14px]",
						children: ["โน้ตสำหรับสลิปที่กำลังส่ง (ไม่บังคับ)", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							disabled: busy,
							value: note,
							onChange: (e) => setNote(e.target.value),
							maxLength: 300,
							placeholder: "เช่น โอนครั้งแรกและโอนเพิ่มของเลขงานเดียวกัน",
							className: "mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px]"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: send,
						disabled: busy || preview,
						className: "min-h-12 w-full rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50",
						children: busy ? "กำลังส่งสลิปทีละใบ…" : preview ? "พรีวิว · ส่งจริงไม่ได้" : `ส่งสลิปที่เหลือ ${remaining} ใบเข้าคิวตรวจ`
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-muted-foreground",
						children: "เอารูปออกเป็นการล้างรายการที่เลือกบนหน้านี้ ไม่ลบหลักฐานที่รับเข้าคิวแล้ว"
					})
				]
			})
		]
	});
}
/** Only accept a conservative id shape; never used to fetch outside the queue. */
function PaymentsDesk() {
	const demo = useDemoMode();
	const { proof_id } = Route.useSearch();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "การชำระเงิน",
		path: "/internal/admin/payments",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-4xl space-y-5 px-4 py-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-2xl font-semibold tracking-tight",
						children: "รับเงิน / สลิป"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-[15px] text-muted-foreground",
						children: "สลิปใหม่สุดอยู่บน · กดดูหลักฐาน แล้วยืนยันเงินเข้า"
					}),
					demo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn",
						children: "ตัวอย่าง UI · ไม่ใช่ข้อมูลจริง · ไม่มีการส่งการตัดสิน"
					})
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlipIntakeUpload, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewDesk, { focusProofId: proof_id }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlipDiagnosis, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[15px]",
					children: [
						"สถานะสมาชิกและสิทธิ์อยู่ที่",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/internal/admin/membership-access",
							className: "font-medium text-primary underline-offset-4 hover:underline",
							children: "Membership Access"
						})
					]
				})
			]
		})
	});
}
//#endregion
export { PaymentsDesk as component };
