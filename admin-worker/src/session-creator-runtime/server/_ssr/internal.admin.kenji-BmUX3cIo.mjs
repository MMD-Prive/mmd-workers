import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { i as apiGet, o as cn, s as isPreviewRuntime, t as ApiError } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { J as usingDemoData, T as kenjiApi } from "./provider-CvQy8AcV.mjs";
import { L as Copy, a as TriangleAlert, c as Sparkles, u as ShieldOff } from "../_libs/lucide-react.mjs";
import { n as ConsoleShell, r as KENJI_ROOM_ITEMS } from "./ConsoleShell-Dawp5DUR.mjs";
import { n as RoomDestinations } from "./CanonPage-FXlmFGAJ.mjs";
import { a as useQueryClient, r as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.kenji-BmUX3cIo.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* KENJI DESK — read-only operator view (queue, continuity, drafts).
*
* Same-origin, credentialed, no-store. The backend owns every fact here:
* which cases exist, whether a client is canonically matched, and whether a
* draft reply is trustworthy. Nothing is inferred in the browser, no message
* is ever sent, and no money / access / membership state is decided here.
* Preview origins must not call these endpoints — they render labelled
* example data instead.
*/
function str(v) {
	return typeof v === "string" && v.trim() !== "" ? v : null;
}
function strList(v) {
	return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x !== "") : [];
}
function unwrap(raw) {
	const inner = raw?.["data"];
	return inner && typeof inner === "object" ? inner : raw ?? {};
}
function items(body, ...keys) {
	for (const k of [
		...keys,
		"items",
		"records",
		"results"
	]) {
		const v = body[k];
		if (Array.isArray(v)) return v.map((r) => r ?? {});
	}
	return [];
}
function bucket(v) {
	return v === "waiting_for_per" || v === "waiting_for_context" || v === "ready_for_per" ? v : null;
}
function match(v) {
	return v === "matched" || v === "identity_review" || v === "waiting" ? v : "unknown";
}
function guardPreview() {
	if (isPreviewRuntime()) throw new ApiError("unavailable", 0, "Preview origin has no authoritative backend.");
}
/** GET /v1/admin/kenji/queue */
async function fetchKenjiQueue(signal) {
	guardPreview();
	const body = unwrap(await apiGet("/v1/admin/kenji/queue", signal));
	return {
		authority: "backend",
		cases: items(body, "cases").map((r, i) => {
			const b = bucket(r["bucket"]) ?? bucket(r["state"]);
			if (!b) return null;
			return {
				id: str(r["id"]) ?? `k${i}`,
				bucket: b,
				client_label: str(r["client_label"]) ?? str(r["remembered_name"]),
				client_id: str(r["client_id"]),
				topic: str(r["topic"]),
				line_context: str(r["line_context"]) ?? str(r["last_context"]),
				canonical_state: str(r["canonical_state"]),
				match_status: match(r["match_status"]),
				confidence: str(r["confidence"]),
				why: str(r["why"]) ?? str(r["reason"]),
				has_draft: r["has_draft"] === true
			};
		}).filter((c) => c !== null),
		advisory: str(body["advisory"])
	};
}
/** GET /v1/admin/kenji/continuity */
async function fetchKenjiContinuity(signal) {
	guardPreview();
	const body = unwrap(await apiGet("/v1/admin/kenji/continuity", signal));
	return {
		authority: "backend",
		client_label: str(body["client_label"]),
		client_id: str(body["client_id"]),
		steps: items(body, "steps").map((r, i) => ({
			id: str(r["id"]) ?? `s${i}`,
			label: str(r["label"]) ?? "",
			detail: str(r["detail"]),
			status: match(r["status"])
		}))
	};
}
/** GET /v1/admin/kenji/drafts */
async function fetchKenjiDrafts(signal) {
	guardPreview();
	return items(unwrap(await apiGet("/v1/admin/kenji/drafts", signal)), "drafts").map((r, i) => ({
		id: str(r["id"]) ?? `d${i}`,
		channel: str(r["channel"]),
		recipient: str(r["recipient"]),
		recipient_verified: r["recipient_verified"] === true,
		message: str(r["message"]) ?? str(r["draft"]),
		context: strList(r["context"]),
		confidence: str(r["confidence"]),
		client_label: str(r["client_label"]),
		client_id: str(r["client_id"])
	})).filter((d) => d.message !== null);
}
/**
* KENJI DESK — operator surfaces (Today / Continuity / Drafts).
*
* Presentation only. Kenji understands continuity, drafts replies, routes and
* highlights missing context. It never verifies money, grants access, approves
* membership or sends a message. On a live origin the desk shows ONLY what the
* backend returns and otherwise fails closed; the labelled example data is
* preview-exclusive.
*/
var KENJI_SCOPE_LINES = [
	"Kenji ช่วยสรุปบริบทและร่างคำตอบให้เปอร์ดู ก่อนตัดสินใจ",
	"Kenji ไม่ยืนยันยอด ไม่ให้สิทธิ์ และไม่ส่งข้อความแทนเปอร์ในตอนนี้",
	"หากยังจับคู่ลูกค้าไม่ชัด ระบบจะหยุดที่ Identity Review"
];
function ScopeNote() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-xl border border-border bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, {
					className: "h-4 w-4 text-gold",
					"aria-hidden": true
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[15px] font-semibold",
					children: "ขอบเขตของ Kenji"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-2 space-y-1.5 text-[15px] leading-relaxed text-foreground/90",
				children: KENJI_SCOPE_LINES.map((l) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: l }, l))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-3 flex items-center gap-2 text-[13px] text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldOff, {
					className: "h-4 w-4",
					"aria-hidden": true
				}), "ส่งข้อความปิดอยู่ · Kenji ไม่ยืนยันยอด ไม่ให้สิทธิ์ ไม่อนุมัติสมาชิก"]
			})
		]
	});
}
function DemoBadge() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn",
		children: "ตัวอย่าง UI · ไม่ใช่ข้อมูลจริง"
	});
}
function Waiting({ label = "กำลังรอข้อมูลจริงจากระบบหลังบ้าน" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "rounded-xl border border-border bg-surface-2 p-4 text-[15px] text-muted-foreground",
		children: label
	});
}
function Failure({ error }) {
	const api = error instanceof ApiError ? error : null;
	const auth = api?.kind === "unauthorized" || api?.kind === "forbidden";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
		role: "alert",
		className: cn("flex items-start gap-2 rounded-xl border p-4 text-[15px]", auth ? "border-warn/40 bg-warn/10 text-warn" : "border-destructive/40 text-destructive"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
			className: "mt-0.5 h-4 w-4 shrink-0",
			"aria-hidden": true
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: auth ? "เซสชันผู้ดูแลไม่พร้อมใช้งาน — ระบบไม่แสดงข้อมูลลูกค้าใด ๆ" : "ยังไม่ได้ข้อมูลจากระบบหลังบ้าน — ระบบหยุดไว้ก่อน ไม่แสดงข้อมูลสมมุติ" })]
	});
}
function MatchChip({ status }) {
	const s = {
		matched: {
			label: "จับคู่แล้ว",
			cls: "border-verified/50 text-verified"
		},
		identity_review: {
			label: "ต้องตรวจ identity ก่อน",
			cls: "border-warn/50 text-warn"
		},
		waiting: {
			label: "กำลังรอข้อมูล",
			cls: "border-border text-muted-foreground"
		},
		unknown: {
			label: "ยังไม่ทราบสถานะ",
			cls: "border-border text-muted-foreground"
		}
	}[status];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("rounded-md border px-2 py-0.5 text-[13px]", s.cls),
		children: s.label
	});
}
function OpenClient360({ query }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
		to: "/internal/admin/customer-data",
		search: { q: query ?? "" },
		className: "inline-flex min-h-[44px] items-center rounded-xl border border-gold/60 bg-gold-muted px-4 text-[15px] font-medium",
		children: "เปิด Client 360"
	});
}
var BUCKETS = [
	{
		id: "waiting_for_per",
		th: "รอเปอร์ดู"
	},
	{
		id: "waiting_for_context",
		th: "กำลังรอข้อมูล"
	},
	{
		id: "ready_for_per",
		th: "พร้อมให้เปอร์ตรวจ"
	}
];
function CaseCard({ c, onOpenDrafts }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "rounded-xl border border-border bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
						className: "text-[16px] font-semibold",
						children: c.client_label ?? "ยังไม่ระบุลูกค้า"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MatchChip, { status: c.match_status }),
					c.confidence && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-[13px] text-muted-foreground",
						children: ["ความมั่นใจ ", c.confidence]
					})
				]
			}),
			c.topic && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-[15px]",
				children: c.topic
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
				className: "mt-2 space-y-1 text-[13px] text-muted-foreground",
				children: [c.line_context && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
					className: "inline",
					children: "บริบทล่าสุด · "
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
					className: "inline",
					children: c.line_context
				})] }), c.canonical_state && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
					className: "inline",
					children: "สถานะในระบบหลัก · "
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
					className: "inline",
					children: c.canonical_state
				})] })]
			}),
			c.why && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 text-[15px] text-foreground/90",
				children: ["ทำไมต้องให้เปอร์ดู: ", c.why]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 flex flex-wrap gap-2",
				children: c.has_draft ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onOpenDrafts,
					className: "inline-flex min-h-[44px] items-center rounded-xl border border-gold/60 bg-gold-muted px-4 text-[15px] font-medium",
					children: "ดูร่างคำตอบ"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpenClient360, { query: c.client_label ?? c.client_id })
			})
		]
	});
}
function QueueSections({ cases, onOpenDrafts }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-6",
		children: BUCKETS.map((b) => {
			const rows = cases.filter((c) => c.bucket === b.id);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "space-y-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
					className: "text-[15px] font-semibold",
					children: [b.th, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "ml-2 text-[13px] font-normal text-muted-foreground",
						children: [rows.length, " รายการ"]
					})]
				}), rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "rounded-xl border border-border bg-surface-2 p-3 text-[15px] text-muted-foreground",
					children: "ยังไม่มีรายการในกลุ่มนี้"
				}) : rows.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaseCard, {
					c,
					onOpenDrafts
				}, c.id))]
			}, b.id);
		})
	});
}
function KenjiToday({ demoCases, onOpenDrafts }) {
	const preview = isPreviewRuntime();
	const q = useQuery({
		queryKey: ["kenji-desk", "queue"],
		queryFn: ({ signal }) => fetchKenjiQueue(signal),
		enabled: !preview,
		retry: false
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-[20px] font-semibold tracking-tight",
				children: "Kenji วันนี้ช่วยอะไรอยู่"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[15px] text-muted-foreground",
				children: "Kenji ช่วยสรุปบริบทและร่างคำตอบให้เปอร์ดู ก่อนตัดสินใจ"
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScopeNote, {}),
			preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DemoBadge, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueueSections, {
				cases: demoCases,
				onOpenDrafts
			})] }) : q.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Waiting, {}) : q.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Failure, { error: q.error }) : q.data && q.data.cases.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueueSections, {
				cases: q.data.cases,
				onOpenDrafts
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Waiting, { label: "ตอนนี้ยังไม่มีเคสที่ Kenji ต้องให้เปอร์ดู" })
		]
	});
}
function ContinuityMap({ data }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3",
		children: [
			data.client_label && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[15px]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[13px] text-muted-foreground",
					children: "ชื่อที่เปอร์เรียก · "
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-semibold",
					children: data.client_label
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "space-y-3",
				children: data.steps.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "rounded-xl border border-border bg-surface p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "flex h-7 w-7 items-center justify-center rounded-full border border-gold/50 bg-gold-muted text-[13px]",
								children: i + 1
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[15px] font-medium",
								children: s.label
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MatchChip, { status: s.status })
						]
					}), s.detail && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-[15px] text-foreground/90",
						children: s.detail
					})]
				}, s.id))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpenClient360, { query: data.client_label ?? data.client_id }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-[13px] text-muted-foreground",
				children: "ข้อมูลจริงของลูกค้าอยู่ที่ Client 360 เท่านั้น"
			})] })
		]
	});
}
function KenjiContinuityView({ demo }) {
	const preview = isPreviewRuntime();
	const q = useQuery({
		queryKey: ["kenji-desk", "continuity"],
		queryFn: ({ signal }) => fetchKenjiContinuity(signal),
		enabled: !preview,
		retry: false
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-[20px] font-semibold tracking-tight",
				children: "ลูกค้าต่อเนื่อง"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[15px] text-muted-foreground",
				children: "เส้นทางความเข้าใจลูกค้า: ชื่อที่เปอร์เรียก → บริบทล่าสุดจาก LINE Official → ข้อมูลหลักใน Airtable → Customer Memory → สรุปให้เปอร์"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[13px] text-muted-foreground",
				children: "หากยังจับคู่ลูกค้าไม่ชัด ระบบจะหยุดที่ Identity Review"
			})
		] }), preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DemoBadge, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContinuityMap, { data: demo })] }) : q.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Waiting, {}) : q.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Failure, { error: q.error }) : q.data && q.data.steps.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContinuityMap, { data: q.data }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Waiting, { label: "ยังไม่มีเส้นทางลูกค้าที่ระบบยืนยัน" })]
	});
}
function DraftCard({ d }) {
	const [copied, setCopied] = (0, import_react.useState)(false);
	async function copy() {
		if (!d.message) return;
		try {
			await navigator.clipboard.writeText(d.message);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2e3);
		} catch {
			setCopied(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "rounded-xl border border-border bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded-md border border-border px-2 py-0.5 text-[13px] text-muted-foreground",
						children: d.channel ?? "ช่องทางไม่ระบุ"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-[13px] text-muted-foreground",
						children: [
							"ผู้รับ ·",
							" ",
							d.recipient_verified && d.recipient ? d.recipient : "ยังไม่ยืนยันผู้รับ"
						]
					}),
					d.confidence && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-[13px] text-muted-foreground",
						children: ["ความมั่นใจ ", d.confidence]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 text-[15px] leading-relaxed",
				children: d.message
			}),
			d.context.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 space-y-1 text-[13px] text-muted-foreground",
				children: d.context.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["· ", c] }, c))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-3 flex items-center gap-2 text-[13px] text-warn",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldOff, {
					className: "h-4 w-4",
					"aria-hidden": true
				}), "ส่งข้อความปิดอยู่"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OpenClient360, { query: d.client_label ?? d.client_id }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: copy,
					disabled: !d.message,
					className: "inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-[15px] hover:bg-surface-2 disabled:opacity-50",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, {
						className: "h-4 w-4",
						"aria-hidden": true
					}), copied ? "คัดลอกแล้ว" : "คัดลอกเป็นร่าง"]
				})]
			})
		]
	});
}
function KenjiDrafts({ demo }) {
	const preview = isPreviewRuntime();
	const q = useQuery({
		queryKey: ["kenji-desk", "drafts"],
		queryFn: ({ signal }) => fetchKenjiDrafts(signal),
		enabled: !preview,
		retry: false
	});
	const noDraft = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Waiting, { label: "ยังไม่มีร่างที่เชื่อถือได้" });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "text-[20px] font-semibold tracking-tight",
			children: "ร่างให้ดู"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1 text-[15px] text-muted-foreground",
			children: "ร่างคำตอบเป็นตัวอย่างให้เปอร์อ่านก่อนตอบเอง · Kenji ไม่ส่งข้อความแทนเปอร์ในตอนนี้"
		})] }), preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DemoBadge, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "space-y-4",
			children: demo.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DraftCard, { d }, d.id))
		})] }) : q.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Waiting, {}) : q.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Failure, { error: q.error }) : q.data && q.data.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "space-y-4",
			children: q.data.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DraftCard, { d }, d.id))
		}) : noDraft]
	});
}
var DEMO_CASES = [
	{
		id: "demo-1",
		bucket: "waiting_for_per",
		client_label: "คุณหนุ่ย",
		client_id: "recDEMO000412",
		topic: "ขอต่ออายุ Premium และถามรอบว่าง",
		line_context: "LINE OFC · ส่งสลิปมาเมื่อวาน 21:14",
		canonical_state: "รอเปอร์ตรวจหลักฐาน",
		match_status: "matched",
		confidence: "สูง",
		why: "มีหลักฐานการโอน แต่การยืนยันยอดต้องให้เปอร์ตัดสิน",
		has_draft: true
	},
	{
		id: "demo-2",
		bucket: "waiting_for_context",
		client_label: null,
		client_id: null,
		topic: "ทักมาถามราคาแพ็กเกจ",
		line_context: "LINE OFC · ข้อความใหม่ 08:02",
		canonical_state: "ยังจับคู่ลูกค้าไม่ได้",
		match_status: "identity_review",
		confidence: "ต่ำ",
		why: "ชื่อ LINE ไม่ตรงกับลูกค้าเดิม ต้องตรวจ identity ก่อน",
		has_draft: false
	},
	{
		id: "demo-3",
		bucket: "ready_for_per",
		client_label: "คุณวินนี่",
		client_id: "recDEMO000188",
		topic: "ถามประวัติงานล่าสุดและ Model ที่เคยใช้",
		line_context: "LINE OFC · คุยต่อจากเมื่อวาน",
		canonical_state: "สรุปบริบทครบแล้ว",
		match_status: "matched",
		confidence: "สูง",
		why: "Kenji ร่างคำตอบไว้แล้ว รอเปอร์อ่านก่อนตอบเอง",
		has_draft: true
	}
];
var DEMO_CONTINUITY = {
	authority: "backend",
	client_label: "คุณหนุ่ย",
	client_id: "recDEMO000412",
	steps: [
		{
			id: "s1",
			label: "ชื่อที่เปอร์เรียก",
			detail: "คุณหนุ่ย",
			status: "matched"
		},
		{
			id: "s2",
			label: "บริบทล่าสุดจาก LINE Official",
			detail: "ส่งสลิปเมื่อวาน 21:14 · ถามรอบว่างสุดสัปดาห์",
			status: "matched"
		},
		{
			id: "s3",
			label: "จับคู่กับข้อมูลหลักใน Airtable",
			detail: "Clients[recDEMO000412]",
			status: "matched"
		},
		{
			id: "s4",
			label: "Customer Memory / Conversation Matrix",
			detail: "ประวัติงาน 12 ครั้ง · Model ที่ใช้ซ้ำ 3 คน",
			status: "matched"
		},
		{
			id: "s5",
			label: "สรุปให้เปอร์ (Kenji brief)",
			detail: "พร้อมให้เปอร์ตรวจ",
			status: "waiting"
		}
	]
};
var DEMO_DRAFTS = [{
	id: "dr-1",
	channel: "LINE Official Account",
	recipient: "คุณหนุ่ย",
	recipient_verified: true,
	message: "สวัสดีค่ะคุณหนุ่ย ทางเราได้รับสลิปเรียบร้อยแล้วนะคะ ขอเวลาตรวจสอบยอดกับทีมสักครู่ แล้วจะแจ้งรอบว่างสุดสัปดาห์กลับไปอีกครั้งค่ะ",
	context: [
		"ลูกค้าเดิม · ต่ออายุ Premium",
		"ส่งหลักฐานการโอนเมื่อวาน 21:14",
		"ยังไม่ยืนยันยอด — รอเปอร์ตรวจ"
	],
	confidence: "สูง",
	client_label: "คุณหนุ่ย",
	client_id: "recDEMO000412"
}, {
	id: "dr-2",
	channel: "LINE Official Account",
	recipient: null,
	recipient_verified: false,
	message: "สวัสดีค่ะ ขอบคุณที่สนใจนะคะ รบกวนขอชื่อที่เคยใช้กับเราหรือเบอร์ติดต่อ เพื่อให้ทีมตรวจสอบข้อมูลก่อนแจ้งรายละเอียดค่ะ",
	context: ["ยังจับคู่ลูกค้าไม่ชัด", "หยุดที่ Identity Review"],
	confidence: "ต่ำ",
	client_label: null,
	client_id: null
}];
/** Demo fixtures only on Lovable preview/local with demo provider; live gets empty (fail closed). */
var EMPTY_CONTINUITY = {
	authority: "backend",
	client_label: null,
	client_id: null,
	steps: []
};
var WORKFLOW = [
	"Review",
	"QA",
	"Publish",
	"Audit Log"
];
var TABS = [
	{
		id: "overview",
		label: "Overview"
	},
	{
		id: "models",
		label: "Models"
	},
	{
		id: "knowledge",
		label: "Knowledge Sets"
	},
	{
		id: "access",
		label: "Access"
	},
	{
		id: "routing",
		label: "Routing"
	},
	{
		id: "qa",
		label: "QA & Preview"
	},
	{
		id: "publish",
		label: "Publish"
	},
	{
		id: "audit",
		label: "Audit Log"
	},
	{
		id: "settings",
		label: "Settings"
	}
];
function Panel({ title, intro, endpoints, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		role: "tabpanel",
		"aria-label": title,
		className: "space-y-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-lg border border-border bg-surface p-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[15px] font-semibold",
					children: title
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[13px] text-muted-foreground",
					children: intro
				}),
				endpoints && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 space-y-1 border-t border-border pt-3",
					children: endpoints.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
						className: "font-mono text-[11px] text-muted-foreground",
						children: e
					}, e))
				})
			]
		}), children]
	});
}
function StateChip({ state }) {
	if (!state) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "text-[11px] text-muted-foreground",
		children: "unknown"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("rounded border px-1.5 py-0.5 font-mono text-[10px]", state === "live" || state === "qa_passed" || state === "passed" ? "border-verified/50 text-verified" : state === "qa_failed" || state === "failed" ? "border-destructive/50 text-destructive" : "border-warning/50 text-warning"),
		children: String(state)
	});
}
function Async({ query, empty, children }) {
	if (query.isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "rounded-lg border border-border bg-surface-2 p-4 text-[12px] text-muted-foreground",
		children: "Checking backend…"
	});
	if (query.error) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		role: "alert",
		className: "rounded-lg border border-destructive/50 bg-surface p-4 text-[12px] text-destructive",
		children: [
			"Backend unavailable — ",
			query.error.message,
			". Nothing is assumed; retry or check the Worker."
		]
	});
	const data = query.data;
	if (!data || Array.isArray(data) && data.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "rounded-lg border border-border bg-surface-2 p-4 text-[12px] text-muted-foreground",
		children: empty
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: children(data) });
}
function Rows({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "divide-y divide-border rounded-lg border border-border bg-surface",
		children
	});
}
function Row({ primary, secondary, meta, right }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-start gap-3 p-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0 flex-1",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "truncate text-[13px] font-medium",
					children: primary
				}),
				secondary && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-0.5 text-[12px] text-muted-foreground",
					children: secondary
				}),
				meta && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-1 font-mono text-[11px] text-muted-foreground",
					children: meta
				})
			]
		}), right && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "shrink-0 text-right",
			children: right
		})]
	});
}
function ActionResult({ result }) {
	if (!result) return null;
	const ok = result.status === "ok";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
		role: "status",
		className: cn("mt-2 text-[12px]", ok ? "text-verified" : "text-warning"),
		children: [
			result.status.toUpperCase(),
			" — ",
			result.message ?? "No message returned.",
			result.audit_ref && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "ml-1 font-mono",
				children: [
					"(",
					result.audit_ref,
					")"
				]
			})
		]
	});
}
function OverviewPanel() {
	const q = useQuery({
		queryKey: ["kenji", "overview"],
		queryFn: ({ signal }) => kenjiApi.overview(signal)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Overview",
		intro: "Current Kenji state across knowledge, models and routing, as reported by the backend.",
		endpoints: ["GET /v1/admin/kenji/overview"],
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Async, {
			query: q,
			empty: "Backend returned no overview state.",
			children: (d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Rows, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					primary: "Live revision",
					right: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[12px]",
						children: d.live_revision ?? "—"
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					primary: "Draft revision",
					right: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[12px]",
						children: d.draft_revision ?? "—"
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					primary: "Workflow state",
					right: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateChip, { state: d.state })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					primary: "Open review items",
					right: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[12px]",
						children: d.open_review_items ?? "—"
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					primary: "Last publish",
					secondary: d.last_publish_by ? `by ${d.last_publish_by}` : void 0,
					right: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[12px]",
						children: d.last_publish_at ?? "—"
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					primary: "Last audit entry",
					secondary: d.last_audit_entry ?? "—"
				})
			] })
		})
	});
}
function ModelsPanel() {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: ["kenji", "models"],
		queryFn: ({ signal }) => kenjiApi.models(signal)
	});
	const draft = useMutation({
		mutationFn: (id) => kenjiApi.createModelDraft(id),
		onSuccess: () => void qc.invalidateQueries({ queryKey: ["kenji"] })
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
		title: "Models",
		intro: "Registered Kenji models and their draft revisions. Draft edits stay unpublished until Publish.",
		endpoints: ["GET /v1/admin/kenji/models", "POST /v1/admin/kenji/models/draft"],
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Async, {
				query: q,
				empty: "Backend returned no models.",
				children: (models) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rows, { children: models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					primary: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [m.name, m.is_default && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "ml-2 rounded border border-gold/50 px-1.5 py-0.5 text-[10px] text-gold",
						children: "default"
					})] }),
					secondary: [m.provider, m.note].filter(Boolean).join(" · ") || void 0,
					meta: `${m.id}${m.revision ? ` · ${m.revision}` : ""}${m.updated_at ? ` · ${m.updated_at}` : ""}`,
					right: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateChip, { state: m.state }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => draft.mutate(m.id),
							disabled: draft.isPending,
							className: "block rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface-2 disabled:opacity-50",
							children: draft.isPending ? "Working…" : "Create draft"
						})]
					})
				}, m.id)) })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionResult, { result: draft.data }),
			draft.error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				role: "alert",
				className: "text-[12px] text-destructive",
				children: ["Draft failed — ", draft.error.message]
			})
		]
	});
}
function KnowledgePanel() {
	const q = useQuery({
		queryKey: ["kenji", "knowledge"],
		queryFn: ({ signal }) => kenjiApi.knowledge(signal)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Knowledge Sets",
		intro: "Knowledge sets that ground Kenji answers. Detail routes drive the review workflow.",
		endpoints: ["GET /v1/admin/kenji/knowledge"],
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Async, {
			query: q,
			empty: "Backend returned no knowledge sets.",
			children: (sets) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rows, { children: sets.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				primary: s.name,
				secondary: [s.owner && `owner ${s.owner}`, s.document_count != null && `${s.document_count} docs`].filter(Boolean).join(" · "),
				meta: `${s.id}${s.revision ? ` · ${s.revision}` : ""}${s.updated_at ? ` · ${s.updated_at}` : ""}`,
				right: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateChip, { state: s.state }), s.detail_path && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: s.detail_path,
						className: "block rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface-2",
						children: "Review"
					})]
				})
			}, s.id)) })
		})
	});
}
function AccessPanel() {
	const q = useQuery({
		queryKey: ["kenji", "access"],
		queryFn: ({ signal }) => kenjiApi.access(signal)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Access",
		intro: "Who and which member lanes may reach each Kenji surface. Access is resolved by the backend — no frontend entitlement inference.",
		endpoints: ["GET /v1/admin/kenji/access"],
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Async, {
			query: q,
			empty: "Backend returned no access rules.",
			children: (rules) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rows, { children: rules.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				primary: r.surface,
				secondary: [
					r.audience,
					r.lane && `lane ${r.lane}`,
					r.note
				].filter(Boolean).join(" · "),
				meta: r.resolver ?? void 0,
				right: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: cn("rounded border px-1.5 py-0.5 font-mono text-[10px]", r.allowed === true ? "border-verified/50 text-verified" : r.allowed === false ? "border-destructive/50 text-destructive" : "border-warning/50 text-warning"),
					children: r.allowed === true ? "allowed" : r.allowed === false ? "blocked" : "unknown"
				})
			}, r.id)) })
		})
	});
}
function RoutingPanel() {
	const q = useQuery({
		queryKey: ["kenji", "routing"],
		queryFn: ({ signal }) => kenjiApi.routing(signal)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Routing",
		intro: "Intent and lane routing rules between knowledge sets and models. Changes enter the draft path.",
		endpoints: ["GET /v1/admin/kenji/routing"],
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Async, {
			query: q,
			empty: "Backend returned no routing rules.",
			children: (rules) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rows, { children: rules.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				primary: r.intent,
				secondary: [
					r.lane && `lane ${r.lane}`,
					r.knowledge_set,
					r.model
				].filter(Boolean).join(" → "),
				meta: r.priority != null ? `priority ${r.priority}` : void 0,
				right: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateChip, { state: r.state })
			}, r.id)) })
		})
	});
}
function QaPanel() {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: ["kenji", "qa"],
		queryFn: ({ signal }) => kenjiApi.qa(signal)
	});
	const run = useMutation({
		mutationFn: (rev) => kenjiApi.runQa(rev),
		onSuccess: () => void qc.invalidateQueries({ queryKey: ["kenji"] })
	});
	const canRun = q.data?.can_run === true && !run.isPending;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "QA & Preview",
		intro: "Exercise the draft before it can be published. A draft cannot reach Publish without a recorded QA pass — the backend enforces this.",
		endpoints: ["GET /v1/admin/kenji/qa", "POST /v1/admin/kenji/qa/run"],
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Async, {
			query: q,
			empty: "Backend returned no QA state.",
			children: (d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-lg border border-border bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[12px] text-muted-foreground",
								children: "Draft revision"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[12px]",
								children: d.draft_revision ?? "—"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: !canRun,
								onClick: () => run.mutate(d.draft_revision ?? null),
								className: "rounded-md border border-gold/60 bg-gold-muted px-3 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50",
								children: run.isPending ? "Running QA…" : "Run QA"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: d.preview_url ?? "/member/kenji-ai-20?mode=admin-preview",
								className: "rounded-md border border-border px-3 py-1.5 text-[12px] hover:bg-surface-2",
								children: "Open admin preview"
							})
						]
					}),
					d.can_run !== true && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-2 text-[12px] text-warning",
						children: ["QA run not authorised by backend", d.blocked_reason ? ` — ${d.blocked_reason}` : "."]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionResult, { result: run.data }),
					run.error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						role: "alert",
						className: "mt-2 text-[12px] text-destructive",
						children: ["QA run failed — ", run.error.message]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rows, { children: d.runs.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				primary: `${r.id} · ${r.revision ?? "—"}`,
				secondary: r.summary ?? void 0,
				meta: [r.started_at, r.finished_at].filter(Boolean).join(" → "),
				right: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateChip, { state: r.status }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "font-mono text-[11px] text-muted-foreground",
						children: [
							r.passed ?? "—",
							"/",
							(r.passed ?? 0) + (r.failed ?? 0)
						]
					})]
				})
			}, r.id)) })] })
		})
	});
}
function PublishPanel() {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: ["kenji", "publish"],
		queryFn: ({ signal }) => kenjiApi.publishState(signal)
	});
	const publish = useMutation({
		mutationFn: (rev) => kenjiApi.publish(rev),
		onSuccess: () => void qc.invalidateQueries({ queryKey: ["kenji"] })
	});
	const canPublish = q.data?.can_publish === true && !publish.isPending;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Publish",
		intro: "Promote a QA-passed draft to live. Publish is a guarded backend action and always writes an audit entry.",
		endpoints: ["GET /v1/admin/kenji/publish", "POST /v1/admin/kenji/publish"],
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Async, {
			query: q,
			empty: "Backend returned no publish state.",
			children: (d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-lg border border-border bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
						className: "grid gap-2 text-[12px] sm:grid-cols-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
								className: "text-muted-foreground",
								children: "Live"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
								className: "font-mono",
								children: d.live_revision ?? "—"
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
								className: "text-muted-foreground",
								children: "Draft"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
								className: "font-mono",
								children: d.draft_revision ?? "—"
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
								className: "text-muted-foreground",
								children: "QA status"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateChip, { state: d.qa_status }) })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
								className: "text-muted-foreground",
								children: "Last publish"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dd", {
								className: "font-mono",
								children: [d.last_publish_at ?? "—", d.last_publish_by ? ` · ${d.last_publish_by}` : ""]
							})] })
						]
					}),
					d.warnings?.map((w) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-[12px] text-warning",
						children: w
					}, w)),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: !canPublish,
						onClick: () => publish.mutate(d.draft_revision ?? null),
						className: "mt-4 rounded-md border border-gold/60 bg-gold-muted px-3 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50",
						children: publish.isPending ? "Publishing…" : "Publish draft"
					}),
					d.can_publish !== true && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-2 text-[12px] text-warning",
						children: ["Publish not authorised by backend", d.blocked_reason ? ` — ${d.blocked_reason}` : "."]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionResult, { result: publish.data }),
					publish.error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						role: "alert",
						className: "mt-2 text-[12px] text-destructive",
						children: ["Publish failed — ", publish.error.message]
					})
				]
			})
		})
	});
}
function StaticPanel({ title, intro, points }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title,
		intro,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "list-disc space-y-1.5 rounded-lg border border-border bg-surface-2 p-4 pl-8 text-[12px] text-muted-foreground",
			children: points.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: p }, p))
		})
	});
}
var ROOM_TABS = [
	{
		id: "today",
		label: "วันนี้"
	},
	{
		id: "continuity",
		label: "ลูกค้าต่อเนื่อง"
	},
	{
		id: "drafts",
		label: "ร่างให้ดู"
	},
	{
		id: "knowledge",
		label: "ความรู้ & ความปลอดภัย"
	}
];
function KnowledgeAndSafety() {
	const [active, setActive] = (0, import_react.useState)("knowledge");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[20px] font-semibold tracking-tight",
					children: "ความรู้ & ความปลอดภัย"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[15px] text-muted-foreground",
					children: "ความรู้ที่เผยแพร่แล้วทำให้ Kenji “ร่างคำตอบได้” เท่านั้น — ไม่ได้สร้างสิทธิ์ ไม่ยืนยันยอด และไม่อนุมัติสมาชิก"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
					className: "mt-3 flex flex-wrap items-center gap-2",
					children: WORKFLOW.map((w, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "rounded-md border border-gold/40 bg-gold-muted px-2 py-1 text-[13px]",
							children: w
						}), i < WORKFLOW.length - 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							"aria-hidden": true,
							className: "text-[13px] text-muted-foreground",
							children: "→"
						})]
					}, w))
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				role: "tablist",
				"aria-label": "Kenji knowledge sections",
				className: "flex flex-wrap gap-1.5",
				children: TABS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					role: "tab",
					type: "button",
					"aria-selected": t.id === active,
					onClick: () => setActive(t.id),
					className: cn("step-transition min-h-[44px] rounded-xl border px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring", t.id === active ? "border-gold/60 bg-gold-muted text-foreground" : "border-border bg-surface text-muted-foreground hover:bg-surface-2"),
					children: t.label
				}, t.id))
			}),
			active === "overview" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OverviewPanel, {}),
			active === "models" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelsPanel, {}),
			active === "knowledge" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KnowledgePanel, {}),
			active === "access" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccessPanel, {}),
			active === "routing" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoutingPanel, {}),
			active === "qa" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QaPanel, {}),
			active === "publish" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PublishPanel, {}),
			active === "audit" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StaticPanel, {
				title: "Audit Log",
				intro: "Immutable record of review, QA and publish events.",
				points: ["Read-only", "Ordered newest first from the backend"]
			}),
			active === "settings" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StaticPanel, {
				title: "Settings",
				intro: "Operator-level Kenji configuration.",
				points: ["Settings are stored and validated by the backend"]
			})
		]
	});
}
function KenjiControlCentre() {
	const [room, setRoom] = (0, import_react.useState)("today");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "Kenji AI",
		path: "/internal/admin/kenji",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-4xl space-y-6 px-4 py-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoomDestinations, {
					items: KENJI_ROOM_ITEMS,
					current: "/internal/admin/kenji"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
					"aria-label": "Kenji sections",
					className: "flex flex-wrap gap-2",
					children: ROOM_TABS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-current": t.id === room ? "page" : void 0,
						onClick: () => setRoom(t.id),
						className: cn("step-transition min-h-[44px] rounded-xl border px-4 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring", t.id === room ? "border-gold/60 bg-gold-muted font-medium text-foreground" : "border-border bg-surface text-muted-foreground hover:bg-surface-2"),
						children: t.label
					}, t.id))
				}),
				room === "today" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KenjiToday, {
					demoCases: usingDemoData() ? DEMO_CASES : [],
					onOpenDrafts: () => setRoom("drafts")
				}),
				room === "continuity" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KenjiContinuityView, { demo: usingDemoData() ? DEMO_CONTINUITY : EMPTY_CONTINUITY }),
				room === "drafts" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KenjiDrafts, { demo: usingDemoData() ? DEMO_DRAFTS : [] }),
				room === "knowledge" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KnowledgeAndSafety, {})
			]
		})
	});
}
//#endregion
export { KenjiControlCentre as component };
