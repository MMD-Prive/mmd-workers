import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { o as cn, s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { p as Search } from "../_libs/lucide-react.mjs";
import { a as MODEL_ROOM_ITEMS, n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { n as RoomDestinations } from "./CanonPage-FXlmFGAJ.mjs";
import { t as AiAdvisory } from "./AiAdvisory-COXlDbpb.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.ceo.models-B5IiDvj3.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* MODELS & STUDIO — model lookup + readiness gate (READ ONLY, typed interface).
*
* Every readiness state is backend-owned and never inferred in the browser.
* The existing `/v1/admin/models/search` contract is scoped to Create Job
* eligibility (it requires a client and a work type), so it is NOT reused as a
* general model lookup; until a canonical lookup/readiness contract exists,
* live origins report `unavailable` and no sample model is rendered.
*/
var READINESS_LABELS = {
	canonical_record: "Canonical record",
	r2_migration: "ย้ายไฟล์จาก R2",
	primary_image: "ภาพหลัก",
	public_profile: "โปรไฟล์สาธารณะ",
	gallery: "แกลเลอรี",
	compcard: "Compcard"
};
var ITEM_ORDER = [
	"canonical_record",
	"r2_migration",
	"primary_image",
	"public_profile",
	"gallery",
	"compcard"
];
/** DEMO / PREVIEW ONLY — ตัวอย่าง UI · ไม่ใช่ข้อมูลจริง. */
function demoModel(model_id, working_name, display_name, states) {
	return {
		model_id,
		working_name,
		display_name,
		last_updated_at: "2026-09-06",
		source_status: "demo",
		readiness: ITEM_ORDER.map((id) => ({
			item_id: id,
			label: READINESS_LABELS[id],
			state: states[id] ?? "ready",
			detail: null,
			target_url: "/internal/admin/studio"
		}))
	};
}
var DEMO_MODELS = [
	demoModel("recMD000021", "Rin", "Rin S.", {
		compcard: "missing",
		gallery: "review"
	}),
	demoModel("recMD000042", "Kaito", "Kaito M.", {
		canonical_record: "ready",
		r2_migration: "missing",
		public_profile: "missing"
	}),
	demoModel("recMD000078", "Sora", "Sora T.", { primary_image: "checking" })
];
/**
* Read model lookup results. Live origins have no canonical lookup contract
* yet, so they return `unavailable` with no records — the UI then shows
* “กำลังรอข้อมูลโมเดลจากระบบหลังบ้าน”.
*/
async function readModelLookup(query) {
	if (isPreviewRuntime()) {
		const q = query.trim().toLowerCase();
		const match = (m) => [
			m.model_id,
			m.working_name,
			m.display_name
		].filter(Boolean).join(" ").toLowerCase().includes(q);
		return {
			source_status: "demo",
			recent: DEMO_MODELS,
			results: q === "" ? [] : DEMO_MODELS.filter(match)
		};
	}
	return {
		source_status: "unavailable",
		recent: [],
		results: []
	};
}
/**
* MODELS & STUDIO — model lookup + readiness gate.
*
* Read-only. Every readiness state is backend-supplied; the browser never
* infers readiness and this component exposes no publish, upload or commit
* control — only navigation to the relevant Studio destination.
*/
var STATE_STYLE = {
	ready: {
		th: "พร้อม",
		cls: "border-verified/50 text-verified"
	},
	missing: {
		th: "ยังขาด",
		cls: "border-warn/50 bg-warn/10 text-warn"
	},
	review: {
		th: "รอตรวจ",
		cls: "border-warn/50 text-warn"
	},
	checking: {
		th: "กำลังตรวจ",
		cls: "border-border text-muted-foreground"
	},
	unknown: {
		th: "ไม่ทราบสถานะ",
		cls: "border-border text-muted-foreground"
	}
};
function ReadinessGate({ model }) {
	const missing = model.readiness.filter((r) => r.state === "missing" || r.state === "review");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "rounded-2xl border border-border bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[17px] font-semibold",
						children: model.display_name ?? model.working_name ?? model.model_id
					}),
					model.working_name && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-[13px] text-muted-foreground",
						children: ["Working Name · ", model.working_name]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[13px] text-muted-foreground",
						children: model.model_id
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-[15px] text-foreground/85",
				children: missing.length === 0 ? "ระบบหลังบ้านแจ้งว่าครบทุกรายการแล้ว" : `ยังขาด ${missing.length} รายการ — ไปทำต่อที่ Studio ตามลิงก์ในแต่ละรายการ`
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 space-y-2",
				children: model.readiness.map((r) => {
					const s = STATE_STYLE[r.state];
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-0",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "min-w-[140px] text-[15px]",
								children: r.label
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: cn("rounded-md border px-2 py-0.5 text-[13px]", s.cls),
								children: s.th
							}),
							r.detail && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[13px] text-muted-foreground",
								children: r.detail
							}),
							(r.state === "missing" || r.state === "review") && (r.target_url && !r.target_url.startsWith("/internal/admin/studio") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: r.target_url,
								className: "ml-auto inline-flex min-h-[44px] items-center text-[15px] text-primary underline-offset-4 hover:underline",
								children: "ไปทำต่อ"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/internal/admin/studio",
								className: "ml-auto inline-flex min-h-[44px] items-center text-[15px] text-primary underline-offset-4 hover:underline",
								children: "ไปทำต่อที่สตูดิโอ"
							}))
						]
					}, r.item_id);
				})
			}),
			model.last_updated_at && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 text-[13px] text-muted-foreground",
				children: ["อัปเดตล่าสุด ", model.last_updated_at]
			})
		]
	});
}
function ModelLookup() {
	const [input, setInput] = (0, import_react.useState)("");
	const [query, setQuery] = (0, import_react.useState)("");
	const [data, setData] = (0, import_react.useState)(null);
	const [checking, setChecking] = (0, import_react.useState)(true);
	(0, import_react.useEffect)(() => {
		let alive = true;
		setChecking(true);
		readModelLookup(query).then((r) => {
			if (alive) setData(r);
		}).finally(() => {
			if (alive) setChecking(false);
		});
		return () => {
			alive = false;
		};
	}, [query]);
	function submit(e) {
		e.preventDefault();
		setQuery(input.trim());
	}
	const unavailable = data?.source_status === "unavailable";
	const shown = query ? data?.results ?? [] : data?.recent ?? [];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[17px] font-semibold tracking-tight",
					children: "ค้นหาโมเดล"
				}), data?.source_status === "demo" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-[13px] text-warn",
					children: "ตัวอย่าง UI · ไม่ใช่ข้อมูลจริง"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				onSubmit: submit,
				role: "search",
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
						className: "h-4 w-4 shrink-0 text-muted-foreground",
						"aria-hidden": true
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: input,
						onChange: (e) => setInput(e.target.value),
						placeholder: "ชื่อ / Working Name / Model ID",
						"aria-label": "ค้นหาโมเดล — ชื่อ / Working Name / Model ID",
						className: "min-h-[44px] w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "submit",
					className: "min-h-[44px] rounded-xl border border-border bg-surface px-4 text-[15px] hover:bg-surface-2",
					children: "ค้นหา"
				})]
			}),
			checking ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "rounded-2xl border border-border bg-surface p-4 text-[15px] text-muted-foreground",
				children: "กำลังตรวจสอบข้อมูลโมเดลจากระบบหลังบ้าน"
			}) : unavailable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "rounded-2xl border border-warn/50 bg-warn/10 p-4 text-[15px] text-warn",
				children: "กำลังรอข้อมูลโมเดลจากระบบหลังบ้าน — หน้านี้จะไม่แสดงโมเดลตัวอย่างแทนข้อมูลจริง"
			}) : shown.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "rounded-2xl border border-border bg-surface p-4 text-[15px] text-muted-foreground",
				children: "ไม่พบโมเดลที่ตรงกับคำค้นนี้จากระบบหลังบ้าน"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[13px] text-muted-foreground",
					children: [query ? "ผลการค้นหา" : "ดูล่าสุด", " · รุ่นนี้ขาดอะไร และไปทำต่อที่ไหน"]
				}), shown.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReadinessGate, { model: m }, m.model_id))]
			})
		]
	});
}
var CARDS = [
	{
		title: "Model readiness",
		th: "ความพร้อมของโมเดล",
		body: "โมเดลที่พร้อมรับงาน และโมเดลที่ยังต้อง review เข้าสู่ Models ก่อนใช้งานจริง",
		to: "/internal/admin/studio"
	},
	{
		title: "Studio Upload",
		th: "อัปโหลดเข้าสตูดิโอ",
		body: "รับไฟล์เข้าระบบ ตรวจความถูกต้องโดยระบบหลังบ้านก่อนบันทึก",
		to: "/internal/admin/studio/upload"
	},
	{
		title: "Review",
		th: "ตรวจสอบ",
		body: "ตรวจและ stage แหล่งข้อมูลให้กลายเป็น canonical model record",
		to: "/internal/admin/studio/review"
	},
	{
		title: "Preview",
		th: "พรีวิว",
		body: "Final Preview ใช้ตรวจดูเท่านั้น · ไม่ให้สิทธิ์ publish",
		to: "/internal/admin/studio/model-preview"
	},
	{
		title: "Care-back",
		th: "ดูแลต่อเนื่อง",
		body: "ติดตามโมเดลที่ต้องอัปเดตชุดภาพหรือข้อมูลใหม่",
		to: "/internal/admin/studio/care-back"
	}
];
function ModelsRoom() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "โมเดล & สตูดิโอ",
		path: "/internal/ceo/models",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-4xl space-y-6 px-4 py-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoomDestinations, {
					items: MODEL_ROOM_ITEMS,
					current: "/internal/ceo/models"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-2xl font-semibold tracking-tight",
					children: "โมเดล & สตูดิโอ"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground",
					children: "ค้นหาโมเดลแล้วดูว่ารุ่นนั้นขาดอะไรและไปทำต่อที่ไหน การบันทึกและการเผยแพร่ทั้งหมดทำผ่านระบบหลังบ้านเดิม"
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelLookup, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "grid gap-3 sm:grid-cols-2",
					children: CARDS.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: c.to,
						className: "rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[16px] font-semibold",
								children: c.th
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block text-[13px] text-muted-foreground",
								children: c.title
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mt-2 block text-[15px] text-muted-foreground",
								children: c.body
							})
						]
					}, c.title))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AiAdvisory, {
					mode: "auto",
					title: "AI ช่วยดูสตูดิโอ",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "ยังไม่มีคำแนะนำที่เชื่อถือได้" })
				})
			]
		})
	});
}
//#endregion
export { ModelsRoom as component };
