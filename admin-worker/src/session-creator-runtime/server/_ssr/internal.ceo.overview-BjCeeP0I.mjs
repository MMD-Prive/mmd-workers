import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { i as apiGet, o as cn, s as isPreviewRuntime, t as ApiError } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { q as useDemoMode } from "./provider-CvQy8AcV.mjs";
import { H as CircleCheck, Z as Bot, a as TriangleAlert, c as Sparkles, tt as ArrowRight, y as MessageCircleMore } from "../_libs/lucide-react.mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { n as useOwnerSnapshot, t as snapshotCount } from "./owner-snapshot-BtaivETD.mjs";
import { t as AiAdvisory } from "./AiAdvisory-COXlDbpb.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.ceo.overview-BjCeeP0I.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* OWNER QUEUE — Per's decision queue (READ ONLY).
*
* Reuses the existing same-origin owner-decision read
* (`GET /v1/admin/today/decisions`); no new endpoint is introduced. Every
* field is backend-owned: this module never derives severity, status,
* evidence or a target route. Preview origins must not call it.
*/
function str(v) {
	return typeof v === "string" && v.trim() !== "" ? v : null;
}
function strList(v) {
	return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x !== "") : [];
}
function section(v) {
	return v === "waiting_information" || v === "at_risk" ? v : "needs_decision";
}
function severity(v) {
	return v === "high" || v === "medium" || v === "low" ? v : "unknown";
}
function unwrap(raw) {
	const inner = raw?.["data"];
	return inner && typeof inner === "object" ? inner : raw ?? {};
}
function toItem(r, i) {
	return {
		id: str(r["id"]) ?? `oq${i}`,
		section: section(r["section"] ?? r["bucket"]),
		title: str(r["title"]) ?? "",
		domain: str(r["domain"]),
		client_id: str(r["client_id"]),
		per_renamed_name: str(r["per_renamed_name"]) ?? str(r["subject"]) ?? str(r["client_label"]),
		status: str(r["status"]),
		evidence_refs: strList(r["evidence_refs"]).length ? strList(r["evidence_refs"]) : strList(r["evidence"]),
		reason: str(r["reason"]) ?? str(r["why"]),
		severity: severity(r["severity"]),
		target_url: str(r["target_url"]),
		generated_at: str(r["generated_at"])
	};
}
/** Read the owner queue from the existing owner-decision endpoint. */
async function readOwnerQueue(signal) {
	if (isPreviewRuntime()) throw new ApiError("unavailable", 0, "Preview origin has no authoritative backend.");
	const body = unwrap(await apiGet("/v1/admin/today/decisions", signal));
	return {
		source_status: "backend",
		items: (Array.isArray(body["queue"]) && body["queue"] || Array.isArray(body["decisions"]) && body["decisions"] || Array.isArray(body["items"]) && body["items"] || []).map((r, i) => toItem(r ?? {}, i)).filter((it) => it.title !== ""),
		total: typeof body["total"] === "number" ? body["total"] : null,
		advisory: str(body["advisory"])
	};
}
/**
* OWNER QUEUE — Per's decision queue.
*
* Presentation only. Every item is backend-owned; actions are navigation to a
* backend-supplied internal destination and never a mutation, send, access or
* payment action. On a live origin nothing renders unless the backend returned
* it; the labelled examples are preview-exclusive.
*/
var SECTIONS = [
	{
		id: "needs_decision",
		th: "รอเปอร์ตัดสินใจ"
	},
	{
		id: "waiting_information",
		th: "รอข้อมูลเพิ่ม"
	},
	{
		id: "at_risk",
		th: "เสี่ยงวันนี้"
	}
];
/** DEMO / PREVIEW ONLY — ตัวอย่าง UI · ไม่ใช่ข้อมูลจริง. */
var DEMO_QUEUE = {
	source_status: "demo",
	total: 4,
	advisory: "เรื่องที่ค้างวันนี้ส่วนใหญ่เป็นการตรวจหลักฐานการชำระเงิน แนะนำให้เริ่มจากเคสต่ออายุก่อน",
	items: [
		{
			id: "oq1",
			section: "needs_decision",
			title: "ตรวจหลักฐานและยืนยันยอด · ต่ออายุ Premium 2,500",
			domain: "payment",
			client_id: "recDEMO000188",
			per_renamed_name: "คุณวินนี่",
			status: "รอ Official Verify",
			evidence_refs: [
				"ได้รับหลักฐานการโอน",
				"ต่ออายุครั้งก่อน 13 ก.ค. 68",
				"ยอดที่แจ้ง 2,500"
			],
			reason: "ยอดยังไม่ยืนยัน ระบบสิทธิ์จึงยังไม่เดินต่อ",
			severity: "high",
			target_url: null,
			generated_at: "2026-09-08 07:10"
		},
		{
			id: "oq2",
			section: "needs_decision",
			title: "ต้องตรวจ identity ก่อนดำเนินการ",
			domain: "identity",
			client_id: null,
			per_renamed_name: "หนุ่ย",
			status: "ตรงกันหลายราย",
			evidence_refs: ["ตรงกับชื่อที่เปอร์เรียก 2 ราย", "ยังไม่ยืนยัน canonical match"],
			reason: "ยังไม่มี canonical client record ที่ยืนยันได้",
			severity: "medium",
			target_url: null,
			generated_at: "2026-09-08 07:12"
		},
		{
			id: "oq3",
			section: "waiting_information",
			title: "โมเดลสำหรับงานคืนนี้ยังไม่พร้อม",
			domain: "model",
			client_id: null,
			per_renamed_name: null,
			status: "ขาด compcard",
			evidence_refs: ["ยังไม่ stage เข้า Models", "รายละเอียดงานครบแล้ว"],
			reason: "ต้องผ่าน review เข้าสู่ Models ก่อนจึงจะสร้างงานได้",
			severity: "medium",
			target_url: null,
			generated_at: "2026-09-08 07:15"
		},
		{
			id: "oq4",
			section: "at_risk",
			title: "สมาชิกใกล้หมดอายุภายในสัปดาห์นี้",
			domain: "membership",
			client_id: null,
			per_renamed_name: null,
			status: "ใกล้หมดอายุ",
			evidence_refs: ["resolver แจ้งวันหมดอายุใกล้ถึง"],
			reason: "ควรทักก่อนหมดอายุ แต่การต่ออายุจริงตัดสินโดยระบบหลังบ้าน",
			severity: "low",
			target_url: null,
			generated_at: "2026-09-08 07:15"
		}
	]
};
function SeverityChip({ item }) {
	if (item.severity === "unknown") return null;
	const cls = item.severity === "high" ? "border-warn/50 bg-warn/10 text-warn" : item.severity === "medium" ? "border-border text-muted-foreground" : "border-border text-muted-foreground";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: cn("rounded-md border px-2 py-0.5 text-[13px]", cls),
		children: ["ความเร่งด่วน ", item.severity === "high" ? "สูง" : item.severity === "medium" ? "กลาง" : "ต่ำ"]
	});
}
function ItemCard({ item }) {
	const clientQuery = item.per_renamed_name ?? item.client_id;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "rounded-2xl border border-border bg-surface p-4 shadow-sm",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					item.per_renamed_name && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-[13px] text-muted-foreground",
						children: ["ชื่อที่เปอร์เรียก · ", item.per_renamed_name]
					}),
					item.domain && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded-md border border-border px-2 py-0.5 text-[13px] text-muted-foreground",
						children: item.domain
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeverityChip, { item })
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "mt-1 text-[17px] font-semibold leading-snug",
				children: item.title
			}),
			item.status && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-1 text-[13px] text-muted-foreground",
				children: ["สถานะ · ", item.status]
			}),
			item.reason && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-[15px] leading-relaxed text-foreground/85",
				children: item.reason
			}),
			item.evidence_refs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 flex flex-wrap gap-2",
				children: item.evidence_refs.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-[13px] text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, {
						className: "h-3.5 w-3.5 text-verified",
						"aria-hidden": true
					}), e]
				}, e))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex flex-wrap items-center gap-3",
				children: [item.target_url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: item.target_url,
					className: "inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:opacity-90",
					children: "เปิดดูรายละเอียด"
				}) : clientQuery ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/internal/admin/customer-data",
					search: { q: clientQuery },
					className: "inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:opacity-90",
					children: ["เปิดข้อมูลลูกค้า ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, {
						className: "h-4 w-4",
						"aria-hidden": true
					})]
				}) : item.domain === "model" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/internal/ceo/models",
					className: "inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:opacity-90",
					children: "เปิดห้องโมเดล"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/internal/admin/work",
					className: "inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:opacity-90",
					children: "เปิดห้องงาน"
				}), item.generated_at && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "text-[13px] text-muted-foreground",
					children: ["อัปเดต ", item.generated_at]
				})]
			})
		]
	});
}
function StateCard({ tone, title, body }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		role: "status",
		className: cn("rounded-2xl border p-4", tone === "warn" ? "border-warn/50 bg-warn/10" : "border-border bg-surface"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
			className: "flex items-center gap-2 text-[16px] font-semibold",
			children: [tone === "warn" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
				className: "h-5 w-5 text-warn",
				"aria-hidden": true
			}), title]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 text-[15px] leading-relaxed text-muted-foreground",
			children: body
		})]
	});
}
function OwnerQueue() {
	const preview = useDemoMode();
	const [data, setData] = (0, import_react.useState)(preview ? DEMO_QUEUE : null);
	const [error, setError] = (0, import_react.useState)(null);
	const [loading, setLoading] = (0, import_react.useState)(!preview);
	const [showAll, setShowAll] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		if (preview) return;
		const ac = new AbortController();
		setLoading(true);
		readOwnerQueue(ac.signal).then((d) => {
			setData(d);
			setError(null);
		}).catch((e) => {
			if (ac.signal.aborted) return;
			setData(null);
			setError(e instanceof ApiError ? e : new ApiError("unavailable", 0, "unavailable"));
		}).finally(() => {
			if (!ac.signal.aborted) setLoading(false);
		});
		return () => ac.abort();
	}, [preview]);
	if (loading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateCard, {
		tone: "wait",
		title: "กำลังรอข้อมูลจริง",
		body: "ระบบกำลังอ่านรายการที่รอการตัดสินใจของวันนี้จากระบบหลังบ้าน"
	});
	if (error) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateCard, {
		tone: "warn",
		title: error.kind === "unauthorized" ? "เซสชันผู้ดูแลหมดอายุ" : error.kind === "forbidden" ? "เซสชันนี้ไม่มีสิทธิ์ดูข้อมูลนี้" : "ยังดึงข้อมูลจริงไม่ได้",
		body: "หน้านี้จะไม่แสดงข้อมูลตัวอย่างแทนข้อมูลจริง และไม่มีการดำเนินการใด ๆ"
	});
	const items = data?.items ?? [];
	if (items.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateCard, {
		tone: "wait",
		title: "ยังไม่มีรายการจากระบบหลังบ้าน",
		body: "เมื่อระบบหลังบ้านส่งรายการที่ต้องให้เปอร์ดู รายการจะขึ้นที่นี่"
	});
	const immediate = items.filter((i) => i.section === "needs_decision");
	const hasMore = (data?.total ?? items.length) > 3 || immediate.length > 3;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			SECTIONS.map((s) => {
				let rows = items.filter((i) => i.section === s.id);
				if (s.id === "needs_decision" && !showAll) rows = rows.slice(0, 3);
				if (rows.length === 0) return null;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "space-y-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[17px] font-semibold tracking-tight",
						children: s.th
					}), rows.map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ItemCard, { item: i }, i.id))]
				}, s.id);
			}),
			hasMore && !showAll && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => setShowAll(true),
				className: "inline-flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 text-[15px] font-medium hover:bg-surface-2",
				children: "ดูทั้งหมด"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AiAdvisory, {
				mode: "ready_for_per",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: data?.advisory ?? "ยังไม่มีคำแนะนำที่เชื่อถือได้" })
			})
		]
	});
}
/**
* Per Today primary shortcuts. Rendered immediately (app shell first); counts
* appear ONLY when the owner snapshot returned a bounded integer for that key.
* Missing/failed = action only, never a fabricated 0.
*/
var OWNER_FLOW = [
	{
		to: "/internal/ceo",
		label: "CEO · ภาพรวม",
		note: "เลือกเรื่องที่เปอร์ต้องดูต่อ"
	},
	{
		to: "/internal/admin/member-intelligence",
		label: "ลูกค้า · MMD Memory",
		note: "ตรวจตัวตนและบริบทจากหลักฐาน"
	},
	{
		to: "/internal/admin/jobs/create-job",
		label: "Create Job · Public / Private",
		note: "เลือกลูกค้า → ประเภทงาน → โมเดล → รายละเอียด → ตรวจ"
	},
	{
		to: "/internal/ceo/payment-slip-inbox",
		label: "ตรวจหลักฐาน",
		note: "ดูสลิป แล้วตรวจเงินและสิทธิ์ในหน้าต้นทางเมื่อเกี่ยวข้อง"
	},
	{
		to: "/internal/ceo/kenji-control",
		label: "CEO / Kenji · รับช่วง",
		note: "อ่านบริบทและข้อเสนอ ก่อนให้เปอร์ตัดสินใจ"
	}
];
var ACTIONS = [
	{
		to: "/internal/admin/member-intelligence",
		label: "MMD Memory",
		note: "ตัวตนลูกค้าและบริบทที่มีหลักฐาน",
		keys: []
	},
	{
		to: "/internal/ceo/payment-slip-inbox",
		label: "Slip Inbox",
		note: "สลิปที่เข้ามา",
		keys: [
			"payment_slip_inbox",
			"payment_slips_pending",
			"slip_inbox_pending",
			"payment_proofs_pending"
		]
	},
	{
		to: "/internal/admin/payments",
		label: "Money Control",
		note: "ตรวจและส่งการตัดสิน",
		keys: [
			"money_control",
			"payments_review_pending",
			"payment_review_queue",
			"money_review_pending"
		]
	},
	{
		to: "/internal/admin/jobs/create-job",
		label: "Create Job · Public / Private",
		note: "เลือกลูกค้าก่อนสร้างงาน",
		keys: ["jobs_need_confirm"]
	},
	{
		to: "/internal/ceo/models",
		label: "Model Assets / Studio",
		note: "ความพร้อมของโมเดล",
		keys: ["model_assets_pending", "studio_review_pending"]
	},
	{
		to: "/internal/admin/kenji",
		label: "Kenji · ความรู้และคำตอบ",
		note: "ตรวจความรู้และคำตอบที่ช่วยงาน",
		keys: []
	},
	{
		to: "/internal/admin/telegram-brief",
		label: "HYPE + HENNA",
		note: "ผู้ช่วย Telegram",
		keys: []
	}
];
function timeLabel(ts) {
	if (!ts) return null;
	return new Date(ts).toLocaleTimeString("th-TH", {
		hour: "2-digit",
		minute: "2-digit"
	});
}
function OwnerShortcuts() {
	const q = useOwnerSnapshot();
	const updated = timeLabel(q.updatedAt);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "space-y-4",
		"aria-label": "ทางลัด",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
				"aria-label": "ลำดับการทำงาน MMD",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-[17px] font-semibold tracking-tight",
						children: "เริ่มจากเรื่องที่ต้องทำ"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-[13px] text-muted-foreground",
						children: "เลือกเฉพาะขั้นที่เกี่ยวข้อง · MMD Memory ให้บริบท · Kenji ช่วยเตรียมข้อมูลให้เปอร์รับช่วง"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
						className: "mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5",
						children: OWNER_FLOW.map((step, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: step.to,
							className: "block h-full rounded-xl border border-gold/40 bg-gold-muted p-3 hover:bg-surface-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "block text-[14px] font-semibold",
								children: [
									index + 1,
									" · ",
									step.label
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mt-1 block text-[13px] text-muted-foreground",
								children: step.note
							})]
						}) }, step.to))
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-baseline justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[17px] font-semibold tracking-tight",
					children: "ไปที่"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[13px] text-muted-foreground",
					"aria-live": "polite",
					children: q.isError && !q.data ? "ตัวเลขยังยืนยันไม่ได้" : q.refreshing && q.data ? "กำลังอัปเดต…" : updated && q.data?.authority === "backend" ? `อัปเดต ${updated}` : null
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-2 sm:grid-cols-3",
				children: [ACTIONS.map((a) => {
					const c = snapshotCount(q.data, a.keys);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: a.to,
						className: "min-h-14 min-w-0 rounded-xl border border-border bg-surface px-3 py-2 hover:bg-surface-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "flex items-center justify-between gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "min-w-0 text-[15px] font-medium",
								children: a.label
							}), c && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-full bg-gold-muted px-2 text-[13px] font-semibold",
								children: c
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "block text-[13px] text-muted-foreground",
							children: a.note
						})]
					}, a.to);
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: "/internal/admin/jobs/job-board",
					className: "min-h-14 min-w-0 rounded-xl border border-border bg-surface px-3 py-2 hover:bg-surface-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "block text-[15px] font-medium",
						children: "Job Board · Public / Private"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "block text-[13px] text-muted-foreground",
						children: "ประกาศหาโมเดล · เลือก Public MMD / Private SIGIL ในหน้า Job Board"
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "Create Job สร้างงาน · Job Board ประกาศหาโมเดลแยกเมื่อจำเป็น การสร้างงานไม่ประกาศให้อัตโนมัติ"
			})
		]
	});
}
function statusText(value, fallback) {
	return value?.status.toUpperCase() ?? fallback;
}
function tone(value) {
	if (value?.status === "configured") return "border-verified/40 text-verified";
	if (value?.status === "partial" || value?.status === "degraded") return "border-warn/40 text-warn";
	return "border-border text-muted-foreground";
}
function ConciergeHealthStrip() {
	const query = useOwnerSnapshot();
	const hype = query.data?.concierges.hype;
	const henna = query.data?.concierges.henna;
	const items = [
		{
			name: "Kenji",
			status: "OWNER VIEW",
			to: "/internal/ceo/kenji-control",
			icon: Sparkles,
			className: "border-border text-muted-foreground"
		},
		{
			name: "HYPE",
			status: query.isPending ? "CHECKING" : statusText(hype, "UNAVAILABLE"),
			to: "/internal/admin/telegram-brief",
			icon: MessageCircleMore,
			className: tone(hype)
		},
		{
			name: "HENNA",
			status: query.isPending ? "CHECKING" : statusText(henna, "CHECK VIA MMS"),
			to: "/internal/admin/mms",
			icon: Bot,
			className: tone(henna)
		}
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "concierge-health-title",
		className: "space-y-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					id: "concierge-health-title",
					className: "text-[16px] font-semibold",
					children: "AI / Concierge Health"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[13px] text-muted-foreground",
					children: "สถานะปฏิบัติการ · ไม่ใช่อำนาจยืนยันธุรกิจ"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid gap-2 sm:grid-cols-3",
				children: items.map((item) => {
					const Icon = item.icon;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: item.to,
						className: "flex min-h-11 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 hover:bg-surface-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
								className: "h-4 w-4 shrink-0 text-gold",
								"aria-hidden": true
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[15px] font-semibold",
								children: item.name
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: cn("ml-auto rounded-full border px-2 py-0.5 font-mono text-[12px]", item.className),
								children: item.status
							})
						]
					}, item.name);
				})
			}),
			query.isError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "ยังไม่มีสถานะ concierge ที่ยืนยันได้จากระบบหลังบ้าน"
			})
		]
	});
}
/**
* PER TODAY — owner home. Answers one question: "วันนี้ต้องตัดสินใจอะไร".
* Backend-owned queue; shortcuts show counts only when the backend supplies them.
*/
function PerToday({ path }) {
	const demo = useDemoMode();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "วันนี้",
		path,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-3xl space-y-6 px-4 py-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-2xl font-semibold tracking-tight",
						children: "วันนี้ต้องตัดสินใจอะไร"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-[15px] leading-relaxed text-muted-foreground",
						children: "เรื่องที่รอเปอร์ พร้อมหลักฐานจากระบบหลังบ้าน"
					}),
					demo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn",
						children: "ตัวอย่าง UI · ไม่ใช่ข้อมูลจริง และไม่มีการดำเนินการจริงในหน้านี้"
					})
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OwnerShortcuts, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OwnerQueue, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConciergeHealthStrip, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border bg-surface px-4 py-3 text-[15px]",
					children: [
						"งานทั้งหมดอยู่ในห้อง",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/internal/admin/work",
							className: "font-medium text-primary underline-offset-4 hover:underline",
							children: "งาน"
						})
					]
				})
			]
		})
	});
}
/**
* Compatibility destination: /internal/ceo/overview keeps working and renders
* the PER TODAY room.
*/
var SplitComponent = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PerToday, { path: "/internal/ceo/overview" });
//#endregion
export { SplitComponent as component };
