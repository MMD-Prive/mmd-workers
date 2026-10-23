import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { a as apiPost, c as writesBlockedRuntime, i as apiGet, o as cn, t as ApiError } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { E as LayoutGrid, L as Copy, P as ExternalLink, h as ReceiptText, m as RefreshCw } from "../_libs/lucide-react.mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as Button } from "./button-C7XS-FYH.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.model-job-board.release-control-0x54gd0x.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Model Job Board Release Control — single typed adapter.
*
* Workers are the only authority for readiness, smoke receipts and every
* signed/broadcast URL. This module transports + validates only. Any missing,
* malformed or failed response fails closed to UNKNOWN / HOLD — never demo truth.
*/
var READINESS_PATH = "/v1/admin/model-job-board/release-readiness";
var READINESS_ACTION_PATH = "/v1/admin/model-job-board/release-readiness/action";
var GATE_KEYS = [
	"entry",
	"identity",
	"job_board",
	"applicant",
	"broadcast"
];
var ACCEPTANCE_KEYS = ["existing_model", "new_applicant"];
var STATES = [
	"pass",
	"fail",
	"unknown",
	"pending"
];
var asState = (v) => STATES.includes(v) ? v : "unknown";
var str = (v) => typeof v === "string" && v.trim() ? v : null;
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
/** Remove secret-like material from any backend text before render. */
function redact(input) {
	if (!input) return null;
	return input.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[redacted]").replace(/\bU[0-9a-f]{32}\b/g, "[redacted]").replace(/\brec[A-Za-z0-9]{14}\b/g, "[redacted]").replace(/\b(token|secret|cookie|session|password|signature|sig|key|authorization|bearer)\b\s*[:=]\s*\S+/gi, "$1=[redacted]").replace(/\bBearer\s+\S+/gi, "Bearer [redacted]").replace(/https?:\/\/\S+/g, "[link]").replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]");
}
/** Only backend-provided https or same-origin relative URLs are usable. */
function safeBackendUrl(v) {
	if (typeof v !== "string" || !v) return null;
	if (v.startsWith("/") && !v.startsWith("//")) return v;
	try {
		const u = new URL(v);
		return u.protocol === "https:" ? u.toString() : null;
	} catch {
		return null;
	}
}
function parseCheck(v) {
	if (!isObj(v)) return null;
	const key = str(v["key"]);
	if (!key) return null;
	return {
		key,
		label: redact(str(v["label"]) ?? key) ?? key,
		state: asState(v["state"]),
		detail: redact(str(v["detail"])),
		observed_at: str(v["observed_at"])
	};
}
/** Strict schema parse. Returns null when the shape is not trustworthy. */
function parseReadiness(raw) {
	if (!isObj(raw) || raw["ok"] !== true || raw["schema"] !== "mmd_model_job_board_release_readiness_v1") return null;
	if (!isObj(raw["gates"]) || !isObj(raw["acceptance"])) return null;
	const gates = {};
	for (const k of GATE_KEYS) {
		const g = raw["gates"][k];
		if (!isObj(g) || !Array.isArray(g["checks"])) return null;
		gates[k] = {
			state: asState(g["state"]),
			checks: g["checks"].map(parseCheck).filter((c) => !!c)
		};
	}
	const acceptance = {};
	for (const k of ACCEPTANCE_KEYS) {
		const a = raw["acceptance"][k];
		if (!isObj(a)) return null;
		acceptance[k] = {
			state: asState(a["state"]),
			last_receipt_at: str(a["last_receipt_at"]),
			receipt_id: redact(str(a["receipt_id"]))
		};
	}
	const rs = raw["release_state"];
	const links = isObj(raw["links"]) ? raw["links"] : {};
	return {
		checked_at: str(raw["checked_at"]),
		backend_state: rs === "ready" || rs === "hold" ? rs : "unknown",
		reason: redact(str(raw["reason"])),
		gates,
		acceptance,
		links: {
			job_board_url: safeBackendUrl(links["job_board_url"]),
			acceptance_receipt_url: safeBackendUrl(links["acceptance_receipt_url"])
		}
	};
}
var GATE_LABELS = {
	entry: "ENTRY",
	identity: "IDENTITY",
	job_board: "JOB BOARD",
	applicant: "APPLICANT",
	broadcast: "BROADCAST"
};
var ACCEPTANCE_LABELS = {
	existing_model: "Acceptance · Existing linked Model",
	new_applicant: "Acceptance · New applicant"
};
/** Release rule: READY only when every gate, check and acceptance passes AND backend agrees. */
function evaluate(readiness, error) {
	if (!readiness) return {
		state: "unknown",
		reason: errorReason(error),
		blockers: [],
		readiness: null
	};
	const blockers = [];
	for (const k of GATE_KEYS) {
		const g = readiness.gates[k];
		if (g["checks"].length === 0) blockers.push({
			scope: GATE_LABELS[k],
			label: "ไม่มีผลตรวจจากระบบหลังบ้าน",
			state: "unknown",
			detail: null
		});
		if (g["state"] !== "pass") blockers.push({
			scope: GATE_LABELS[k],
			label: "สถานะ gate",
			state: g["state"],
			detail: null
		});
		for (const c of g["checks"]) if (c.state !== "pass") blockers.push({
			scope: GATE_LABELS[k],
			label: c.label,
			state: c.state,
			detail: c.detail
		});
	}
	for (const k of ACCEPTANCE_KEYS) {
		const a = readiness.acceptance[k];
		if (a["state"] !== "pass") blockers.push({
			scope: "ACCEPTANCE",
			label: ACCEPTANCE_LABELS[k],
			state: a["state"],
			detail: null
		});
	}
	if (readiness.backend_state !== "ready") blockers.push({
		scope: "BACKEND",
		label: "ระบบหลังบ้านยังไม่ยืนยัน READY",
		state: readiness.backend_state === "hold" ? "fail" : "unknown",
		detail: readiness.reason
	});
	if (blockers.length === 0) return {
		state: "ready",
		reason: null,
		blockers,
		readiness
	};
	return {
		state: blockers.every((b) => b.state === "unknown") ? "unknown" : "hold",
		reason: readiness.reason ?? `${blockers.length} รายการยังไม่ผ่าน`,
		blockers,
		readiness
	};
}
function errorReason(error) {
	if (error instanceof ApiError) {
		if (error.kind === "unauthorized") return "ต้องเข้าสู่ระบบผู้ดูแลก่อน (401)";
		if (error.kind === "forbidden") return "บัญชีนี้ไม่มีสิทธิ์ดูสถานะ release (403)";
		if (error.status === 404) return "ระบบหลังบ้านยังไม่มี endpoint release readiness (404)";
		if (error.status === 0) return "ติดต่อระบบหลังบ้านไม่ได้";
		return `ระบบหลังบ้านตอบผิดพลาด (HTTP ${error.status})`;
	}
	if (error instanceof Error && error.message === "bad_schema") return "ข้อมูลจากระบบหลังบ้านไม่ตรง schema · ไม่ถือว่าพร้อม";
	return "ยังไม่มีผลตรวจจากระบบหลังบ้าน";
}
async function fetchReadiness(signal) {
	const parsed = parseReadiness(await apiGet(READINESS_PATH, signal));
	if (!parsed) throw new Error("bad_schema");
	return parsed;
}
/** Action endpoint. URLs are taken only from the backend response. */
async function runReadinessAction(action) {
	if (writesBlockedRuntime()) throw new Error("preview_blocked");
	const raw = await apiPost(READINESS_ACTION_PATH, { action });
	if (!isObj(raw) || raw["ok"] !== true || raw["action"] !== action) throw new Error("bad_schema");
	return {
		ok: true,
		url: safeBackendUrl(raw["url"]),
		receipt_id: redact(str(raw["receipt_id"])),
		state: raw["state"] === void 0 ? null : asState(raw["state"])
	};
}
var GATE_HINT = {
	entry: "Login route · Mini App handoff · LINE/external browser · กันโทเค็นรั่วใน handoff",
	identity: "existing_bound · verified_new · identity_review_required fail-closed · ไม่ตกไป Onboarding",
	job_board: "API · Public + Private feed · two-card grid · job_id · metadata ปลอดภัย",
	applicant: "contact-first · รูปหน้า ≥1 ก่อนอนุมัติ · needs_media · กันรหัส GWsxx/EMsxx ชน",
	broadcast: "ลิงก์เข้า login ก่อน · ไม่ใช่ลิงก์ jobs ตรง · handoff Telegram/browser"
};
function stateTone(s) {
	if (s === "pass" || s === "ready") return "border-verified/40 bg-verified/10 text-verified";
	if (s === "fail" || s === "hold") return "border-destructive/40 bg-destructive/10 text-destructive";
	if (s === "pending") return "border-warn/40 bg-warn/10 text-warn";
	return "border-border bg-surface-2 text-muted-foreground";
}
function Chip({ state, big }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex shrink-0 items-center rounded-full border font-mono uppercase", big ? "px-3 py-1 text-[14px] font-semibold" : "px-2 py-0.5 text-[12px]", stateTone(state)),
		children: state
	});
}
var fmt = (iso) => {
	if (!iso) return "—";
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("th-TH", {
		dateStyle: "short",
		timeStyle: "medium"
	});
};
function ReleaseControl() {
	const [ev, setEv] = (0, import_react.useState)(() => evaluate(null));
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [actionMsg, setActionMsg] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(null);
	const [actionsAvailable, setActionsAvailable] = (0, import_react.useState)(true);
	const load = (0, import_react.useCallback)(async () => {
		setLoading(true);
		try {
			setEv(evaluate(await fetchReadiness()));
		} catch (e) {
			setEv(evaluate(null, e));
		} finally {
			setLoading(false);
		}
	}, []);
	(0, import_react.useEffect)(() => {
		load();
	}, [load]);
	const r = ev.readiness;
	const previewBlocked = typeof window !== "undefined" && writesBlockedRuntime();
	async function act(action, mode) {
		setBusy(action);
		setActionMsg(null);
		try {
			const res = await runReadinessAction(action);
			if (!res.url) setActionMsg("ระบบหลังบ้านไม่ได้ส่งลิงก์มา · ไม่มีการสร้างลิงก์จากหน้านี้");
			else if (mode === "copy") {
				await navigator.clipboard.writeText(res.url);
				setActionMsg("คัดลอกลิงก์จากระบบหลังบ้านแล้ว");
			} else {
				window.open(res.url, "_blank", "noopener,noreferrer");
				setActionMsg(res.receipt_id ? `เปิดลิงก์แล้ว · receipt ${res.receipt_id}` : "เปิดลิงก์จากระบบหลังบ้านแล้ว");
			}
		} catch (e) {
			if (e instanceof Error && e.message === "preview_blocked") setActionMsg("Preview · ไม่เรียก action จริง");
			else {
				setActionsAvailable(false);
				setActionMsg("ระบบหลังบ้านยังไม่พร้อมสำหรับ action นี้ · ไม่มีการสร้างลิงก์แทน");
			}
		} finally {
			setBusy(null);
		}
	}
	const actionDisabled = previewBlocked || !actionsAvailable || busy !== null;
	const jobBoardUrl = r?.links.job_board_url ?? null;
	const receiptUrl = r?.links.acceptance_receipt_url ?? null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto w-full max-w-5xl space-y-4 px-4 py-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "rounded-2xl border border-border bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "min-w-0 flex-1 text-[17px] font-semibold tracking-wide",
								children: "MODEL JOB BOARD · RELEASE CONTROL"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								"data-testid": "release-state",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
									state: loading ? "unknown" : ev.state,
									big: true
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "outline",
								size: "sm",
								className: "min-h-11",
								onClick: () => void load(),
								disabled: loading,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: cn("mr-1.5 h-4 w-4", loading && "animate-spin") }), " ตรวจใหม่"]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-2 text-[13px] text-muted-foreground",
						children: ["ตรวจล่าสุด: ", loading ? "กำลังตรวจ…" : fmt(r?.checked_at ?? null)]
					}),
					!loading && ev.state !== "ready" && ev.reason && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-[15px] text-foreground",
						role: "status",
						children: ev.reason
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-[13px] text-muted-foreground",
						children: "ระบบหลังบ้านเป็นผู้ยืนยันเท่านั้น · หน้านี้ไม่ตัดสินความพร้อมเอง"
					})
				]
			}),
			!loading && ev.blockers.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-2xl border border-warn/40 bg-surface p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[15px] font-semibold",
					children: "ทำไมยังไม่พร้อม?"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-2 space-y-1.5",
					children: ev.blockers.map((b, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex min-w-0 items-start gap-2 text-[14px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, { state: b.state }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "min-w-0 break-words",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[12px] text-gold",
									children: b.scope
								}),
								" · ",
								b.label,
								b.detail ? ` — ${b.detail}` : ""
							]
						})]
					}, i))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "grid gap-3 md:grid-cols-2 lg:grid-cols-3",
				children: GATE_KEYS.map((k, idx) => {
					const g = r?.gates[k];
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: "min-w-0 rounded-2xl border border-border bg-surface p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
								className: "flex items-center gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "font-mono text-[12px] text-gold",
										children: ["0", idx + 1]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										className: "min-w-0 flex-1 text-[15px] font-semibold",
										children: GATE_LABELS[k]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, { state: g?.state ?? "unknown" })
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[13px] text-muted-foreground",
								children: GATE_HINT[k]
							}),
							g && g.checks.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
								className: "mt-3 space-y-1.5",
								children: g.checks.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
									className: "flex min-w-0 items-start gap-2 text-[14px]",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, { state: c.state }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "min-w-0 break-words",
										children: [c.label, c.detail && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "block text-[13px] text-muted-foreground",
											children: c.detail
										})]
									})]
								}, c.key))
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-3 text-[13px] text-muted-foreground",
								children: "ยังไม่มีผลตรวจจากระบบหลังบ้าน · UNKNOWN"
							}),
							k === "broadcast" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-3 space-y-1.5 border-t border-border pt-3",
								children: ACCEPTANCE_KEYS.map((a) => {
									const acc = r?.acceptance[a];
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex min-w-0 items-start gap-2 text-[14px]",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, { state: acc?.state ?? "unknown" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "min-w-0 break-words",
											children: [ACCEPTANCE_LABELS[a], /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "block text-[13px] text-muted-foreground",
												children: [
													"receipt ",
													acc?.receipt_id ?? "—",
													" · ",
													fmt(acc?.last_receipt_at ?? null)
												]
											})]
										})]
									}, a);
								})
							})
						]
					}, k);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-2xl border border-border bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[15px] font-semibold",
						children: "Actions"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-[13px] text-muted-foreground",
						children: "ลิงก์ทุกตัวมาจากระบบหลังบ้าน · หน้านี้ไม่สร้างลิงก์เอง"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "outline",
								className: "min-h-11 justify-start",
								disabled: actionDisabled,
								onClick: () => void act("existing_model_test_link", "open"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, { className: "mr-2 h-4 w-4" }), " เปิดลิงก์ทดสอบ Existing Model"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "outline",
								className: "min-h-11 justify-start",
								disabled: actionDisabled,
								onClick: () => void act("new_applicant_test_link", "open"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, { className: "mr-2 h-4 w-4" }), " เปิดลิงก์ทดสอบ New Applicant"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "outline",
								className: "min-h-11 justify-start",
								disabled: actionDisabled,
								onClick: () => void act("broadcast_link", "copy"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "mr-2 h-4 w-4" }), " คัดลอก Broadcast Link"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "outline",
								className: "min-h-11 justify-start",
								disabled: !jobBoardUrl,
								"data-testid": "job-board-btn",
								onClick: () => jobBoardUrl && window.open(jobBoardUrl, "_blank", "noopener,noreferrer"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LayoutGrid, { className: "mr-2 h-4 w-4" }), " ดู Job Board"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "outline",
								className: "min-h-11 justify-start",
								disabled: !receiptUrl,
								"data-testid": "receipt-btn",
								onClick: () => receiptUrl && window.open(receiptUrl, "_blank", "noopener,noreferrer"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReceiptText, { className: "mr-2 h-4 w-4" }), " ดู Acceptance Receipt"]
							})
						]
					}),
					(previewBlocked || !actionsAvailable) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-[13px] text-muted-foreground",
						children: previewBlocked ? "Preview · action ถูกปิด" : "ระบบหลังบ้านยังไม่พร้อม · action ถูกปิด"
					}),
					actionMsg && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-[14px]",
						role: "status",
						children: actionMsg
					})
				]
			})
		]
	});
}
var PATH = "/internal/admin/model-job-board/release-control";
var SplitComponent = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
	module: "Release Control",
	path: PATH,
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReleaseControl, {})
});
//#endregion
export { SplitComponent as component };
