import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { i as apiGet, o as cn, s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { A as modelSearchScope, B as safePartnerDashboardUrl, C as isPartnerManaged, D as lockFromStorage, E as linkBadge, F as preselectFromModel, G as sourceChoiceReady, H as sameAttribution, I as privateModelReady, J as usingDemoData, K as updatePrivateModelSelection, L as privateWorkRejection, M as partnerConflict, N as partnerMissing, O as mergeAttribution, P as partnerOnModelChange, S as isMissingMemberCreateError, U as selectPartner, W as servicePricing, Y as writesBlockedInPreview, _ as computeDepositBreakdown, a as EMPTY_PARTNER, b as findWorkType, c as PARTNER_TYPE_LABEL, d as PreviewWriteBlockedError, f as WORK_TYPE_OPTIONS, g as clearPending, h as buildJobBody, i as DURATION_OPTIONS, j as modelSelectable, k as modelPartnerLink, l as PRIVATE_SEARCH_FOLDERS, m as api, n as BRIDGE_TIERS, o as EMPTY_PRIVATE_ACCESS, p as adoptModelPartner, r as DIRECT_CHOICE, s as JobGrantError, t as ApiHttpError, u as PRIVATE_SERVICE_OPTIONS, v as computeEndTime, w as isValidMapUrl, x as isCanonicalRecordId, y as createMutationGuard, z as runGuardedCreate } from "./provider-CvQy8AcV.mjs";
import { $ as BadgeCheck, B as CircleX, C as LoaderCircle, G as ChevronRight, H as CircleCheck, L as Copy, P as ExternalLink, R as Clock, a as TriangleAlert, d as ShieldCheck, f as ShieldAlert, i as Upload, j as FolderOpen, l as ShieldQuestionMark, n as Wallet, nt as ArrowLeft, p as Search, q as Check, t as X, x as Lock, z as Circle } from "../_libs/lucide-react.mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as Button } from "./button-C7XS-FYH.mjs";
import { t as Input } from "./input-Dk5AGV7h.mjs";
import { d as DialogContent$1, f as DialogDescription$1, h as DialogTitle$1, l as Dialog$1, m as DialogPortal$1, p as DialogOverlay$1, u as DialogClose } from "../_libs/@radix-ui/react-alert-dialog+[...].mjs";
import { n as CheckboxIndicator, t as Checkbox$1 } from "../_libs/@radix-ui/react-checkbox+[...].mjs";
import { a as Label, c as SelectContent, d as SelectValue, f as Textarea, i as CUSTOMER_GENDER_LABELS, l as SelectItem, n as BroadcastListPage, o as ModeSwitch, p as publishToJobBoard, r as BroadcastWorkPage, s as Select, t as BOARD_TEXT_MAX, u as SelectTrigger } from "./BroadcastListPage-BWcEFh9g.mjs";
import { r as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { t as CustomerIdentityAction } from "./CustomerIdentityAction-DeT6j4Ki.mjs";
import { t as Route } from "./internal.admin.jobs.create-job-DcBppxqP.mjs";
import { t as Skeleton } from "./skeleton-McP_xT7w.mjs";
import { i as AccordionTrigger, n as AccordionContent, r as AccordionItem, t as Accordion } from "./accordion-Tku30sEi.mjs";
import { a as numberType, i as literalType, n as booleanType, o as objectType, r as enumType, s as stringType, t as arrayType } from "../_libs/zod.mjs";
import { t as Separator$1 } from "../_libs/radix-ui__react-separator.mjs";
import { n as SwitchThumb, t as Switch$1 } from "../_libs/radix-ui__react-switch.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.jobs.create-job-Cw4qarTr.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Partner lookup (READ ONLY) — Airtable "Model Partners" via Worker.
* GET /v1/admin/partners/lookup?q= may not exist yet: any failure degrades to
* free text ({ available: false }). Never blocks job creation.
*/
var TYPES = [
	"bridge",
	"co_partner",
	"profit_share"
];
function norm(raw) {
	const id = raw["partner_record_id"] ?? raw["record_id"] ?? raw["id"];
	const name = raw["partner_name"] ?? raw["name"];
	if (typeof id !== "string" || !/^rec[A-Za-z0-9]{6,}$/.test(id)) return null;
	if (typeof name !== "string" || !name.trim()) return null;
	const t = raw["partner_type"];
	return {
		partner_record_id: id,
		partner_name: name.trim(),
		partner_type: TYPES.includes(t) ? t : null,
		kind: typeof raw["kind"] === "string" ? raw["kind"] : null
	};
}
var DEMO = [{
	partner_record_id: "recDEMOpartner01",
	partner_name: "Kendo (ตัวอย่าง)",
	partner_type: "co_partner",
	kind: "agency"
}, {
	partner_record_id: "recDEMOpartner02",
	partner_name: "Siam Agency (ตัวอย่าง)",
	partner_type: "bridge",
	kind: "agency"
}];
/** Active recognized partners for the Step 03 dropdown (empty q). Fails closed: no free text. */
async function listActivePartners(signal) {
	if (isPreviewRuntime()) return {
		available: true,
		demo: true,
		items: DEMO
	};
	const data = await apiGet("/v1/admin/partners/lookup?q=", signal);
	const src = data?.["data"] && typeof data["data"] === "object" ? data["data"] : data;
	const list = src?.["items"] ?? src?.["records"];
	if (src?.["available"] === false || !Array.isArray(list)) return {
		available: false,
		items: []
	};
	return {
		available: true,
		items: list.map((r) => norm(r ?? {})).filter((p) => p !== null)
	};
}
/** Shared Partner dropdown (Step 03 + Step 04). Active backend partners only — no free text. */
function useActivePartners() {
	return useQuery({
		queryKey: ["partners-active"],
		queryFn: ({ signal }) => listActivePartners(signal),
		retry: false,
		staleTime: 6e4
	});
}
function PartnerPicker({ value, onChange }) {
	const partners = useActivePartners();
	const d = partners.data;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-1.5",
		children: [
			partners.isLoading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "กำลังโหลดรายชื่อพาร์ตเนอร์…"
			}),
			(partners.isError || d?.available === false) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "text-[13px] text-destructive",
				children: "โหลดรายชื่อพาร์ตเนอร์ไม่ได้ · กรุณาลองอีกครั้ง"
			}),
			d?.available && d.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "ยังไม่มีพาร์ตเนอร์ที่พร้อมรับงาน"
			}),
			d?.available && d.items.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
				value: d.items.some((p) => p.partner_record_id === value.record_id) ? value.record_id : "",
				onValueChange: (id) => {
					const p = d.items.find((x) => x.partner_record_id === id);
					if (p) onChange(selectPartner(value, p));
				},
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
					className: "h-11 w-full border-border bg-surface",
					"aria-label": "เลือกพาร์ตเนอร์",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "เลือกพาร์ตเนอร์" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: d.items.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
					value: p.partner_record_id,
					children: p.partner_name
				}, p.partner_record_id)) })]
			}),
			d?.demo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[12px] text-warn",
				children: "ข้อมูลตัวอย่าง · ไม่ใช่ข้อมูลจริง"
			})
		]
	});
}
function PrivateModelScope({ value, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mb-4 space-y-3",
		"aria-label": "เลือกเงื่อนไขงานส่วนตัว",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[14px] text-muted-foreground",
				children: "เลือกกลุ่มน้องๆและนายแบบ ความชอบของลูกค้า และประเภทงานให้ตรงกับที่ตกลงไว้ จะค้นหาน้องๆและนายแบบก่อน แล้วกลับมาเติมข้อมูลที่เหลือก็ได้"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-1.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
						className: "text-[13px] text-muted-foreground",
						children: "กลุ่มน้องๆและนายแบบที่ต้องการ"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: value.folder ?? "",
						onValueChange: (folder) => onChange({ folder }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "h-11 border-border bg-surface",
							"aria-label": "กลุ่มน้องๆและนายแบบที่ต้องการ",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "เลือกกลุ่มน้องๆและนายแบบ" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: PRIVATE_SEARCH_FOLDERS.map((folder) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: folder,
							children: folder
						}, folder)) })]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-1.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
						className: "text-[13px] text-muted-foreground",
						children: "ความชอบของลูกค้า"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: value.orientation ?? "",
						onValueChange: (orientation) => onChange({ orientation }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "h-11 border-border bg-surface",
							"aria-label": "ความชอบของลูกค้า",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "เลือกความชอบ" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: ["straight", "gay"].map((orientation) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: orientation,
							children: orientation
						}, orientation)) })]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
					className: "text-[13px] text-muted-foreground",
					children: "ประเภทงานส่วนตัว"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
					value: value.job_type ?? "",
					onValueChange: (jobType) => onChange({ job_type: jobType }),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
						className: "h-11 border-border bg-surface",
						"aria-label": "ประเภทงานส่วนตัว",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "เลือก PN / VIP" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: ["pn", "vip"].map((jobType) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
						value: jobType,
						children: jobType.toUpperCase()
					}, jobType)) })]
				})]
			})
		]
	});
}
var STEPS = [
	{
		id: 1,
		code: "01",
		label: "ลูกค้า",
		shortLabel: "ลูกค้า"
	},
	{
		id: 2,
		code: "02",
		label: "ข้อมูลลูกค้าและงาน",
		shortLabel: "ข้อมูลลูกค้า"
	},
	{
		id: 3,
		code: "03",
		label: "สถานที่และบรีฟ MMD",
		shortLabel: "สถานที่"
	},
	{
		id: 4,
		code: "04",
		label: "น้องๆและนายแบบ",
		shortLabel: "เลือกคน"
	},
	{
		id: 5,
		code: "05",
		label: "เรทและบรีฟน้องๆ",
		shortLabel: "เรทน้องๆ"
	},
	{
		id: 6,
		code: "06",
		label: "ตรวจสรุป",
		shortLabel: "ตรวจสรุป"
	},
	{
		id: 7,
		code: "07",
		label: "สร้างงาน",
		shortLabel: "สร้างงาน"
	}
];
function StepRail({ current, maxUnlocked, completed, onSelect, orientation = "horizontal" }) {
	const vertical = orientation === "vertical";
	const lockedHelper = (step) => {
		if (step === 2) return "เลือกลูกค้าก่อน";
		if (step === 3) return "กรอกข้อมูลลูกค้าและงานก่อน";
		if (step === 4) return "กรอกสถานที่ก่อน";
		if (step === 5) return "ตรวจผู้รับงานและ PN/VIP ก่อน";
		return "กรอกข้อมูลก่อน";
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
		"aria-label": "ขั้นตอนสร้างงาน",
		className: "w-full",
		children: [!vertical && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "min-w-0 truncate text-[13px] font-semibold text-foreground",
				children: [
					"Step ",
					STEPS[current - 1]?.code,
					" · ",
					STEPS[current - 1]?.shortLabel
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "shrink-0 text-[13px] text-muted-foreground",
				children: [
					current,
					" / ",
					STEPS.length
				]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
			className: cn("grid w-full gap-1", vertical ? "grid-cols-1" : "grid-cols-7"),
			children: STEPS.map((s) => {
				const locked = s.id > maxUnlocked;
				const active = s.id === current;
				const done = completed.includes(s.id);
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "min-w-0",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						disabled: locked,
						"aria-current": active ? "step" : void 0,
						"aria-disabled": locked,
						onClick: () => !locked && onSelect(s.id),
						className: cn("step-transition group min-h-11 w-full rounded-md border px-2 py-1.5 text-left outline-none", "focus-visible:ring-2 focus-visible:ring-ring", active ? "border-gold/60 bg-gold-muted" : "border-border bg-surface hover:bg-surface-2", locked && "cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted"),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "flex items-center gap-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: cn("font-mono text-[12px] font-semibold", active ? "text-gold" : "text-muted-foreground"),
									children: s.code
								}), locked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, {
									className: "h-3 w-3 text-muted-foreground",
									"aria-hidden": true
								}) : done ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {
									className: "h-3 w-3 text-verified",
									"aria-hidden": true
								}) : null]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: cn("mt-0.5 truncate text-[12px] font-semibold", !vertical && "hidden sm:block", active ? "text-foreground" : "text-muted-foreground"),
								children: s.label
							}),
							locked && vertical ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mt-0.5 block truncate text-[11px] text-muted-foreground",
								children: lockedHelper(s.id)
							}) : null
						]
					})
				}, s.id);
			})
		})]
	});
}
var badgeVariants = cva("inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", {
	variants: { variant: {
		default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
		secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
		destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
		outline: "text-foreground"
	} },
	defaultVariants: { variant: "default" }
});
function Badge({ className, variant, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn(badgeVariants({ variant }), className),
		...props
	});
}
var MATCH_LABELS = {
	per_rename: "Per Rename",
	per_alias: "Per Rename",
	historical_alias: "ชื่อเดิม",
	canonical: "ชื่อในข้อมูลลูกค้า",
	line_display_name: "ชื่อ LINE",
	phone: "เบอร์โทร",
	email: "อีเมล",
	line_user_id: "LINE",
	telegram: "Telegram",
	member_id: "เลขสมาชิก"
};
/** Safe label for any backend match source, including unknown future values. */
function matchLabel(source) {
	if (!source) return null;
	return MATCH_LABELS[source] ?? "พบข้อมูลลูกค้า";
}
/** Backend-owned Per Rename match (canonical name + legacy alias name). */
function isPerRenameMatch(c) {
	return c.matched_on === "per_rename" || c.matched_on === "per_alias";
}
/** Primary display: the name Per remembers, as supplied by the backend. */
function primaryName(c) {
	return c.remembered_name || c.per_rename || c.current_line_rename || c.client_name || c.canonical_name || c.client_id;
}
function secondaryName(c) {
	const canonical = c.canonical_name || c.client_name;
	if (!canonical) return null;
	return canonical === primaryName(c) ? null : canonical;
}
/**
* Hard lock: a client is only usable for job creation when the backend returned
* a canonical Airtable Clients record id. Alias / remembered / LINE name
* matching is discovery evidence only.
*/
function hasCanonicalClientId(c) {
	return isCanonicalRecordId(c.client_id);
}
function isSelectable(c) {
	return hasCanonicalClientId(c) && !c.manual_public_only && c.identity_status !== "needs_review";
}
/** Bounded, operator-readable provenance. Never exposes raw LINE user ids. */
function clientProvenanceLine(c) {
	if (!hasCanonicalClientId(c)) return "ยังสร้างงานไม่ได้ · กรุณาตรวจข้อมูลลูกค้าก่อน";
	if (isPerRenameMatch(c) || c.per_rename_authoritative) return "ชื่อที่เปอร์บันทึกไว้ → ข้อมูลลูกค้า";
	return c.matched_on === "line_display_name" || c.matched_on === "line_user_id" || Boolean(c.line_user_id) || (c.lineage_source ?? "").includes("line") ? "LINE → ข้อมูลลูกค้า" : "ข้อมูลลูกค้าพร้อมใช้งาน";
}
function IdentityBit({ label, value }) {
	if (!value) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex items-baseline gap-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[12px] uppercase text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[13px] text-foreground/85",
			children: value
		})]
	});
}
function ClientResultCard({ client, selected, onSelect }) {
	const selectable = isSelectable(client);
	const secondary = secondaryName(client);
	const status = client.identity_status;
	const canonical = hasCanonicalClientId(client);
	const perRename = isPerRenameMatch(client);
	const label = matchLabel(client.matched_on);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		role: "option",
		"aria-selected": !!selected,
		tabIndex: 0,
		onClick: () => selectable && onSelect(client),
		onKeyDown: (e) => {
			if ((e.key === "Enter" || e.key === " ") && selectable) {
				e.preventDefault();
				onSelect(client);
			}
		},
		className: cn("step-transition group rounded-lg border bg-surface p-3.5 outline-none min-[1400px]:p-3", "focus-visible:ring-2 focus-visible:ring-ring", selectable ? "cursor-pointer hover:bg-surface-2" : "cursor-not-allowed opacity-80", selected ? "border-gold/70 bg-gold-muted" : "border-border"),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-start justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								className: "truncate text-[17px] font-semibold leading-tight text-foreground min-[1400px]:text-[16px]",
								children: primaryName(client)
							}),
							(status === "verified" || status === "canonical_client_linked") && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BadgeCheck, {
								className: "h-4 w-4 shrink-0 text-verified",
								"aria-label": "ยืนยันข้อมูลลูกค้าแล้ว"
							}),
							label && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
								variant: "outline",
								className: "border-gold/40 bg-gold-muted text-[12px] font-medium text-gold",
								children: label
							})
						]
					}),
					secondary && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-0.5 truncate text-[13px] text-muted-foreground",
						children: secondary
					}),
					perRename && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-[13px] text-gold/90",
						children: ["พบจากชื่อที่เปอร์บันทึกไว้", client.matched_value ? ` — “${client.matched_value}”` : ""]
					}),
					!perRename && label && client.matched_value && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-[13px] text-muted-foreground",
						children: [
							"พบจาก ",
							label.toLowerCase(),
							" — ",
							client.matched_value
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: cn("mt-2 truncate text-[13px] font-medium min-[1400px]:mt-1.5", canonical ? "text-muted-foreground" : "text-destructive"),
						children: clientProvenanceLine(client)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-2 flex flex-wrap gap-x-3 gap-y-0.5 min-[1400px]:mt-1.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IdentityBit, {
								label: "สมาชิก",
								value: client.member_id
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IdentityBit, {
								label: "ระดับ",
								value: client.tier
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IdentityBit, {
								label: "สถานะ",
								value: client.membership_status
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IdentityBit, {
								label: "แพ็กเกจ",
								value: client.package_code
							})
						]
					}),
					client.aliases?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1.5 line-clamp-1 text-[13px] text-muted-foreground",
						children: ["ชื่ออื่นที่เคยใช้: ", client.aliases.join(" · ")]
					}) : null,
					!canonical && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive",
						children: "ยังสร้างงานไม่ได้ · กรุณาตรวจและผูกข้อมูลลูกค้าก่อน"
					}),
					(status === "pending_reconcile" || client.manual_public_only || status === "needs_review") && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: cn("mt-2 flex items-start gap-1.5 rounded-md border px-3 py-2 text-[13px]", status === "needs_review" || client.manual_public_only ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warn/40 bg-warn/10 text-warn"),
						children: [status === "needs_review" || client.manual_public_only ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldQuestionMark, {
							className: "mt-px h-3.5 w-3.5 shrink-0",
							"aria-hidden": true
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
							className: "mt-px h-3.5 w-3.5 shrink-0",
							"aria-hidden": true
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: client.warnings?.join(" ") ?? (client.manual_public_only ? "พบข้อมูลบางส่วน · กรุณาผูกข้อมูลลูกค้าก่อน" : "กำลังตรวจสอบข้อมูลลูกค้า") })]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "shrink-0 text-right",
				children: [typeof client.confidence === "number" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "block font-mono text-[12px] text-muted-foreground",
					children: [confidencePercent(client.confidence), "%"]
				}), selectable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, {
					className: "mt-2 ml-auto h-4 w-4 text-muted-foreground group-hover:text-gold",
					"aria-hidden": true
				})]
			})]
		})
	});
}
/** Backend may send 0–1 or 0–100; never show above 100%. */
function confidencePercent(c) {
	const pct = c <= 1 ? c * 100 : c;
	return Math.round(Math.min(100, Math.max(0, pct)));
}
var Dialog = Dialog$1;
var DialogPortal = DialogPortal$1;
var DialogOverlay = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay$1, {
	ref,
	className: cn("fixed inset-0 z-50 bg-overlay/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className),
	...props
}));
DialogOverlay.displayName = DialogOverlay$1.displayName;
var DialogContent = import_react.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogPortal, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent$1, {
	ref,
	className: cn("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg", className),
	...props,
	children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogClose, {
		className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "sr-only",
			children: "Close"
		})]
	})]
})] }));
DialogContent.displayName = DialogContent$1.displayName;
var DialogHeader = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col space-y-1.5 text-center sm:text-left", className),
	...props
});
DialogHeader.displayName = "DialogHeader";
var DialogFooter = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className),
	...props
});
DialogFooter.displayName = "DialogFooter";
var DialogTitle = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle$1, {
	ref,
	className: cn("text-lg font-semibold leading-none tracking-tight", className),
	...props
}));
DialogTitle.displayName = DialogTitle$1.displayName;
var DialogDescription = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription$1, {
	ref,
	className: cn("text-sm text-muted-foreground", className),
	...props
}));
DialogDescription.displayName = DialogDescription$1.displayName;
function ProfileGallery({ name, primary, photos, label }) {
	const [open, setOpen] = (0, import_react.useState)(null);
	const safe = (url) => typeof url === "string" && /^https:\/\//i.test(url);
	const urls = [...new Set([primary, ...photos ?? []].filter(safe))].slice(0, 6);
	if (!urls.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
		className: "text-[13px] text-muted-foreground",
		children: ["ยังไม่มีรูปในข้อมูลของ ", name]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] font-medium text-muted-foreground",
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex flex-wrap gap-2",
				children: urls.map((url, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setOpen(url),
					"aria-label": `ขยายรูป${index === 0 ? "ปัจจุบัน" : `เก่า ${index}`}ของ ${name}`,
					className: "overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: url,
						alt: `รูป${index === 0 ? "ปัจจุบัน" : `เก่า ${index}`}ของ ${name}`,
						loading: "lazy",
						referrerPolicy: "no-referrer",
						className: "h-20 w-20 object-cover"
					})
				}, url))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: Boolean(open),
				onOpenChange: (next) => {
					if (!next) setOpen(null);
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-3xl",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogTitle, { children: ["รูปของ ", name] }), open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: open,
						alt: `รูปขยายของ ${name}`,
						referrerPolicy: "no-referrer",
						className: "max-h-[75vh] w-full object-contain"
					})]
				})
			})
		]
	});
}
var PLACEHOLDER = "พิมพ์ชื่อที่จำได้ / LINE / เบอร์โทร / อีเมล แล้วกด Enter";
function StepClient({ selected, onSelect, onClear, onContinue, searchHint, onSearchHintChange }) {
	const [localInput, setLocalInput] = (0, import_react.useState)("");
	const input = searchHint ?? localInput;
	const setInput = (value) => {
		setLocalInput(value);
		onSearchHintChange?.(value);
	};
	const [query, setQuery] = (0, import_react.useState)("");
	const [hasSearched, setHasSearched] = (0, import_react.useState)(false);
	const inputRef = (0, import_react.useRef)(null);
	function submitSearch() {
		const nextQuery = input.trim();
		if (!nextQuery) return;
		setHasSearched(true);
		setQuery(nextQuery);
	}
	const recent = useQuery({
		queryKey: ["recent-clients"],
		queryFn: ({ signal }) => api.recentClients(signal)
	});
	const search = useQuery({
		queryKey: ["lineage-lookup", query],
		queryFn: ({ signal }) => api.lineageLookup(query, signal),
		enabled: query.length >= 1,
		retry: false
	});
	const photos = useQuery({
		queryKey: ["client-profile-photos", selected?.client_id],
		queryFn: ({ signal }) => api.clientPhotos(selected.client_id, signal),
		enabled: Boolean(selected?.client_id),
		retry: false,
		staleTime: 6e4
	});
	const showRecent = !hasSearched;
	const results = search.data?.results ?? [];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "step-client-heading",
		className: "space-y-3 min-[1400px]:grid min-[1400px]:grid-cols-[minmax(250px,0.62fr)_minmax(0,1.38fr)] min-[1400px]:items-start min-[1400px]:gap-x-4 min-[1400px]:gap-y-3 min-[1400px]:space-y-0",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				id: "step-client-heading",
				className: "text-[13px] font-semibold tracking-[0.18em] text-gold",
				children: "01 · เลือกลูกค้า"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[14px] text-muted-foreground",
				children: "ค้นหาจากชื่อที่เปอร์เรียก หรือข้อมูลที่จำได้"
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative min-[1400px]:col-start-1",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
						className: "pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
						"aria-hidden": true
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						ref: inputRef,
						value: input,
						onChange: (e) => setInput(e.target.value),
						onKeyDown: (e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								submitSearch();
							}
							if (e.key === "Escape") {
								setInput("");
								setQuery("");
								setHasSearched(false);
							}
						},
						"aria-label": "ค้นหาลูกค้า",
						placeholder: PLACEHOLDER,
						className: "h-14 rounded-xl border-border bg-surface pl-11 pr-10 text-[15px] placeholder:truncate placeholder:text-muted-foreground/70 focus-visible:ring-ring min-[1400px]:h-11 min-[1400px]:rounded-lg"
					}),
					input && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-label": "ล้างคำค้นหา",
						onClick: () => {
							setInput("");
							setQuery("");
							setHasSearched(false);
							inputRef.current?.focus();
						},
						className: "absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					}),
					search.isFetching && !showRecent ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "absolute right-10 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-[12px] text-muted-foreground",
						role: "status",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
							className: "h-3.5 w-3.5 animate-spin",
							"aria-hidden": true
						}), " กำลังค้นหา"]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] leading-relaxed text-muted-foreground min-[1400px]:col-start-1",
				children: "ค้นจากชื่อ / LINE / เบอร์โทร / อีเมล ได้เลย"
			}),
			selected && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-lg border border-verified/40 bg-verified/10 p-3 min-[1400px]:col-start-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "min-w-0 text-[13px] font-medium text-verified",
						children: "เลือกลูกค้าแล้ว · กรอกข้อมูลขั้นต่อไปได้"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: onClear,
						className: "min-h-11 text-[13px] text-muted-foreground hover:text-foreground",
						children: "เปลี่ยนลูกค้า"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClientResultCard, {
							client: selected,
							selected: true,
							onSelect: () => {}
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProfileGallery, {
								name: selected.client_name || selected.remembered_name || "ลูกค้า",
								label: "รูป LINE และรูปก่อนหน้า",
								primary: photos.data?.[0] ?? selected.profile_image_url,
								photos: photos.data?.length ? photos.data : selected.profile_photos
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							className: "mt-3 h-11",
							onClick: onContinue,
							children: "ถัดไป · ข้อมูลลูกค้า"
						})
					]
				})]
			}),
			search.data?.degraded_sources?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn min-[1400px]:col-start-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "mt-px h-3.5 w-3.5 shrink-0",
					"aria-hidden": true
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: degradedText(search.data.degraded_sources) })]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				role: "listbox",
				"aria-label": "ผลการค้นหาลูกค้า",
				className: "space-y-2.5 min-[1400px]:col-start-2 min-[1400px]:row-span-4 min-[1400px]:row-start-1 min-[1400px]:grid min-[1400px]:grid-cols-2 min-[1400px]:content-start min-[1400px]:gap-2 min-[1400px]:space-y-0",
				children: [
					showRecent && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] font-semibold uppercase text-muted-foreground min-[1400px]:col-span-2",
							children: "ลูกค้าล่าสุด"
						}),
						recent.isLoading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-24 w-full rounded-lg bg-surface-2 min-[1400px]:col-span-2" }),
						!recent.isLoading && !recent.isError && (recent.data?.results.length ?? 0) === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-lg border border-dashed border-border bg-surface-2 p-4 min-[1400px]:col-span-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[14px] font-medium text-foreground",
								children: "เริ่มจากค้นหาลูกค้า หรือเลือกจากลูกค้าล่าสุดเมื่อระบบโหลดได้"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[13px] text-muted-foreground",
								children: "พิมพ์ข้อมูลที่จำได้ด้านซ้าย แล้วกด Enter"
							})]
						}) : null,
						recent.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-lg border border-border bg-surface-2 p-4 min-[1400px]:col-span-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[14px] font-medium text-foreground",
								children: "เริ่มจากค้นหาลูกค้า"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[13px] text-muted-foreground",
								children: "ลูกค้าล่าสุดยังโหลดไม่ได้ แต่ยังค้นหาจากข้อมูลที่จำได้"
							})]
						}) : null,
						recent.data?.results.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClientResultCard, {
							client: c,
							selected: selected?.client_id === c.client_id,
							onSelect
						}, c.client_id))
					] }),
					!showRecent && search.isFetching && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "contents",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-28 w-full rounded-lg bg-surface-2" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-28 w-full rounded-lg bg-surface-2" })]
					}),
					!showRecent && search.isError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-[13px] text-destructive min-[1400px]:col-span-2",
						children: ["ค้นหาไม่สำเร็จในตอนนี้ กรุณาลองอีกครั้ง", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-2",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								size: "sm",
								variant: "outline",
								onClick: () => search.refetch(),
								children: "ลองค้นหาอีกครั้ง"
							})
						})]
					}),
					!showRecent && !search.isFetching && !search.isError && results.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-lg border border-border bg-surface p-4 min-[1400px]:col-span-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[14px] font-semibold text-foreground",
								children: "ยังไม่พบลูกค้าที่เลือกได้"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[13px] text-muted-foreground",
								children: "ลองค้นด้วยชื่อที่เปอร์เรียก / LINE / เบอร์โทร / อีเมล หรือเปิดหน้าค้นหาลูกค้า"
							}),
							search.data?.degraded_sources?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[13px] text-warn",
								children: "บางแหล่งข้อมูลไม่ตอบ · อาจยังมีลูกค้าอยู่"
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								asChild: true,
								size: "sm",
								variant: "outline",
								className: "mt-3 min-h-11",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/internal/admin/customer-data",
									search: { q: query },
									children: "เปิดหน้าค้นหาลูกค้า"
								})
							})
						]
					}),
					!showRecent && !search.isFetching && results.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClientResultCard, {
						client: c,
						selected: selected?.client_id === c.client_id,
						onSelect
					}, c.client_id)),
					!showRecent && results.length > 0 && search.data?.no_canonical_match && !results.some(isSelectable) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn min-[1400px]:col-span-2",
						children: "ยังไม่พบข้อมูลลูกค้าที่พร้อมใช้สร้างงาน กรุณาตรวจข้อมูลลูกค้าก่อน"
					})
				]
			})
		]
	});
}
/** Thai, operator-readable wording for known backend signals; unknown stays generic. */
function degradedText(sources) {
	const known = { per_rename_multiple_canonical_clients: "ชื่อนี้ผูกกับลูกค้ามากกว่า 1 คน — เลือกคนที่ใช่จากรายการ" };
	const lines = sources.map((s) => known[s]).filter(Boolean);
	if (sources.filter((s) => !known[s]).length) lines.push("บางแหล่งข้อมูลตัวตนใช้ไม่ได้ชั่วคราว — ผลอาจไม่ครบ");
	return lines.join(" · ");
}
function BookingPlaceFields({ value, onChange, prefix }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
					htmlFor: prefix + "-location",
					children: "ชื่อสถานที่"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					id: prefix + "-location",
					value: value.location,
					onChange: (e) => onChange({ location: e.target.value }),
					placeholder: "ชื่อโรงแรม สถานที่ หรือย่านที่นัด",
					className: "h-11 border-border bg-surface"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
						htmlFor: prefix + "-map",
						children: "Google Maps"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						id: prefix + "-map",
						type: "url",
						value: value.google_map_url ?? "",
						onChange: (e) => onChange({ google_map_url: e.target.value }),
						placeholder: "https://maps.app.goo.gl/...",
						"aria-invalid": !isValidMapUrl(value.google_map_url),
						className: "h-11 border-border bg-surface"
					}),
					!isValidMapUrl(value.google_map_url) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "text-[13px] text-destructive",
						children: "ลิงก์ต้องขึ้นต้นด้วย https://"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "จุดนัดพบ" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: value.meeting_choice ?? "",
						onValueChange: (v) => onChange({ meeting_choice: v }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "h-11 border-border bg-surface",
							"aria-label": "จุดนัดพบ",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "เลือกจุดนัดพบ" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "lobby",
							children: "รอที่ล็อบบี้"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "meet_client",
							children: "ไปพบลูกค้า"
						})] })]
					}),
					value.meeting_choice === "meet_client" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						"aria-label": "จุดที่ไปพบลูกค้า",
						value: value.meeting_details ?? "",
						onChange: (e) => onChange({ meeting_details: e.target.value }),
						placeholder: "ระบุจุดที่จะไปพบลูกค้า",
						className: "h-11 border-border bg-surface"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
					htmlFor: prefix + "-room",
					children: "เลขห้องพัก / บ้านเลขที่"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					id: prefix + "-room",
					value: value.room_number ?? "",
					onChange: (e) => onChange({ room_number: e.target.value }),
					placeholder: "เลขที่ห้องพัก หรือบ้านเลขที่",
					className: "h-11 border-border bg-surface"
				})]
			})
		]
	});
}
function StepPlace({ value, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "step-place-heading",
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				id: "step-place-heading",
				className: "text-[13px] font-semibold tracking-[0.18em] text-gold",
				children: "03 · สถานที่และบรีฟ MMD"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BookingPlaceFields, {
				prefix: "client",
				value,
				onChange
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
						htmlFor: "mmd-brief",
						children: "บรีฟภายใน — สำหรับทีม MMD"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-muted-foreground",
						children: "ข้อความสำหรับทีม MMD เท่านั้น"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
						id: "mmd-brief",
						value: value.operator_note,
						onChange: (e) => onChange({ operator_note: e.target.value }),
						rows: 3,
						className: "border-border bg-surface"
					})
				]
			})
		]
	});
}
var Checkbox = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Checkbox$1, {
	ref,
	className: cn("grid place-content-center peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground", className),
	...props,
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckboxIndicator, {
		className: cn("grid place-content-center text-current"),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-4 w-4" })
	})
}));
Checkbox.displayName = Checkbox$1.displayName;
function StepWork({ value, onSelect, details, onDetailsChange, privateAccess, onPrivateChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "step-work-heading",
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				id: "step-work-heading",
				className: "text-[13px] font-semibold tracking-[0.18em] text-gold",
				children: "02 · ข้อมูลลูกค้าและรูปแบบงาน"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[14px] text-muted-foreground",
				children: "กรอกรายละเอียดที่ลูกค้าแจ้ง แล้วเลือกน้องๆและนายแบบ"
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid gap-2 sm:grid-cols-2",
				children: WORK_TYPE_OPTIONS.map((w) => {
					const active = value?.code === w.code;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						disabled: !w.selectable,
						"aria-pressed": active,
						onClick: () => onSelect(w),
						className: cn("step-transition min-h-24 rounded-lg border p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-gold/70 bg-gold-muted" : "border-border bg-surface hover:bg-surface-2", !w.selectable && "cursor-not-allowed opacity-45 hover:bg-surface"),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[16px] font-semibold text-foreground",
									children: w.label
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[12px] text-muted-foreground",
									children: w.code
								})]
							}),
							w.description && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[13px] text-muted-foreground",
								children: w.description
							}),
							!w.selectable && w.disabled_reason && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-2 flex items-center gap-1.5 text-[13px] text-warn",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, {
										className: "h-3 w-3",
										"aria-hidden": true
									}),
									" ",
									w.disabled_reason
								]
							})
						]
					}, w.code);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
							htmlFor: "client-date",
							children: "วันที่"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							id: "client-date",
							type: "date",
							value: details.date,
							onChange: (e) => onDetailsChange({ date: e.target.value }),
							className: "h-11 border-border bg-surface"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
							htmlFor: "client-time",
							children: "เวลาเริ่ม"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							id: "client-time",
							type: "time",
							value: details.time,
							onChange: (e) => onDetailsChange({ time: e.target.value }),
							className: "h-11 border-border bg-surface"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "ระยะเวลา" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							value: details.duration_minutes ? String(details.duration_minutes) : "",
							onValueChange: (v) => onDetailsChange({ duration_minutes: Number(v) }),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
								className: "h-11 border-border bg-surface",
								"aria-label": "ระยะเวลา",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "เลือกระยะเวลา" })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: DURATION_OPTIONS.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: String(d.minutes),
								children: d.label
							}, d.minutes)) })]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[13px] text-muted-foreground",
				children: ["เวลาสิ้นสุด · ", computeEndTime(details.time, details.duration_minutes) || "รอเวลาเริ่มและระยะเวลา"]
			}),
			value && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-4 border-t border-border pt-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
							htmlFor: "client-amount",
							children: "ราคาบริการที่ตกลงกับลูกค้า (บาท)"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							id: "client-amount",
							type: "number",
							min: 1,
							step: 100,
							value: details.amount_thb ?? "",
							onChange: (e) => onDetailsChange({ amount_thb: e.target.value === "" ? null : Number(e.target.value) }),
							placeholder: "กรอกราคาบริการ",
							className: "h-11 border-border bg-surface"
						})]
					}),
					value.lane === "private" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", {
						className: "space-y-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", {
								className: "text-[14px] font-semibold text-gold",
								children: "Option ที่ลูกค้าเลือก"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid grid-cols-2 gap-2 sm:grid-cols-4",
								children: PRIVATE_SERVICE_OPTIONS.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Label, {
									className: "flex min-h-11 items-center gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Checkbox, {
										checked: privateAccess.service_options?.includes(option) ?? false,
										onCheckedChange: (checked) => onPrivateChange({ service_options: checked === true ? [...privateAccess.service_options ?? [], option] : (privateAccess.service_options ?? []).filter((selected) => selected !== option) })
									}), option.toUpperCase()]
								}, option))
							}),
							PRIVATE_SERVICE_OPTIONS.filter((option) => privateAccess.service_options?.includes(option)).map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "space-y-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Label, {
									htmlFor: `client-option-${option}`,
									children: [option.toUpperCase(), " · เรทลูกค้า (บาท)"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									id: `client-option-${option}`,
									type: "number",
									min: 0,
									step: "0.01",
									value: privateAccess.service_rates?.[option]?.client_amount_thb ?? "",
									onChange: (e) => onPrivateChange({ service_rates: {
										...privateAccess.service_rates,
										[option]: {
											client_amount_thb: e.target.value === "" ? null : Number(e.target.value),
											model_payout_thb: privateAccess.service_rates?.[option]?.model_payout_thb ?? null
										}
									} }),
									className: "h-11 border-border bg-surface"
								})]
							}, option))
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
							htmlFor: "client-travel",
							children: "Transportation · ค่าเดินทางที่ลูกค้าจ่าย (บาท)"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							id: "client-travel",
							type: "number",
							min: 0,
							step: 1,
							value: details.travel_fee_thb ?? "",
							onChange: (e) => onDetailsChange({ travel_fee_thb: e.target.value === "" ? null : Number(e.target.value) }),
							placeholder: "ไม่คิดค่าเดินทางให้เว้นว่าง",
							className: "h-11 border-border bg-surface"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-[14px] font-semibold text-gold",
						children: ["ยอดลูกค้ารวมค่าเดินทาง · ", (() => {
							const total = servicePricing(details.amount_thb, value.lane === "private" ? privateAccess : void 0).clientTotal;
							return total === null ? "รอกรอกเรทลูกค้าครบ" : `฿${(total + (details.travel_fee_thb ?? 0)).toLocaleString()}`;
						})()]
					})
				]
			})
		]
	});
}
/**
* Owner-safe copy for Drive-first discovery. The backend intentionally exposes
* only allowlisted operational codes here; OAuth tokens and Google responses
* never reach the browser.
*/
function driveSearchErrorMessage(error) {
	const code = error instanceof ApiHttpError && typeof error.body?.["error"] === "string" ? error.body["error"] : "";
	if (code === "drive_model_authorization_required") return "การเชื่อม Google Drive ของ malemodel.bkk@gmail.com ต้องอนุมัติใหม่ ให้เจ้าของเชื่อมต่อใหม่แล้วค้นหาอีกครั้ง ระบบยังไม่ใช้ Airtable หรือรายชื่ออื่นแทน";
	if (code === "drive_model_configuration_required") return "การเชื่อม Google Drive ของหลังบ้านต้องตรวจ OAuth client หรือสิทธิ์ Drive ก่อนค้นหาอีกครั้ง ระบบยังไม่ใช้ Airtable หรือรายชื่ออื่นแทน";
	return "ค้นหารายชื่อจาก Google Drive ไม่พร้อมชั่วคราว ข้อมูลในฟอร์มยังอยู่ครบ กรุณาลองใหม่ หรือให้ผู้ดูแลตรวจการเชื่อมต่อ Drive";
}
var num = (v) => v === "" ? null : Number(v);
function PaymentPartner({ value = EMPTY_PARTNER, onChange, part = "all" }) {
	const showChoice = part !== "details";
	const showDetails = part !== "choice";
	if (part === "details" && value.channel !== "partner") return null;
	const set = (patch) => onChange({
		...value,
		...patch
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": `payment-partner-heading-${part}`,
		className: "space-y-2.5 rounded-md border border-border bg-surface p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				id: `payment-partner-heading-${part}`,
				className: "text-[13px] font-semibold text-gold",
				children: part === "details" ? "รูปแบบการตกลงกับพาร์ตเนอร์" : "น้องๆและนายแบบรับงานผ่านใคร"
			}),
			showChoice && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				role: "radiogroup",
				"aria-label": "ช่องทางรับงานของน้องๆและนายแบบ",
				className: "flex flex-wrap gap-1.5",
				children: ["direct", "partner"].map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					role: "radio",
					"aria-checked": value.source_choice === c,
					variant: value.source_choice === c ? "secondary" : "outline",
					className: "h-11 px-4 text-[13px]",
					onClick: () => onChange(c === "direct" ? DIRECT_CHOICE : {
						...value,
						channel: "partner",
						source_choice: "partner"
					}),
					children: c === "direct" ? "รับงานตรง" : "ผ่านพาร์ตเนอร์"
				}, c))
			}),
			showChoice && value.channel === "partner" && value.auto_from_model && value.name && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "rounded-md border border-gold/30 bg-gold-muted px-3 py-2 text-[13px] text-gold",
				children: [
					"น้องคนนี้อยู่กับ ",
					value.name,
					" · งานจะไปแสดงในหน้าพาร์ตเนอร์"
				]
			}),
			showChoice && value.channel === "partner" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PartnerPicker, {
				value,
				onChange
			}),
			showDetails && value.channel === "partner" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						role: "radiogroup",
						"aria-label": "รูปแบบพาร์ตเนอร์",
						className: "flex flex-wrap gap-1.5",
						children: Object.keys(PARTNER_TYPE_LABEL).map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							role: "radio",
							"aria-checked": value.type === t,
							variant: value.type === t ? "secondary" : "outline",
							className: "h-11 px-3 text-[13px]",
							onClick: () => set({ type: t }),
							children: PARTNER_TYPE_LABEL[t]
						}, t))
					}),
					value.type === "co_partner" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-1.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								htmlFor: "partner-rate",
								className: "text-[13px] text-muted-foreground",
								children: "เรทรวมที่ตกลงกับพาร์ตเนอร์ (บาท)"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "partner-rate",
								type: "number",
								inputMode: "numeric",
								min: 1,
								step: 100,
								value: value.combined_rate_thb ?? "",
								onChange: (e) => set({ combined_rate_thb: num(e.target.value) }),
								className: "h-11 border-border bg-surface"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[12px] text-muted-foreground",
								children: "พาร์ตเนอร์เป็นผู้จ่ายน้องๆและนายแบบเอง"
							})
						]
					}),
					value.type === "bridge" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-1.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								className: "text-[13px] text-muted-foreground",
								children: "ระดับผู้ติดตาม (ถ้ามี)"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex flex-wrap gap-1.5",
								children: BRIDGE_TIERS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									type: "button",
									variant: value.follower_tier === t.id ? "secondary" : "outline",
									className: "h-11 px-3 text-[13px]",
									onClick: () => set({ follower_tier: t.id }),
									children: [
										t.label,
										" · ",
										t.percent,
										"%"
									]
								}, t.id))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								"aria-label": "เปอร์เซ็นต์ที่ตกลงแล้ว",
								type: "number",
								min: 0,
								max: 100,
								step: .5,
								placeholder: "เปอร์เซ็นต์ที่ตกลงแล้ว (ถ้ามี)",
								value: value.confirmed_percent ?? "",
								onChange: (e) => set({ confirmed_percent: num(e.target.value) }),
								className: "h-11 border-border bg-surface"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[12px] text-muted-foreground",
								children: "ยอดคอมมิชชันจะสรุปในหน้าพาร์ตเนอร์"
							})
						]
					}),
					value.type === "profit_share" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-2 sm:grid-cols-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								"aria-label": "ส่วนแบ่งพาร์ตเนอร์ (%)",
								type: "number",
								min: 1,
								max: 100,
								step: .5,
								placeholder: "ส่วนแบ่งพาร์ตเนอร์ (%)",
								value: value.share_percent ?? "",
								onChange: (e) => set({ share_percent: num(e.target.value) }),
								className: "h-11 border-border bg-surface"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								"aria-label": "รายรับ (บาท)",
								type: "number",
								min: 0,
								placeholder: "รายรับ (ถ้ามี)",
								value: value.revenue_thb ?? "",
								onChange: (e) => set({ revenue_thb: num(e.target.value) }),
								className: "h-11 border-border bg-surface"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								"aria-label": "ค่าใช้จ่ายที่ตกลง (บาท)",
								type: "number",
								min: 0,
								placeholder: "ค่าใช้จ่ายที่ตกลง (ถ้ามี)",
								value: value.agreed_costs_thb ?? "",
								onChange: (e) => set({ agreed_costs_thb: num(e.target.value) }),
								className: "h-11 border-border bg-surface"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[12px] text-muted-foreground sm:col-span-3",
								children: "ชำระหลังจบงาน · ข้อมูลประกอบเท่านั้น"
							})
						]
					})
				]
			})
		]
	});
}
/**
* Step 03 — Drive-first discovery. Search shows the MMD Drive catalogue only;
* Airtable is touched only when Per picks a row (drive-select), and only the
* canonical item returned by the backend becomes the selected model.
*/
function StepModel({ clientId, memberId, workTypeCode, bookingVisibility, customerLane, selectedAccessFolder, privateWork, scopeIncomplete, value, onSelect, partner = EMPTY_PARTNER, onPartnerChange, onContinue, onVerificationChange, searchHint, onSearchHintChange }) {
	const [localInput, setLocalInput] = (0, import_react.useState)("");
	const input = searchHint ?? localInput;
	const setInput = (value) => {
		setLocalInput(value);
		onSearchHintChange?.(value);
	};
	const [query, setQuery] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		const t = setTimeout(() => setQuery(input.trim()), 300);
		return () => clearTimeout(t);
	}, [input]);
	const q = useQuery({
		queryKey: ["drive-models", query],
		queryFn: ({ signal }) => api.driveModels(query, signal),
		enabled: query.length > 0,
		retry: false
	});
	const settling = input.trim() !== query;
	const canonicalId = value && /^rec[A-Za-z0-9]{6,}$/.test(value.model_id) ? value.model_id : null;
	const attrName = value?.model_name || value?.display_name || "";
	const attribution = useQuery({
		queryKey: [
			"model-attribution",
			canonicalId,
			clientId,
			memberId ?? null,
			workTypeCode,
			bookingVisibility ?? null,
			customerLane ?? null,
			selectedAccessFolder ?? null,
			privateWork ?? null,
			attrName
		],
		queryFn: ({ signal }) => api.models({
			clientId,
			memberId: memberId ?? null,
			workType: workTypeCode,
			bookingVisibility: bookingVisibility ?? null,
			customerLane: customerLane ?? null,
			selectedAccessFolder: selectedAccessFolder ?? null,
			privateWork: privateWork ?? null,
			q: attrName
		}, signal),
		enabled: Boolean(canonicalId && attrName && !scopeIncomplete),
		retry: false,
		staleTime: 0
	});
	(0, import_react.useEffect)(() => {
		if (!value || !canonicalId) return;
		if (!attribution.isSuccess && !attribution.isError) return;
		const merged = mergeAttribution(value, attribution.isSuccess ? attribution.data : null);
		if (!sameAttribution(merged, value)) onSelect(merged);
	}, [
		canonicalId,
		attribution.data,
		attribution.isError,
		privateWork,
		customerLane,
		selectedAccessFolder
	]);
	const privateRequested = bookingVisibility === "private" || scopeIncomplete === true;
	const verificationReady = !privateRequested || Boolean(!scopeIncomplete && attribution.isSuccess && !attribution.isFetching && attribution.data?.some((m) => m.model_id === canonicalId && modelSelectable(m) && privateModelReady(m, privateWork ?? null)));
	(0, import_react.useEffect)(() => {
		onVerificationChange?.(verificationReady);
	}, [verificationReady, onVerificationChange]);
	const partners = useActivePartners();
	const active = partners.data?.available ? partners.data.items : null;
	const link = value ? modelPartnerLink(value, active) : null;
	(0, import_react.useEffect)(() => {
		if (!value || !link || !onPartnerChange) return;
		const next = preselectFromModel(partner, link);
		if (next !== partner) onPartnerChange(next);
	}, [
		value?.model_id,
		active,
		partner.source_choice
	]);
	const select = useMutation({
		mutationFn: (driveFolderId) => api.driveSelect(driveFolderId),
		onSuccess: (m) => onSelect(m)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "step-model-heading",
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				id: "step-model-heading",
				className: "text-[13px] font-semibold tracking-[0.18em] text-gold",
				children: "04 · เลือกน้องๆและนายแบบ"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[14px] text-muted-foreground",
				children: "พิมพ์ชื่อน้องๆและนายแบบที่ต้องการ แล้วเลือกจากรายการ"
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaymentPartner, {
				part: "choice",
				value: partner,
				onChange: (next) => onPartnerChange?.(next)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
					className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
					"aria-hidden": true
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					value: input,
					onChange: (e) => setInput(e.target.value),
					"aria-label": "ค้นหาน้องๆและนายแบบในไดรฟ์",
					placeholder: "ชื่อน้องๆและนายแบบที่ต้องการ",
					className: "h-11 rounded-lg border-border bg-surface pl-10"
				})]
			}),
			!query && !value && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "พิมพ์ชื่อน้องๆและนายแบบเพื่อค้นหา"
			}),
			settling && input.trim() && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "กำลังค้นหา…"
			}),
			q.isLoading && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-2 sm:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-16 rounded-lg bg-surface-2" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-16 rounded-lg bg-surface-2" })]
			}),
			q.isError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive",
				children: driveSearchErrorMessage(q.error)
			}),
			q.data?.length === 0 && !q.isFetching && !settling && query && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "rounded-md border border-border bg-surface px-3 py-3 text-[13px] text-muted-foreground",
				children: "ไม่พบน้องๆและนายแบบชื่อนี้ ลองสะกดชื่ออื่น"
			}),
			select.isError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				role: "alert",
				className: "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive",
				children: ["เลือกน้องคนนี้ไม่ได้ในตอนนี้ กรุณาตรวจข้อมูลน้องๆและนายแบบแล้วลองใหม่ · ", select.error instanceof Error ? select.error.message.slice(0, 160) : ""]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid grid-cols-1 gap-2 sm:grid-cols-2",
				children: q.data?.map((m) => {
					const id = m.drive_folder_id;
					const active = value?.drive_folder_id === id;
					const pending = select.isPending && select.variables === id;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						disabled: select.isPending,
						"aria-pressed": active,
						onClick: () => select.mutate(id),
						className: cn("flex min-h-16 items-start gap-3 rounded-lg border bg-surface p-3 text-left transition-colors hover:bg-surface-2", active ? "border-gold" : "border-border"),
						children: [pending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
							className: "mt-0.5 h-4 w-4 shrink-0 animate-spin",
							"aria-hidden": true
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, {
							className: "mt-0.5 h-4 w-4 shrink-0 text-gold",
							"aria-hidden": true
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "min-w-0",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "block text-[15px] font-semibold",
									children: m.folder_name || m.model_name || m.display_name
								}),
								m.folder_path && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "block truncate text-[12px] text-muted-foreground",
									children: m.folder_path
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
									variant: "outline",
									className: "mt-1 text-[11px]",
									children: "จากรายการน้องๆและนายแบบ"
								})
							]
						})]
					}, id);
				})
			}),
			value && attribution.isFetching && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "กำลังตรวจว่าน้องคนนี้รับงานตรงหรือผ่านพาร์ตเนอร์…"
			}),
			value && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProfileGallery, {
						name: value.display_name,
						label: "รูปโปรไฟล์และรูปก่อนหน้า",
						primary: value.profile_image_url,
						photos: value.profile_photos
					}),
					privateRequested && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						role: "status",
						className: "space-y-2 rounded-md border border-border p-3 text-[13px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: attribution.isFetching ? "กำลังตรวจ PN/VIP กับระบบหลังบ้าน…" : verificationReady ? `ยืนยันจากระบบ: รับงาน ${privateWork?.toUpperCase()}` : scopeIncomplete ? "กรุณาเลือกเงื่อนไขงานส่วนตัวและ PN/VIP ให้ครบก่อน" : attribution.isError ? "ตรวจ PN/VIP ไม่ได้ชั่วคราว กรุณาตรวจใหม่ก่อนกรอกเรท" : "ยังเลือกผู้รับงานคนนี้ต่อไม่ได้: ระบบยังยืนยันไม่ได้ว่ารับ PN/VIP ที่เลือก กรุณาตรวจข้อมูลผู้รับงาน หรือเลือกคนอื่น" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							disabled: scopeIncomplete || attribution.isFetching,
							onClick: () => void attribution.refetch(),
							children: "ตรวจข้อมูลผู้รับงานอีกครั้ง"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SourceChoice, {
						verificationReady,
						model: value,
						link,
						activeLoaded: active !== null,
						partner,
						onChange: onPartnerChange,
						onContinue: verificationReady ? onContinue : void 0
					})
				]
			})
		]
	});
}
function SourceChoice({ verificationReady, model, link, activeLoaded, partner, onChange, onContinue }) {
	const conflict = partnerConflict(link, partner, activeLoaded);
	const ready = verificationReady && modelSelectable(model) && sourceChoiceReady(partner) && partnerMissing(partner).length === 0 && !conflict;
	const badge = linkBadge(link);
	const adopt = conflict ? adoptModelPartner(partner, link) : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3 rounded-lg border border-gold/60 bg-surface p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[14px]",
					children: ["เลือกแล้ว: ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-semibold",
						children: model.display_name
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
					variant: "outline",
					className: cn("text-[12px]", badge.warn ? "border-warn/50 text-warn" : "border-gold/50 text-gold"),
					children: badge.label
				})]
			}),
			link.state === "unknown" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-warn",
				children: "ระบบยังไม่ระบุว่าน้องคนนี้รับงานตรงหรือผ่านพาร์ตเนอร์ · กรุณาเลือกเองด้านบนหลังยืนยันแล้ว"
			}),
			link.state === "partner" && !link.record_id && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-warn",
				children: "ระบบระบุว่าเป็นงานผ่านพาร์ตเนอร์ แต่ยังไม่มีพาร์ตเนอร์ที่เชื่อมไว้ · กรุณาเลือกพาร์ตเนอร์ด้านบนหลังยืนยันแล้ว"
			}),
			conflict && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				role: "alert",
				className: "space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: conflict }), adopt && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					type: "button",
					variant: "outline",
					className: "h-11",
					onClick: () => onChange?.(adopt),
					children: ["ใช้พาร์ตเนอร์ตามระบบ · ", link.state === "partner" ? link.active?.partner_name : ""]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaymentPartner, {
				part: "details",
				value: partner,
				onChange: (next) => onChange?.(next)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "button",
				className: "h-11",
				disabled: !ready,
				onClick: () => onContinue?.(),
				children: "ถัดไป"
			})
		]
	});
}
/**
* Read-only presentation of the canonical Pre-job Reconfirm policy.
*
* The frontend is NOT a scheduler: it never computes, stores or submits
* reconfirm timestamps. Backend derives them from the canonical service
* date/time after the session is created.
*/
var POLICY = [
	{
		at: "D-1 16:00",
		text: "แจ้งน้องๆและนายแบบให้กด “รับทราบงานแล้ว”"
	},
	{
		at: "D-1 18:00",
		text: "เตือนน้องๆและนายแบบอีกครั้ง หากยังไม่กดรับทราบ"
	},
	{
		at: "D-1 19:00",
		text: "แจ้งทีม MMD ให้ติดตาม หากน้องๆและนายแบบยังไม่ตอบ"
	}
];
function ReconfirmPolicyCard({ compact = false }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "reconfirm-policy-heading",
		className: "rounded-lg border border-border bg-surface-2 p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, {
					className: "h-3.5 w-3.5 text-gold",
					"aria-hidden": true
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					id: "reconfirm-policy-heading",
					className: "text-[11px] font-semibold uppercase tracking-[0.16em] text-gold",
					children: "ติดตามน้องๆและนายแบบก่อนวันงาน"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-2 space-y-1",
				children: POLICY.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex gap-2 text-[11px] text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "w-[68px] shrink-0 font-mono text-foreground/80",
						children: p.at
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: p.text })]
				}, p.at))
			}),
			!compact && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-[11px] text-muted-foreground",
				children: "ระบบกำหนดเวลาให้ตามวันงาน (เวลาไทย) ไม่ต้องตั้งเอง การกด “รับทราบ” ยังไม่ใช่การเริ่มงาน"
			})
		]
	});
}
function statusLabel(value) {
	return {
		pending: "รอน้องๆและนายแบบรับทราบ",
		acknowledged: "น้องๆและนายแบบรับทราบแล้ว",
		overdue: "เลยเวลารับทราบ",
		scheduled: "กำหนดเวลาแล้ว"
	}[value ?? ""] ?? "กำลังติดตาม";
}
function fmt(v) {
	return v && v.trim() ? v : "—";
}
/** Authoritative backend-owned reconfirm schedule, shown after create succeeds. */
function ReconfirmResult({ reconfirm }) {
	if (!reconfirm) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mt-2 rounded-md border border-border bg-surface-2 px-2.5 py-2 text-[11px] text-muted-foreground",
		children: "สร้างงานแล้ว · ยังไม่มีเวลาติดตามน้องๆและนายแบบ กรุณาเปิดงานเพื่อตรวจสอบ"
	});
	const risk = (reconfirm.risk_level ?? "").toLowerCase();
	const alert = reconfirm.status === "overdue" || risk === "elevated" || risk === "high";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("mt-2 rounded-md border px-2.5 py-2 text-[11px]", alert ? "border-warn/40 bg-warn/10 text-warn" : "border-border bg-surface-2 text-muted-foreground"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "flex items-center gap-1.5 text-[10px] uppercase tracking-wider",
				children: [
					alert && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldAlert, {
						className: "h-3 w-3 shrink-0",
						"aria-hidden": true
					}),
					"ติดตามน้องๆและนายแบบ · ",
					statusLabel(reconfirm.status)
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "mt-1 space-y-0.5 font-mono text-[10px]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["ขอให้รับทราบภายใน ", fmt(reconfirm.required_at)] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["เตือนอีกครั้ง ", fmt(reconfirm.reminder_at)] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["แจ้งทีมติดตาม ", fmt(reconfirm.overdue_at)] }),
					reconfirm.acknowledged_at && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["รับทราบแล้ว ", reconfirm.acknowledged_at] })
				]
			}),
			(reconfirm.followup_status || reconfirm.risk_level || reconfirm.backup_required) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1",
				children: [
					reconfirm.followup_status ? "มีรายการติดตามเพิ่มเติม" : null,
					reconfirm.risk_level && reconfirm.risk_level !== "normal" ? "ต้องติดตามใกล้ชิด" : null,
					reconfirm.backup_required ? "ต้องเตรียมน้องๆและนายแบบสำรอง" : null
				].filter(Boolean).join(" · ")
			}),
			alert && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1",
				children: "ทีมต้องติดตามน้องๆและนายแบบ งานยังไม่ถูกยกเลิก"
			})
		]
	});
}
function StepDetails({ value, onChange, onEditPlace, isPrivate = false, privateAccess, onPrivateChange }) {
	const partnerManaged = isPartnerManaged(value.partner);
	const pricing = servicePricing(value.amount_thb, isPrivate ? privateAccess : void 0, { partnerManaged });
	const clientPayable = pricing.clientTotal === null ? null : Math.round((pricing.clientTotal + (value.travel_fee_thb ?? 0)) * 100) / 100;
	const modelPayable = pricing.modelTotal === null ? null : Math.round((pricing.modelTotal + (value.model_travel_fee_thb ?? 0)) * 100) / 100;
	const deposit = computeDepositBreakdown(clientPayable);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "step-details-heading",
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				id: "step-details-heading",
				className: "text-[13px] font-semibold tracking-[0.18em] text-gold",
				children: "05 · เรทและรายละเอียดถึงน้องๆและนายแบบ"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[13px] text-muted-foreground",
				children: "ตรวจยอดที่จ่ายน้องๆและนายแบบ แล้วระบุข้อมูลที่น้องๆควรเห็น"
			})] }),
			isPrivate && privateAccess && onPrivateChange && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-1.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "วิธีจ่ายน้องๆและนายแบบ" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: privateAccess.settlement ?? "",
						onValueChange: (v) => onPrivateChange({ settlement: v }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "h-11 border-border bg-surface",
							"aria-label": "วิธีจ่ายน้องๆและนายแบบ",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "เลือกวิธีจ่าย" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "direct",
							children: "จ่ายตรง"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "platform",
							children: "ผ่านระบบ"
						})] })]
					})]
				}),
				!partnerManaged && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-1.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
						htmlFor: "payout",
						children: "เรทถึงน้องๆและนายแบบ (บาท)"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						id: "payout",
						type: "number",
						min: 1,
						step: 100,
						value: privateAccess.model_payout_thb ?? "",
						onChange: (e) => onPrivateChange({ model_payout_thb: e.target.value === "" ? null : Number(e.target.value) }),
						placeholder: "กรอกเรทที่ตกลงไว้",
						className: "h-11 border-border bg-surface"
					})]
				}),
				privateAccess.service_options?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", {
					className: "space-y-3 rounded-md border border-border p-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", {
						className: "px-1 font-semibold text-gold",
						children: "Option · เรทเพิ่มถึงน้องๆและนายแบบ"
					}), PRIVATE_SERVICE_OPTIONS.filter((option) => privateAccess.service_options?.includes(option)).map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Label, {
							htmlFor: `model-option-${option}`,
							children: [option.toUpperCase(), " · เรทจ่ายน้องๆและนายแบบ (บาท)"]
						}), partnerManaged ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] text-muted-foreground",
							children: "งานผ่านพาร์ตเนอร์ · ระบบจัดการเรทจ่าย"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							id: `model-option-${option}`,
							type: "number",
							min: 0,
							step: "0.01",
							value: privateAccess.service_rates?.[option]?.model_payout_thb ?? "",
							onChange: (e) => onPrivateChange({ service_rates: {
								...privateAccess.service_rates,
								[option]: {
									client_amount_thb: privateAccess.service_rates?.[option]?.client_amount_thb ?? null,
									model_payout_thb: e.target.value === "" ? null : Number(e.target.value)
								}
							} }),
							className: "h-11 border-border bg-surface"
						})]
					}, option))]
				}) : null
			] }),
			!isPrivate && !partnerManaged && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
					htmlFor: "public-model-payout",
					children: "เรทถึงน้องๆและนายแบบ (บาท)"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					id: "public-model-payout",
					type: "number",
					min: 1,
					step: 100,
					value: value.model_base_payout_thb ?? "",
					onChange: (e) => onChange({ model_base_payout_thb: e.target.value === "" ? null : Number(e.target.value) }),
					placeholder: "กรอกเรทที่ตกลงไว้",
					className: "h-11 border-border bg-surface"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
					htmlFor: "model-travel-fee",
					children: "Transportation · ค่าเดินทางที่จ่ายให้น้องๆและนายแบบ (บาท)"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					id: "model-travel-fee",
					type: "number",
					min: 0,
					step: 1,
					value: value.model_travel_fee_thb ?? "",
					onChange: (e) => onChange({ model_travel_fee_thb: e.target.value === "" ? null : Number(e.target.value) }),
					placeholder: "ไม่จ่ายค่าเดินทางให้เว้นว่าง",
					className: "h-11 border-border bg-surface"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-muted-foreground",
						children: "สถานที่จากขั้น 3 · ใช้ข้อมูลเดียวกันทั้งงาน"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
						value.location,
						" · ",
						value.meeting_choice === "lobby" ? "รอที่ล็อบบี้" : value.meeting_details,
						" · ",
						value.room_number
					] }),
					value.google_map_url && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: value.google_map_url,
						target: "_blank",
						rel: "noreferrer",
						className: "block text-primary underline",
						children: "เปิด Google Maps"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						onClick: onEditPlace,
						children: "แก้ไขสถานที่"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
					htmlFor: "model-remark",
					children: "หมายเหตุถึงน้องๆและนายแบบเท่านั้น"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
					id: "model-remark",
					value: value.brief,
					onChange: (e) => onChange({ brief: e.target.value }),
					rows: 3,
					placeholder: "ข้อความนี้ส่งเป็นบรีฟงานให้น้องๆและนายแบบ",
					className: "border-border bg-surface"
				})]
			}),
			isPrivate && privateAccess && onPrivateChange && (() => {
				const d = privateAccess.discount ?? {
					type: "amount",
					value: null,
					mode: "customer_request"
				};
				const set = (patch) => {
					const next = {
						...d,
						...patch
					};
					onPrivateChange({ discount: next.value === null ? void 0 : next });
				};
				const mode = partnerManaged ? "customer_request" : d.mode;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-1.5 rounded-md border border-border p-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
							htmlFor: "discount",
							className: "text-[13px] text-muted-foreground",
							children: "ส่วนลด"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								role: "radiogroup",
								"aria-label": "ประเภทส่วนลด",
								className: "flex",
								children: ["amount", "percent"].map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									role: "radio",
									"aria-checked": d.type === t,
									variant: d.type === t ? "secondary" : "outline",
									className: "h-11 px-3 text-[13px]",
									onClick: () => onPrivateChange({ discount: {
										...d,
										type: t
									} }),
									children: t === "amount" ? "บาท" : "%"
								}, t))
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "discount",
								type: "number",
								inputMode: "decimal",
								min: 0,
								step: d.type === "percent" ? 1 : 100,
								value: d.value ?? "",
								placeholder: "ไม่ลด",
								onChange: (e) => set({ value: e.target.value === "" ? null : Number(e.target.value) }),
								className: "h-11 border-border bg-surface"
							})]
						}),
						d.value !== null && d.value > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								value: mode,
								disabled: partnerManaged,
								onValueChange: (v) => set({ mode: v }),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
									className: "h-11 border-border bg-surface",
									"aria-label": "เหตุผลส่วนลด",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: "customer_request",
									children: "ลูกค้าขอลด (ไม่มีเหตุผล)"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: "promotion",
									disabled: partnerManaged,
									children: "โปรโมชั่น (พิสูจน์ได้)"
								})] })]
							}),
							partnerManaged && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[12px] text-muted-foreground",
								children: "งานผ่านพาร์ตเนอร์ · ส่วนลดหักจากยอดของ MMD"
							}),
							mode === "promotion" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								"aria-label": "อ้างอิงโปรโมชั่น",
								maxLength: 200,
								value: d.reason ?? "",
								placeholder: "อ้างอิงโปรโมชั่น",
								onChange: (e) => set({ reason: e.target.value }),
								className: "h-11 border-border bg-surface"
							}),
							pricing.discount ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-[13px] text-muted-foreground",
								children: [
									"ลด ฿",
									pricing.discount.amount_thb.toLocaleString(),
									" · MMD ฿",
									pricing.discount.mmd_share_thb.toLocaleString(),
									" · น้องๆและนายแบบ ฿",
									pricing.discount.model_share_thb.toLocaleString()
								]
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								role: "alert",
								className: "text-[13px] text-destructive",
								children: pricing.missing.find((m) => m.includes("ส่วนลด") || m.includes("โปรโมชั่น")) ?? "กรอกราคาให้ครบก่อนคำนวณส่วนลด"
							})
						] })
					]
				});
			})(),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				"aria-label": "สรุปยอดคำนวณ",
				className: "space-y-2 rounded-md border border-border bg-surface-2 p-3 text-[13px]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-semibold text-foreground",
						children: "สรุปยอดคำนวณอัตโนมัติ"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "ค่าบริการลูกค้า (รวมบริการเสริม)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: pricing.clientTotal === null ? "รอกรอกเรทครบ" : `฿${pricing.clientTotal.toLocaleString()}` })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "ค่าเดินทางลูกค้า" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["฿", (value.travel_fee_thb ?? 0).toLocaleString()] })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex justify-between gap-3 border-t border-border pt-2 font-semibold",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "ยอดลูกค้ารวม" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: clientPayable === null ? "—" : `฿${clientPayable.toLocaleString()}` })]
					}),
					deposit && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "text-muted-foreground",
						children: [
							"มัดจำ 30% ปัดขึ้นทีละ ฿500 · ฿",
							deposit.deposit.toLocaleString(),
							" · ",
							"ยอดคงเหลือ ฿",
							deposit.balance.toLocaleString()
						]
					}),
					!partnerManaged && pricing.modelBaseActive && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex justify-between gap-3 border-t border-border pt-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "ค่าจ้างน้องๆและนายแบบ (รวมบริการเสริม)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: pricing.modelTotal === null ? "รอเรทน้องๆและนายแบบ" : `฿${pricing.modelTotal.toLocaleString()}` })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "ค่าเดินทางน้องๆและนายแบบ" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["฿", (value.model_travel_fee_thb ?? 0).toLocaleString()] })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex justify-between gap-3 border-t border-border pt-2 font-semibold",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "ยอดจ่ายน้องๆและนายแบบรวม" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: modelPayable === null ? "—" : `฿${modelPayable.toLocaleString()}` })]
						})
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[12px] text-muted-foreground",
						children: "ตรวจยอดอีกครั้งก่อนสร้างงาน"
					})
				]
			}),
			!isPrivate && !partnerManaged && value.model_base_payout_thb ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[14px] font-semibold text-gold",
				children: ["ยอดจ่ายน้องๆและนายแบบรวมค่าเดินทาง · ฿", (value.model_base_payout_thb + (value.model_travel_fee_thb ?? 0)).toLocaleString()]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReconfirmPolicyCard, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
					htmlFor: "ref",
					children: "เลขอ้างอิงเพิ่มเติม"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					id: "ref",
					value: value.reference_code,
					onChange: (e) => onChange({ reference_code: e.target.value }),
					placeholder: "กรอกเมื่อมีเลขอ้างอิงอื่น",
					className: "h-11 border-border bg-surface"
				})]
			})
		]
	});
}
/**
* Safe deep link into the job-management page. session_ref is reflected into a
* URL, so it must match a strict token shape before we build the href.
*/
var SESSION_REF_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
function jobsAllHref(sessionRef) {
	if (!sessionRef || !SESSION_REF_RE.test(sessionRef)) return null;
	return `/internal/admin/jobs/all?session_id=${encodeURIComponent(sessionRef)}`;
}
var PAYMENT_LIFF_URL = "https://miniapp.line.me/2010830159-0n1O3ANK";
var PAYMENT_HOSTS = /* @__PURE__ */ new Set([
	"mmdbkk.com",
	"www.mmdbkk.com",
	"sigil.mmdbkk.com"
]);
/** Keep the signed job token unchanged while opening the existing LINE payment Mini App. */
function paymentMiniAppUrl(value) {
	if (!value) return null;
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" || !PAYMENT_HOSTS.has(url.hostname) || url.username || url.password || url.hash || url.pathname !== "/sigil/pay") return null;
		if ([...url.searchParams.keys()].some((key) => key !== "t") || [...url.searchParams].length !== 1) return null;
		const token = url.searchParams.get("t") || "";
		if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
		const miniApp = new URL(PAYMENT_LIFF_URL);
		miniApp.searchParams.set("t", token);
		return miniApp.toString();
	} catch {
		return null;
	}
}
var Separator = import_react.forwardRef(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator$1, {
	ref,
	decorative,
	orientation,
	className: cn("shrink-0 bg-border", orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]", className),
	...props
}));
Separator.displayName = Separator$1.displayName;
function UncertainPanel({ lock }) {
	const href = jobsAllHref(lock.session_ref) ?? "/internal/admin/jobs/all";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		role: "alert",
		className: "mt-3 space-y-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "flex items-start gap-1.5 font-semibold",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "h-4 w-4 shrink-0",
					"aria-hidden": true
				}), lock.recovered ? "มีคำขอสร้างงานที่ยังไม่ทราบผลจากก่อนรีเฟรช" : "ยังยืนยันผลการสร้างงานไม่ได้ — งานอาจถูกสร้างแล้ว"]
			}),
			(lock.session_ref || lock.payment_ref) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
				"เลขงาน: ",
				lock.session_ref ?? "—",
				" · เลขชำระเงิน: ",
				lock.payment_ref ?? "—"
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "ปิดปุ่มสร้างไว้เพื่อกันงานซ้ำ ระบบจะไม่ส่งซ้ำอัตโนมัติ ตรวจงานทั้งหมดและให้ทีมหลังบ้านยืนยันผลคำขอเดิมก่อนสร้างอีกครั้ง" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
				href,
				className: "inline-flex min-h-11 items-center gap-1 underline",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, {
					className: "h-4 w-4",
					"aria-hidden": true
				}), "เปิดงานทั้งหมด"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-foreground/80",
				children: "หน้านี้ยังตรวจผลคำขอเดิมกับระบบโดยอัตโนมัติไม่ได้ จึงไม่เปิดให้ติ๊กยืนยันเพื่อปลดล็อกเอง"
			})
		]
	});
}
/** Backend owner-grant rejection. Read-only surface — never auto-retried. */
function GrantErrorPanel({ detail }) {
	const lookup = detail.code === "OWNER_JOB_GRANT_LOOKUP_INCONSISTENT";
	const expected = detail.expected ?? null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-semibold",
				children: lookup ? "ระบบหลังบ้านตรวจสิทธิ์ไม่สอดคล้อง — ไม่สร้างงาน" : "ข้อมูลงานไม่ตรงกับสิทธิ์ที่ระบบหลังบ้านอนุมัติ"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1",
				children: lookup ? "ระบบปิดไว้เพื่อความปลอดภัย ไม่มีการสร้างงาน และจะไม่ลองใหม่อัตโนมัติ กรุณาตรวจกับทีมหลังบ้าน" : "กรุณาแก้ข้อมูลที่ไม่ตรง แล้วกดสร้างงานอีกครั้ง"
			}),
			detail.mismatched_fields?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-2 space-y-0.5",
				children: detail.mismatched_fields.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
					"• ",
					f,
					expected && expected[f] !== void 0 ? ` — ค่าที่ระบบหลังบ้านคาดไว้: ${String(expected[f])}` : ""
				] }, f))
			}) : null,
			detail.message && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 opacity-90",
				children: detail.message
			})
		]
	});
}
function Row({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-baseline justify-between gap-3 py-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[12px] uppercase text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-right text-[13px] text-foreground/90",
			children: value || "—"
		})]
	});
}
function DepositSlipUpload({ result }) {
	const inputRef = (0, import_react.useRef)(null);
	const [file, setFile] = (0, import_react.useState)(null);
	const [source, setSource] = (0, import_react.useState)("line_ofc");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [message, setMessage] = (0, import_react.useState)("");
	const [proofId, setProofId] = (0, import_react.useState)(null);
	const [reviewPath, setReviewPath] = (0, import_react.useState)(null);
	function chooseFile(event) {
		setFile(event.target.files?.[0] ?? null);
		setMessage("");
		setProofId(null);
		setReviewPath(null);
	}
	async function upload() {
		if (!file || !result.session_ref || busy) return;
		if (usingDemoData()) {
			setMessage("หน้านี้เป็นตัวอย่าง กรุณาอัปโหลดสลิปจากหน้าสร้างงานจริง");
			return;
		}
		if (![
			"image/jpeg",
			"image/png",
			"image/webp"
		].includes(file.type) || file.size > 10485760) {
			setMessage("เลือกไฟล์ JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB");
			return;
		}
		const form = new FormData();
		form.set("file", file);
		form.set("source_channel", source);
		form.set("session_id", result.session_ref);
		form.set("payment_stage", "deposit");
		form.set("note", `สลิปมัดจำย้อนหลังจากหน้าสร้างงาน · เลขงาน ${result.session_ref}${result.payment_ref ? ` · เลขชำระเงิน ${result.payment_ref}` : ""}`);
		setBusy(true);
		setMessage("");
		try {
			const response = await fetch("/studio/api/payments/slip-intake", {
				method: "POST",
				credentials: "include",
				cache: "no-store",
				body: form
			});
			const data = await response.json();
			if (!response.ok || data.ok !== true) throw new Error(data.error || `HTTP ${response.status}`);
			setProofId(data.proof_id ?? null);
			setReviewPath(data.review_path?.startsWith("/internal/admin/payments") ? data.review_path : null);
			setMessage(data.duplicate ? "พบสลิปนี้ในระบบแล้ว · ไม่บันทึกซ้ำ" : "รับสลิปแล้ว · รอตรวจหลักฐาน ยังไม่ยืนยันยอดชำระ");
			setFile(null);
			if (inputRef.current) inputRef.current.value = "";
		} catch (error) {
			setMessage(`อัปโหลดไม่สำเร็จ · ${error instanceof Error ? error.message : "ลองใหม่ได้"}`);
		} finally {
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-label": "อัปโหลดสลิปมัดจำย้อนหลัง",
		className: "mt-3 rounded-md border border-gold/35 bg-gold-muted/50 p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "text-[13px] font-semibold text-foreground",
				children: "ลูกค้ามัดจำมาแล้ว?"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[12px] text-muted-foreground",
				children: "แนบสลิปกับงานนี้ย้อนหลัง หลักฐานจะเข้าคิวตรวจใน Payments และยังไม่เปลี่ยนสถานะเป็นชำระแล้ว"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 flex flex-wrap items-end gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "min-w-[150px] flex-1 text-[12px] text-muted-foreground",
					children: ["ช่องทางที่ได้รับ", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						value: source,
						onChange: (event) => setSource(event.target.value),
						className: "mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-[13px] text-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "line_ofc",
							children: "LINE OFC"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "cdm_paper",
							children: "สลิปกระดาษ / CDM"
						})]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "min-w-[220px] flex-[2] text-[12px] text-muted-foreground",
					children: ["รูปสลิป (JPG, PNG, WebP · สูงสุด 10 MB)", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						ref: inputRef,
						type: "file",
						accept: "image/jpeg,image/png,image/webp",
						onChange: chooseFile,
						className: "mt-1 block w-full text-[13px] text-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-foreground"
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "button",
				onClick: upload,
				disabled: !file || busy || !result.session_ref,
				className: "mt-3 h-11 w-full text-[13px]",
				children: busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
					className: "mr-2 h-4 w-4 animate-spin",
					"aria-hidden": true
				}), " กำลังอัปโหลด…"] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Upload, {
					className: "mr-2 h-4 w-4",
					"aria-hidden": true
				}), " อัปโหลดสลิปมัดจำ"] })
			}),
			message && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "mt-2 text-[12px] text-foreground",
				children: message
			}),
			proofId && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-1 text-[12px] text-muted-foreground",
				children: ["หลักฐาน: ", proofId]
			}),
			reviewPath && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
				href: reviewPath,
				className: "mt-1 inline-block text-[12px] text-primary underline",
				children: "เปิดหลักฐานที่รับไว้"
			})
		]
	});
}
/** Customer payment link block shown after a successful create. Never persisted or logged. */
function PaymentLinkBlock({ result }) {
	const [copied, setCopied] = (0, import_react.useState)(null);
	const url = result.customer_payment_url ?? null;
	const miniAppUrl = paymentMiniAppUrl(url);
	const customerUrl = miniAppUrl ?? url;
	const due = result.amount_due_thb ?? result.deposit_amount_thb ?? null;
	const balance = result.balance_amount_thb ?? null;
	const notification = result.notification_status;
	const notificationLine = notification === "sent" ? "แจ้งเตือน Telegram: ส่งแล้ว" : notification === "failed" ? "แจ้งเตือน Telegram: ส่งไม่สำเร็จ" : notification === "not_configured" ? "แจ้งเตือน Telegram: ไม่ได้ตั้งค่า" : null;
	const warnings = result.warnings?.filter(Boolean) ?? [];
	const notices = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		notificationLine && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 text-[12px] text-muted-foreground",
			children: notificationLine
		}),
		(notification === "failed" || notification === "not_configured") && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mt-1 flex items-start gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[12px] text-warn",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
				className: "mt-px h-3.5 w-3.5 shrink-0",
				"aria-hidden": true
			}), "แจ้งเตือนไม่สำเร็จ · คัดลอกลิงก์ด้านบนส่งให้ลูกค้าได้"]
		}),
		warnings.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-2 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[12px] text-warn",
			children: warnings.map((warning, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: warning }, `${warning}-${index}`))
		})
	] });
	const copy = async (text, which) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.style.position = "fixed";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.select();
			document.execCommand("copy");
			document.body.removeChild(ta);
		}
		setCopied(which);
		window.setTimeout(() => setCopied((c) => c === which ? null : c), 2e3);
	};
	if (result.pending_client || result.confirmations_held || [
		"pending_client_link",
		"pending_model_link",
		"pending_identity_link"
	].includes(result.operational_status || "")) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3 space-y-3 rounded-lg border border-warn/40 bg-warn/10 p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[14px] font-medium",
				children: "บันทึกงานแล้ว · กรุณาตรวจข้อมูลลูกค้าก่อนออกลิงก์ชำระเงิน"
			}),
			result.session_ref && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerIdentityAction, {
				sessionId: result.session_ref,
				onVerified: () => {}
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
				href: jobsAllHref(result.session_ref) ?? "/internal/admin/jobs/all",
				className: "inline-flex min-h-11 items-center text-[14px] underline",
				children: "เปิดงานนี้เพื่อตรวจสถานะล่าสุด ↗"
			})
		]
	});
	if (!url) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "flex items-start gap-1.5 font-semibold",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
				className: "mt-px h-3.5 w-3.5 shrink-0",
				"aria-hidden": true
			}), "สร้างงานแล้ว แต่ยังไม่มีลิงก์ชำระเงิน กรุณาเปิดงานเพื่อตรวจสอบ"]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mt-1 text-[12px] opacity-90",
			children: [result.session_ref ? `เลขงาน: ${result.session_ref}` : "", result.payment_ref ? ` · เลขชำระเงิน: ${result.payment_ref}` : ""]
		})]
	}), notices] });
	const lineMessage = `ชำระมัดจำ ฿${due !== null ? due.toLocaleString() : "—"} ผ่านลิงก์นี้: ${customerUrl}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-2 rounded-md border border-verified/40 bg-surface px-3 py-2.5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[12px] font-semibold uppercase tracking-wide text-verified",
				children: "ลิงก์ชำระเงินลูกค้า"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 select-all break-all text-[13px] text-foreground/90",
				children: customerUrl
			}),
			miniAppUrl && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[12px] text-muted-foreground",
				children: "เปิดหน้าชำระเงินผ่าน LINE Mini App"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					onClick: () => void copy(customerUrl, "link"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, {
						className: "mr-1.5 h-3.5 w-3.5",
						"aria-hidden": true
					}), copied === "link" ? "คัดลอกแล้ว" : "คัดลอกลิงก์"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
						href: customerUrl,
						target: "_blank",
						rel: "noopener noreferrer",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, {
							className: "mr-1.5 h-3.5 w-3.5",
							"aria-hidden": true
						}), "เปิดลิงก์"]
					})
				})]
			}),
			(due !== null || balance !== null) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 text-[13px] text-foreground/90",
				children: [
					due !== null ? `มัดจำที่ต้องชำระ ฿${due.toLocaleString()}` : "",
					due !== null && balance !== null ? " · " : "",
					balance !== null ? `ยอดคงเหลือ ฿${balance.toLocaleString()}` : ""
				]
			}),
			notices,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 rounded-md border border-border bg-surface-2 px-2.5 py-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[12px] text-muted-foreground",
						children: "ข้อความส่งให้ลูกค้าทาง LINE"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-0.5 select-all break-all text-[13px] text-foreground/90",
						children: lineMessage
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						type: "button",
						size: "sm",
						variant: "outline",
						className: "mt-2",
						onClick: () => void copy(lineMessage, "message"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, {
							className: "mr-1.5 h-3.5 w-3.5",
							"aria-hidden": true
						}), copied === "message" ? "คัดลอกแล้ว" : "คัดลอกข้อความ"]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-[12px] text-muted-foreground",
				children: "ลิงก์ยืนยันงาน (ลูกค้า/น้องๆและนายแบบ) จะปล่อยหลังตรวจสอบการชำระเงิน"
			})
		]
	});
}
function requirementCopy(requirement) {
	const labels = {
		"Canonical client not selected": "เลือกลูกค้า",
		"Client has no canonical Clients record ID": "ตรวจข้อมูลลูกค้าก่อนสร้างงาน",
		"Work type not selected": "เลือกประเภทงาน",
		"Canonical model not selected": "เลือกน้องๆและนายแบบ",
		"Model has no canonical Models record ID — needs review / stage into Models": "ตรวจข้อมูลน้องๆและนายแบบก่อนสร้างงาน",
		"Model is review-blocked by backend": "น้องคนนี้ยังเลือกไม่ได้ กรุณาตรวจสอบก่อน",
		"Date and start time required": "ใส่วันและเวลาเริ่ม",
		"Duration required": "เลือกระยะเวลา",
		"Location required": "ใส่สถานที่",
		"Amount THB required": "ใส่ยอดบริการ"
	};
	if (labels[requirement]) return labels[requirement];
	const privateLabels = {
		"Private: ต้องเลือก access folder": "เลือกกลุ่มน้องๆและนายแบบสำหรับงานส่วนตัว",
		"Private: ต้องเลือก orientation": "เลือกความชอบสำหรับงานส่วนตัว",
		"Private: ต้องเลือก work type (pn / vip)": "เลือกประเภทงาน PN หรือ VIP",
		"Private: ต้องเลือกวิธีจ่ายโมเดล": "เลือกวิธีจ่ายน้องๆและนายแบบ",
		"Private: ต้องระบุ model payout THB สำหรับ direct settlement": "กรอกค่าจ้างน้องๆและนายแบบ"
	};
	if (privateLabels[requirement]) return privateLabels[requirement];
	const partnerLabels = {
		"Partner: ต้องเลือก Partner จากรายการ": "เลือกพาร์ตเนอร์จากรายการ",
		"Partner: ต้องระบุชื่อ partner": "เลือกพาร์ตเนอร์ที่ต้องการ",
		"Partner: ต้องเลือกประเภท partner": "เลือกรูปแบบพาร์ตเนอร์",
		"Partner: ต้องกรอกเรทรวม Co-Partner มากกว่า 0": "กรอกเรทรวมที่ตกลงกับพาร์ตเนอร์",
		"Partner: ต้องกรอก Partner Share % (1–100)": "กรอกส่วนแบ่งพาร์ตเนอร์เป็นเปอร์เซ็นต์"
	};
	if (partnerLabels[requirement]) return partnerLabels[requirement];
	if (requirement.startsWith("Map:")) return "ตรวจลิงก์แผนที่ ให้ขึ้นต้นด้วย https://";
	return requirement;
}
function nextAction(current, missing) {
	const byStep = {
		1: {
			title: "เริ่มจากค้นหาลูกค้า หรือพิมพ์ชื่อที่เปอร์เรียกไว้",
			detail: "ค้นจากชื่อ / LINE / โทร / Email ได้เลย ไม่ต้องจำรหัส"
		},
		2: {
			title: "เลือก Public / Private ก่อน",
			detail: "เลือกจากประเภทงานที่กำลังจะสร้าง"
		},
		3: {
			title: "เลือกน้องๆและนายแบบจากชื่อที่ใช้เรียก",
			detail: "ระบบจะแสดงเฉพาะตัวเลือกที่ค้นหาได้จากข้อมูลหลังบ้าน"
		},
		4: {
			title: "ใส่วัน เวลา ระยะเวลา สถานที่ และยอด",
			detail: "ใช้ข้อมูลหน้างานที่เปอร์รู้อยู่แล้ว"
		}
	};
	if (current < 5) return byStep[current] ?? {
		title: "เริ่มจากข้อมูลที่เปอร์รู้",
		detail: "ระบบจะพาไปทีละขั้นโดยไม่ต้องจำรหัส"
	};
	const first = missing[0];
	return first ? {
		title: `ยังต้องเติม: ${requirementCopy(first)}`,
		detail: "เติมรายการนี้แล้วตรวจอีกครั้งก่อนสร้างงาน"
	} : {
		title: "ข้อมูลครบแล้ว พร้อมสร้างงาน",
		detail: "ตรวจรายละเอียดด้านล่าง แล้วกดสร้างงาน"
	};
}
var NEXT_LABELS = {
	1: "ต่อไป: เลือกงาน",
	2: "ต่อไป: เลือกน้องๆและนายแบบ",
	3: "ต่อไป: ใส่รายละเอียด",
	4: "ต่อไป: กรอกเรท",
	6: "ต่อไป: สร้างงาน"
};
function ReviewRail({ current, client, work, model, details, privateAccess, missing, submitting, memberBlocked = false, memberGrantPending = false, ownerGrantBusy = false, ownerGrantError, onOwnerGrant, result, error, grantError, onCreate, onReset, createLock = { kind: "none" }, onNext, onEdit, nextDisabled = false, jobBoard }) {
	const ready = missing.length === 0 && !submitting && !ownerGrantBusy && createLock.kind === "none";
	const endTime = computeEndTime(details.time, details.duration_minutes);
	const action = nextAction(current, missing);
	const currentComplete = current === 6 && ready || current === 1 && Boolean(client) && !missing.some((item) => item.startsWith("Canonical client") || item.startsWith("Client has no canonical")) || current === 2 && Boolean(work) || current === 3 && Boolean(model) && !missing.some((item) => item.startsWith("Canonical model") || item.startsWith("Model has no canonical") || item.startsWith("Model is review-blocked")) || current === 4 && servicePricing(details.amount_thb, privateAccess, { partnerManaged: isPartnerManaged(details.partner) }).missing.length === 0 && !missing.some((item) => [
		"Date and start time required",
		"Duration required",
		"Location required",
		"Amount THB required"
	].includes(item) || item.startsWith("Private:") || item.startsWith("Partner:") || item.startsWith("Map:"));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-md border border-border bg-surface p-3 sm:p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[13px] font-semibold tracking-[0.18em] text-gold",
					children: current === 6 ? "06 · ตรวจสรุป" : "07 · สร้างงาน"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: cn("text-[12px] font-semibold", result?.status === "created" || current >= 6 && ready ? "text-verified" : "text-muted-foreground"),
					children: result?.status === "created" ? "สร้างงานแล้ว" : current >= 6 ? ready ? "พร้อมตรวจ" : "รอข้อมูล" : "กำลังเตรียมงาน"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: cn("mt-2 rounded-md border px-3 py-2.5", ready ? "border-verified/40 bg-verified/10" : "border-gold/35 bg-gold-muted"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: cn("text-[14px] font-semibold", ready ? "text-verified" : "text-foreground"),
					children: result?.status === "created" ? "บันทึกงานสำเร็จ" : action.title
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-0.5 text-[12px] leading-relaxed text-muted-foreground",
					children: result?.status === "created" ? "แนบสลิปมัดจำย้อนหลังได้ด้านล่าง หรือเปิดงานในหน้าจัดการงาน" : action.detail
				})]
			}),
			onEdit && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				"aria-label": "แก้ข้อมูลแต่ละส่วน",
				className: "mt-3 flex flex-wrap gap-2",
				children: [
					"ลูกค้า",
					"รายละเอียดงาน",
					"สถานที่และบรีฟ MMD",
					"น้องๆและนายแบบ",
					"เรทและหมายเหตุ"
				].map((label, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					type: "button",
					variant: "outline",
					disabled: submitting || createLock.kind !== "none",
					onClick: () => onEdit(index + 1),
					children: ["แก้", label]
				}, label))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-2",
				children: client ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[16px] font-semibold text-foreground",
						children: primaryName(client)
					}),
					secondaryName(client) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-muted-foreground",
						children: secondaryName(client)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-[13px] font-medium text-muted-foreground",
						children: clientProvenanceLine(client)
					})
				] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[13px] text-muted-foreground",
					children: "ยังไม่ได้เลือกลูกค้า"
				})
			}),
			work || model || details.date || details.duration_minutes || details.amount_thb || details.location ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator, { className: "my-2 bg-border" }),
				work ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "ประเภทงาน",
					value: `${work.label} (${work.code})`
				}) : null,
				model ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "น้องๆและนายแบบ",
					value: `${model.display_name} · ${model.model_lookup_key ?? model.code ?? model.model_id}${model.source_kind === "partner" ? ` · พาร์ตเนอร์${model.partner_name ? ` · ${model.partner_name}` : ""}` : ""}`
				}) : null,
				details.date ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "วันและเวลา",
					value: `${details.date} ${details.time}${endTime ? ` – ${endTime}` : ""}`
				}) : null,
				details.duration_minutes ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "ระยะเวลา",
					value: `${details.duration_minutes} นาที`
				}) : null,
				details.amount_thb ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "ราคาบริการลูกค้า",
					value: `฿${details.amount_thb.toLocaleString()}`
				}) : null,
				details.travel_fee_thb ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "ค่าเดินทางลูกค้า",
					value: `฿${details.travel_fee_thb.toLocaleString()}`
				}) : null,
				details.model_travel_fee_thb ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "ค่าเดินทางน้องๆและนายแบบ",
					value: `฿${details.model_travel_fee_thb.toLocaleString()}`
				}) : null,
				(() => {
					const dep = computeDepositBreakdown(servicePricing(details.amount_thb, privateAccess, { partnerManaged: isPartnerManaged(details.partner) }).clientTotal === null ? null : servicePricing(details.amount_thb, privateAccess, { partnerManaged: isPartnerManaged(details.partner) }).clientTotal + (details.travel_fee_thb ?? 0));
					if (!dep) return null;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						label: "มัดจำ",
						value: `30% · ปัดขึ้นทีละ 500 บาท → ฿${dep.deposit.toLocaleString()}`
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						label: "ยอดคงเหลือ",
						value: `฿${dep.balance.toLocaleString()} จ่ายเมื่อพบน้องๆและนายแบบ`
					})] });
				})(),
				!privateAccess && !isPartnerManaged(details.partner) && details.model_base_payout_thb ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "ยอดจ่ายน้องๆและนายแบบรวมค่าเดินทาง",
					value: `฿${(details.model_base_payout_thb + (details.model_travel_fee_thb ?? 0)).toLocaleString()}`
				}) : null,
				privateAccess?.job_type ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "ประเภทงาน",
					value: privateAccess.job_type.toUpperCase()
				}) : null,
				privateAccess?.service_options?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "บริการเสริม",
					value: privateAccess.service_options.map((option) => option.toUpperCase()).join(" / ")
				}) : null,
				servicePricing(details.amount_thb, privateAccess).modelBaseActive && privateAccess?.model_payout_thb ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "ค่าจ้างน้องๆและนายแบบก่อนเพิ่มบริการเสริม",
					value: `฿${privateAccess.model_payout_thb.toLocaleString()}`
				}) : null,
				privateAccess?.service_options?.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: option.toUpperCase(),
					value: `ลูกค้า ฿${privateAccess.service_rates?.[option]?.client_amount_thb ?? "—"} · น้องๆและนายแบบ ฿${privateAccess.service_rates?.[option]?.model_payout_thb ?? "—"}`
				}, option)),
				(() => {
					const pricing = servicePricing(details.amount_thb, privateAccess, { partnerManaged: isPartnerManaged(details.partner) });
					const d = pricing.discount;
					const b = (n) => n === null ? "—" : `฿${n.toLocaleString()}`;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: "ยอดลูกค้ารวม",
							value: pricing.clientTotal === null ? null : `฿${(pricing.clientTotal + (details.travel_fee_thb ?? 0)).toLocaleString()}`
						}),
						pricing.modelBaseActive && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: privateAccess?.settlement === "platform" ? "ยอดจ่ายน้องๆและนายแบบรวม" : "ยอดจ่ายน้องๆและนายแบบรวม",
							value: pricing.modelTotal === null ? null : `฿${(pricing.modelTotal + (details.model_travel_fee_thb ?? 0)).toLocaleString()}`
						}),
						d && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-2 rounded-md border border-border p-2",
							"aria-label": "ประวัติการลดราคา",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[12px] font-semibold tracking-wide text-gold",
									children: "ประวัติการลดราคา"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-[12px] text-muted-foreground",
									children: "ราคาก่อนลด (ลูกค้า)"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: (privateAccess?.job_type ?? "Base").toUpperCase(),
									value: b(details.amount_thb)
								}),
								pricing.addons.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: a.option.toUpperCase(),
									value: b(a.client_amount_thb)
								}, a.option)),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "= รวมก่อนลด",
									value: b(pricing.clientGross)
								}),
								pricing.modelGross !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-[12px] text-muted-foreground",
										children: "ยอดจ่ายก่อนลด"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										label: "ค่าจ้างน้องๆและนายแบบ",
										value: b(privateAccess?.model_payout_thb ?? null)
									}),
									pricing.addons.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										label: a.option.toUpperCase(),
										value: b(a.model_payout_thb)
									}, a.option)),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										label: "= ยอดจ่ายก่อนลด",
										value: b(pricing.modelGross)
									})
								] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "ส่วนลด",
									value: `${d.type === "percent" ? `${d.value}%` : `฿${d.value.toLocaleString()}`} = ฿${d.amount_thb.toLocaleString()} · ${d.mode === "promotion" ? `โปรโมชั่น${d.reason ? ` · ${d.reason}` : ""}` : "ลูกค้าขอลด"}`
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "ผู้รับผิดชอบส่วนลด",
									value: `MMD ฿${d.mmd_share_thb.toLocaleString()} · น้องๆและนายแบบ ฿${d.model_share_thb.toLocaleString()}`
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "ยอดลูกค้าสุทธิ",
									value: b(pricing.clientTotal)
								}),
								pricing.modelTotal !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "ยอดจ่ายสุทธิ",
									value: b(pricing.modelTotal)
								})
							]
						})
					] });
				})(),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "ช่องทางรับงานของน้องๆและนายแบบ",
					value: details.partner?.channel === "partner" ? `ผ่านพาร์ตเนอร์ · ${details.partner.name || "—"}${details.partner.type ? ` · ${PARTNER_TYPE_LABEL[details.partner.type]}` : ""}${details.partner.type === "co_partner" && details.partner.combined_rate_thb ? ` · ฿${details.partner.combined_rate_thb.toLocaleString()}` : ""}` : "รับงานตรง"
				}),
				details.partner?.source_choice === "partner" && details.partner.name ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "py-1 text-[12px] text-muted-foreground",
					children: ["งานนี้จะแสดงในหน้าพาร์ตเนอร์ของ ", details.partner.name]
				}) : null,
				details.location ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "สถานที่",
					value: details.location
				}) : null,
				details.google_map_url?.trim() && isValidMapUrl(details.google_map_url) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-baseline justify-between gap-3 py-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[12px] uppercase text-muted-foreground",
						children: "แผนที่"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: details.google_map_url.trim(),
						target: "_blank",
						rel: "noreferrer",
						className: "text-[13px] text-primary underline-offset-4 hover:underline",
						children: "เปิดแผนที่"
					})]
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "จุดนัดพบ",
					value: details.meeting_choice === "lobby" ? "รอที่ล็อบบี้" : details.meeting_details || details.meeting_point
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "บ้านเลขที่ / เลขห้อง",
					value: details.room_number
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "บรีฟภายใน — สำหรับทีม MMD",
					value: details.operator_note
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					label: "หมายเหตุถึงน้องๆและนายแบบ",
					value: details.brief
				})
			] }) : null,
			client?.warnings?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex items-start gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "mt-px h-3.5 w-3.5 shrink-0",
					"aria-hidden": true
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: client.warnings.join(" ") })]
			}) : null,
			current >= 6 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "mt-3 rounded-md border border-border bg-surface-2 px-3 py-2",
				open: missing.length > 0,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
					className: "cursor-pointer text-[12px] font-semibold text-muted-foreground",
					children: missing.length ? "ยังต้องเติม" : "ข้อมูลครบแล้ว"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-2 space-y-1 text-[12px] text-muted-foreground",
					children: missing.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center gap-1.5 text-verified",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {
							className: "h-3.5 w-3.5",
							"aria-hidden": true
						}), " ข้อมูลที่จำเป็นครบ"]
					}) : missing.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-start gap-1.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Circle, {
								className: "mt-0.5 h-3 w-3 shrink-0",
								"aria-hidden": true
							}),
							" ",
							requirementCopy(m)
						]
					}, m))
				})]
			}) : null,
			result && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: cn("mt-3 flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-[12px]", result.status === "created" ? "border-verified/40 bg-verified/10 text-verified" : result.status === "pending" ? "border-warn/40 bg-warn/10 text-warn" : "border-destructive/40 bg-destructive/10 text-destructive"),
				children: [result.status === "created" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, {
					className: "mt-px h-3.5 w-3.5 shrink-0",
					"aria-hidden": true
				}) : result.status === "pending" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
					className: "mt-px h-3.5 w-3.5 shrink-0",
					"aria-hidden": true
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleX, {
					className: "mt-px h-3.5 w-3.5 shrink-0",
					"aria-hidden": true
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
					result.status === "created" ? "สร้างงานแล้ว" : result.status === "drafted" ? "บันทึกร่างแล้ว" : result.status === "pending" ? "กำลังตรวจข้อมูล" : "ยังสร้างงานไม่สำเร็จ",
					result.session_ref ? ` · เลขงาน ${result.session_ref}` : "",
					result.payment_ref ? ` · เลขชำระเงิน ${result.payment_ref}` : "",
					result.status === "created" && jobsAllHref(result.session_ref) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "mt-1 block",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
							className: "inline-flex items-center gap-1 underline",
							href: jobsAllHref(result.session_ref) ?? void 0,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, {
								className: "h-3.5 w-3.5",
								"aria-hidden": true
							}), "เปิดในหน้าจัดการงาน"]
						})
					})
				] })]
			}),
			result?.status === "created" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaymentLinkBlock, { result }),
			result?.status === "created" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DepositSlipUpload, { result }, result.session_ref || "created"),
			result?.status === "created" && (() => {
				const url = safePartnerDashboardUrl(result.linkage?.partner_dashboard_url);
				return url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: url,
					target: "_blank",
					rel: "noopener noreferrer",
					className: "mt-2 inline-flex min-h-11 items-center rounded-md border border-gold/50 px-3 text-[14px] font-medium text-primary underline-offset-4 hover:underline",
					children: "เปิดงานในหน้าพาร์ตเนอร์"
				}) : null;
			})(),
			result?.linkage && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: cn("mt-2 rounded-md border px-3 py-2 text-[13px]", result.linkage.status === "review_required" ? "border-warn/40 bg-warn/10 text-warn" : "border-border bg-surface-2 text-muted-foreground"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-semibold",
					children: result.linkage.status === "review_required" ? "ข้อมูลบางส่วนยังต้องตรวจสอบ" : "ข้อมูลลูกค้าและน้องๆและนายแบบเชื่อมกับงานแล้ว"
				}), result.linkage.status === "review_required" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1",
					children: "เปิดหน้าจัดการงานเพื่อตรวจข้อมูลที่ยังไม่ครบ ก่อนส่งต่อให้ลูกค้าหรือน้องๆและนายแบบ"
				})]
			}),
			jobBoard,
			result?.status === "created" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReconfirmResult, { reconfirm: result.reconfirm }),
			!result && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReconfirmPolicyCard, { compact: true }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-[13px] text-muted-foreground",
					children: "ระบบจะตั้งเวลาแจ้งน้องๆและนายแบบให้รับทราบงานตามวันและเวลาที่ระบุ"
				})]
			}),
			grantError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GrantErrorPanel, { detail: grantError }),
			current === 7 && memberBlocked && !result && createLock.kind === "none" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				role: "status",
				className: "mt-3 rounded-md border border-gold/40 bg-gold-muted/50 p-3 text-[13px]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-semibold",
						children: "งานยังไม่ถูกสร้าง · ต้องอนุมัติสิทธิ์เฉพาะงาน"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1",
						children: "ระบบไม่พบสิทธิ์สมาชิกที่เชื่อมกับลูกค้านี้ เจ้าของสามารถอนุมัติเฉพาะรายละเอียดงานที่ตรวจอยู่ โดยไม่เพิ่มสมาชิกถาวร"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						onClick: onOwnerGrant,
						disabled: ownerGrantBusy || submitting,
						className: "mt-3 h-11 w-full text-[13px]",
						children: ownerGrantBusy ? "กำลังอนุมัติสิทธิ์เฉพาะงาน…" : "อนุมัติสิทธิ์เฉพาะงานนี้"
					}),
					ownerGrantError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "mt-2 text-destructive",
						children: ownerGrantError
					})
				]
			}),
			current === 7 && memberGrantPending && !result && createLock.kind === "none" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				role: "status",
				className: "mt-3 rounded-md border border-verified/40 bg-verified/10 p-3 text-[13px]",
				children: "อนุมัติสิทธิ์เฉพาะงานนี้แล้ว · ตรวจข้อมูลอีกครั้งแล้วกดสร้างงาน เพื่อให้ระบบออกลิงก์มัดจำ"
			}),
			error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive",
				children: error
			}),
			createLock.kind === "uncertain" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UncertainPanel, { lock: createLock }),
			current === 7 ? createLock.kind === "uncertain" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				disabled: true,
				className: "mt-3 h-11 w-full text-[14px] font-semibold",
				children: "ตรวจงานทั้งหมดก่อน"
			}) : createLock.kind === "created" || result?.status === "created" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					onClick: onCreate,
					disabled: true,
					"aria-live": "polite",
					className: "mt-3 h-11 w-full text-[14px] font-semibold",
					children: "สร้างงานแล้ว"
				}),
				onReset && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "outline",
					onClick: onReset,
					className: "mt-2 h-11 w-full text-[14px]",
					children: "สร้างงานใหม่"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1.5 text-center text-[12px] text-muted-foreground",
					children: "ปิดปุ่มสร้างไว้เพื่อกันงานซ้ำ — กด \"สร้างงานใหม่\" ถ้าต้องการเริ่มงานอื่น"
				})
			] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				onClick: onCreate,
				disabled: !ready || memberBlocked,
				"aria-live": "polite",
				className: "mt-3 h-11 w-full text-[14px] font-semibold",
				children: submitting ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
					className: "mr-2 h-4 w-4 animate-spin",
					"aria-hidden": true
				}), " กำลังสร้างงาน…"] }) : "สร้างงาน"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1.5 text-center text-[12px] text-muted-foreground",
				children: "ระบบจะตรวจข้อมูลก่อนบันทึกงาน"
			})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				onClick: onNext,
				disabled: !currentComplete || nextDisabled,
				className: "mt-3 h-11 w-full text-[14px] font-semibold",
				children: NEXT_LABELS[current] ?? "ต่อไป"
			})
		]
	});
}
var Switch = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch$1, {
	className: cn("peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input", className),
	...props,
	ref,
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SwitchThumb, { className: cn("pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0") })
}));
Switch.displayName = Switch$1.displayName;
var EMPTY_JOB_BOARD = {
	enabled: false,
	board_text: "",
	customer_gender: "unspecified",
	budget: null
};
var GENDERS = [
	"unspecified",
	"male",
	"female",
	"couple",
	"mixed"
];
function jobBoardMissing(d, world) {
	if (!d.enabled) return [];
	const m = [];
	if (!d.board_text.trim()) m.push("กรอกรายละเอียดประกาศหาคนรับงาน");
	if (world === "private" && !d.budget) m.push("เลือกว่าจะให้น้องๆและนายแบบเห็นค่าตอบแทนหรือไม่");
	return m;
}
/** Editor — lives in 04 · DETAILS. World is derived from the canonical lane. */
function JobBoardEditor({ value, onChange, world }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "job-board-heading",
		className: "rounded-md border border-border bg-surface-2 px-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex min-h-12 items-center justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
					id: "job-board-heading",
					className: "text-[13px] font-semibold text-foreground",
					children: ["ประกาศหาคนรับงาน · ", world === "private" ? "งานส่วนตัว" : "งานทั่วไป"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "truncate text-[12px] text-muted-foreground",
					children: "เปิดเมื่อต้องการประกาศหาคนรับงาน"
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "flex min-h-11 shrink-0 items-center gap-2 text-[13px] text-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
					checked: value.enabled,
					onCheckedChange: (v) => onChange({ enabled: v }),
					"aria-label": "ประกาศหาคนรับงาน"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "hidden sm:inline",
					children: "ประกาศหาคนรับงาน"
				})]
			})]
		}), value.enabled && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Accordion, {
			type: "single",
			collapsible: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AccordionItem, {
				value: "job-board-fields",
				className: "border-t border-border",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccordionTrigger, {
					className: "min-h-11 py-2 text-[13px] text-muted-foreground",
					children: "รายละเอียดประกาศ"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AccordionContent, {
					className: "space-y-3 pb-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-1.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									htmlFor: "board-text",
									className: "text-[13px] text-muted-foreground",
									children: "รายละเอียดลงกระดาน"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "text-[13px] tabular-nums text-muted-foreground",
									"aria-live": "polite",
									children: [
										value.board_text.length,
										" / ",
										1e3
									]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
								id: "board-text",
								rows: 3,
								maxLength: 1e3,
								value: value.board_text,
								onChange: (e) => onChange({ board_text: e.target.value.slice(0, 1e3) }),
								className: "border-border bg-surface",
								placeholder: "รายละเอียดงานที่น้องๆและนายแบบควรรู้"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[13px] text-muted-foreground",
								children: "น้องๆและนายแบบที่เข้าสู่ระบบแล้วจะเห็นข้อความนี้ · อย่าใส่ชื่อหรือข้อมูลส่วนตัวของลูกค้า"
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-3 sm:grid-cols-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-1.5",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									className: "text-[13px] text-muted-foreground",
									children: "เพศลูกค้า"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: value.customer_gender,
									onValueChange: (v) => onChange({ customer_gender: v }),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
										className: "h-11 border-border bg-surface",
										"aria-label": "เพศลูกค้า",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: GENDERS.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: g,
										children: CUSTOMER_GENDER_LABELS[g]
									}, g)) })]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[13px] text-muted-foreground",
									children: "เลือกจากข้อมูลที่ลูกค้าแจ้งไว้"
								})
							]
						}), world === "private" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								className: "text-[13px] text-muted-foreground",
								children: "การแสดงค่าตอบแทน"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								value: value.budget ?? "",
								onValueChange: (v) => onChange({ budget: v }),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
									className: "h-11 border-border bg-surface",
									"aria-label": "การแสดงค่าตอบแทน",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "เลือก" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: "hidden",
									children: "ไม่แสดงค่าตอบแทน"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: "show",
									children: "แสดงค่าตอบแทนที่ระบุ"
								})] })]
							})]
						})]
					})]
				})]
			})
		})]
	});
}
/** Compact review rows — shown in the Review rail when Job Board is ON. */
function JobBoardSummary({ value, world }) {
	if (!value.enabled) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "font-semibold text-foreground",
				children: ["เปิดประกาศหาคนรับงาน · ", world === "private" ? "งานส่วนตัว" : "งานทั่วไป"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-muted-foreground",
				children: [
					"ข้อความ ",
					value.board_text.length,
					" / ",
					BOARD_TEXT_MAX,
					world === "private" && ` · ลูกค้า ${CUSTOMER_GENDER_LABELS[value.customer_gender]}`,
					world === "private" && ` · ค่าตอบแทน: ${value.budget === "show" ? "แสดง" : value.budget === "hidden" ? "ไม่แสดง" : "ยังไม่เลือก"}`
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-muted-foreground",
				children: "น้องๆและนายแบบต้องเข้าสู่ระบบก่อนดูรายละเอียด"
			})
		]
	});
}
/** Explicit owner action. Never auto-fired by Create Job. */
function JobBoardPublish({ value, world, details, jobCreated, missing }) {
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [res, setRes] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [copied, setCopied] = (0, import_react.useState)(null);
	const inflight = (0, import_react.useRef)(false);
	if (!value.enabled) return null;
	const preview = writesBlockedInPreview();
	async function publish() {
		if (inflight.current || res) return;
		inflight.current = true;
		setBusy(true);
		setError(null);
		try {
			const r = await publishToJobBoard({
				board_text: value.board_text.trim(),
				world,
				...details.date ? { job_date: details.date } : {},
				...details.time ? { start_time: details.time } : {},
				...details.duration_minutes ? { duration: `${details.duration_minutes / 60} hr` } : {},
				...details.location ? { area: details.location } : {},
				...details.amount_thb ? { compensation: `฿${details.amount_thb.toLocaleString()}` } : {},
				customer_gender: value.customer_gender,
				budget_disclosure_approved: world === "private" ? value.budget === "show" : true,
				...details.operator_note ? { owner_note: details.operator_note } : {}
			});
			setRes(r);
		} catch (e) {
			setError(e instanceof PreviewWriteBlockedError ? "หน้าตัวอย่างยังไม่ประกาศงานจริง" : e instanceof Error ? e.message : "ลงกระดานไม่สำเร็จ");
		} finally {
			inflight.current = false;
			setBusy(false);
		}
	}
	async function copy() {
		if (!res?.broadcast_url) return;
		try {
			await navigator.clipboard.writeText(res.broadcast_url);
			setCopied("คัดลอกลิงก์แล้ว · น้องๆและนายแบบต้องเข้าสู่ระบบก่อน");
		} catch {
			setCopied("คัดลอกไม่สำเร็จ · ลองใหม่");
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-label": "ประกาศหาคนรับงาน",
		className: "space-y-2 rounded-lg border border-gold/30 bg-gold-muted/40 p-3 text-[13px]",
		children: [
			jobCreated && !res && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-semibold text-warn",
				children: "งานหลักสร้างแล้ว · ยังไม่ได้ลงกระดาน"
			}),
			!res && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
				onClick: publish,
				disabled: busy || preview || missing.length > 0,
				variant: "secondary",
				className: "h-11 w-full",
				children: [busy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
					className: "mr-2 h-4 w-4 animate-spin",
					"aria-hidden": true
				}), "ลงกระดานงาน"]
			}),
			preview && !res && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-muted-foreground",
				children: "หน้าตัวอย่างไม่ประกาศงานจริง"
			}),
			missing.length > 0 && !res && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-muted-foreground",
				children: missing[0]
			}),
			error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "flex items-start gap-1.5 text-destructive",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "mt-0.5 h-4 w-4 shrink-0",
					"aria-hidden": true
				}), error]
			}),
			res && res.broadcast_valid && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-semibold text-foreground",
							children: "ลงกระดานแล้ว"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "inline-flex items-center gap-1 rounded border border-verified/40 px-1.5 py-0.5 text-[12px] text-verified",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, {
								className: "h-3 w-3",
								"aria-hidden": true
							}), " น้องๆและนายแบบต้องเข้าสู่ระบบ"]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						onClick: copy,
						className: "h-11 w-full",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, {
							className: "mr-2 h-4 w-4",
							"aria-hidden": true
						}), " คัดลอกลิงก์ประกาศ"]
					}),
					copied && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-muted-foreground",
						"aria-live": "polite",
						children: copied
					})
				]
			}),
			res && !res.broadcast_valid && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "flex items-start gap-1.5 text-destructive",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "mt-0.5 h-4 w-4 shrink-0",
					"aria-hidden": true
				}), "ลิงก์ประกาศไม่ถูกต้อง จึงคัดลอกไม่ได้ กรุณาแจ้งทีมตรวจสอบ"]
			})
		]
	});
}
var EMPTY_DETAILS = {
	date: "",
	time: "",
	duration_minutes: null,
	amount_thb: null,
	travel_fee_thb: null,
	model_travel_fee_thb: null,
	model_base_payout_thb: null,
	location: "",
	google_map_url: "",
	meeting_point: "",
	meeting_choice: null,
	meeting_details: "",
	room_number: "",
	brief: "",
	operator_note: "",
	reference_code: ""
};
/** Fresh booking used by "สร้างงานใหม่": nothing from the prior job carries over. */
function freshBooking() {
	return {
		step: 1,
		client: null,
		work: null,
		model: null,
		details: { ...EMPTY_DETAILS },
		privateAccess: {
			...EMPTY_PRIVATE_ACCESS,
			service_options: []
		},
		jobBoard: { ...EMPTY_JOB_BOARD }
	};
}
/** Browser-only entered data. Never stores canonical identities or create authority. */
var LOCAL_BOOKING_KEY = "mmd.booking.local.v1";
var LOCAL_BOOKING_TTL = 864e5;
var MAX_BYTES = 32768;
var text = stringType().max(4e3);
var hint = stringType().max(200);
var amount = numberType().finite().nullable();
var partnerSchema = objectType({
	channel: enumType(["direct", "partner"]),
	name: hint,
	type: enumType([
		"bridge",
		"co_partner",
		"profit_share"
	]).nullable(),
	combined_rate_thb: amount,
	follower_tier: hint.nullable(),
	confirmed_percent: amount,
	share_percent: amount,
	revenue_thb: amount,
	agreed_costs_thb: amount,
	source_choice: enumType(["direct", "partner"]).nullable().optional()
});
var detailsSchema = objectType({
	date: hint,
	time: hint,
	duration_minutes: amount,
	amount_thb: amount,
	travel_fee_thb: amount,
	model_travel_fee_thb: amount,
	model_base_payout_thb: amount.optional(),
	location: text,
	google_map_url: text.optional(),
	meeting_point: text,
	meeting_choice: enumType(["lobby", "meet_client"]).nullable().optional(),
	meeting_details: text.optional(),
	room_number: hint.optional(),
	brief: text,
	operator_note: text,
	reference_code: hint,
	partner: partnerSchema.optional()
});
var option = enumType([
	"mk",
	"burn",
	"live",
	"group"
]);
var privateSchema = objectType({
	folder: enumType([
		"standard",
		"premium",
		"exclusive"
	]).nullable(),
	orientation: enumType(["straight", "gay"]).nullable(),
	job_type: enumType(["pn", "vip"]).nullable(),
	service_options: arrayType(option).max(4).optional(),
	service_rates: objectType({
		mk: objectType({
			client_amount_thb: amount,
			model_payout_thb: amount
		}).optional(),
		burn: objectType({
			client_amount_thb: amount,
			model_payout_thb: amount
		}).optional(),
		live: objectType({
			client_amount_thb: amount,
			model_payout_thb: amount
		}).optional(),
		group: objectType({
			client_amount_thb: amount,
			model_payout_thb: amount
		}).optional()
	}).optional(),
	settlement: enumType(["direct", "platform"]).nullable(),
	model_payout_thb: amount,
	discount: objectType({
		type: enumType(["amount", "percent"]),
		value: amount,
		mode: enumType(["customer_request", "promotion"]),
		reason: text.optional()
	}).optional()
});
var schema = objectType({
	v: literalType(1),
	savedAt: numberType().finite(),
	expiresAt: numberType().finite(),
	runtime: enumType(["preview", "live"]),
	step: numberType().int().min(1).max(7),
	clientHint: hint,
	modelHint: hint,
	workCode: enumType(["PUB", "PRV"]).nullable(),
	details: detailsSchema,
	privateAccess: privateSchema,
	jobBoard: objectType({
		enabled: booleanType(),
		board_text: text,
		customer_gender: enumType([
			"unspecified",
			"male",
			"female",
			"couple",
			"mixed"
		]),
		budget: enumType(["hidden", "show"]).nullable()
	})
});
function browserBookingStore() {
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		return null;
	}
}
function saveLocalBooking(store, state, runtime, now = Date.now()) {
	if (!store) return null;
	try {
		const draft = schema.parse({
			v: 1,
			savedAt: now,
			expiresAt: now + LOCAL_BOOKING_TTL,
			runtime,
			step: state.step,
			clientHint: state.clientHint.slice(0, 200),
			modelHint: state.modelHint.slice(0, 200),
			workCode: state.work?.code ?? null,
			details: state.details,
			privateAccess: state.privateAccess,
			jobBoard: state.jobBoard
		});
		const raw = JSON.stringify(draft);
		if (raw.length > MAX_BYTES) return null;
		store.setItem(LOCAL_BOOKING_KEY, raw);
		return draft;
	} catch {
		return null;
	}
}
function readLocalBooking(store, runtime, now = Date.now()) {
	if (!store) return null;
	try {
		const raw = store.getItem(LOCAL_BOOKING_KEY);
		if (!raw || raw.length > MAX_BYTES) return null;
		const parsed = schema.safeParse(JSON.parse(raw));
		if (!parsed.success) return null;
		const d = parsed.data;
		if (d.runtime !== runtime || d.savedAt > now || d.expiresAt <= now || d.expiresAt - d.savedAt !== 864e5) return null;
		return d;
	} catch {
		return null;
	}
}
function restoreLocalBooking(d) {
	const p = d.privateAccess;
	const privateAccess = {
		folder: p.folder,
		orientation: p.orientation,
		job_type: p.job_type,
		settlement: p.settlement,
		model_payout_thb: p.model_payout_thb,
		service_options: p.service_options ?? [],
		...p.discount ? { discount: {
			type: p.discount.type,
			value: p.discount.value,
			mode: p.discount.mode,
			...p.discount.reason !== void 0 ? { reason: p.discount.reason } : {}
		} } : {},
		...p.service_rates ? { service_rates: Object.fromEntries(Object.entries(p.service_rates).filter(([, v]) => v !== void 0)) } : {}
	};
	const { partner, ...fields } = d.details;
	const details = JSON.parse(JSON.stringify({
		...EMPTY_DETAILS,
		...fields,
		...partner ? { partner: {
			...partner,
			record_id: null,
			auto_from_model: false
		} } : {}
	}));
	return {
		step: d.step,
		client: null,
		model: null,
		work: d.workCode ? findWorkType(d.workCode) ?? null : null,
		details,
		privateAccess,
		jobBoard: d.jobBoard,
		clientHint: d.clientHint,
		modelHint: d.modelHint
	};
}
function clearLocalBookingOnCreated(store, lock) {
	if (!store || lock.kind !== "created") return false;
	try {
		store.removeItem(LOCAL_BOOKING_KEY);
		return true;
	} catch {
		return false;
	}
}
/**
* OWNER-only model payout adjustments for an EXISTING canonical Session.
*
* Backend authority (MMD-Prive/mmd-workers, same-origin):
*   GET  /v1/admin/model-payout/adjustments?session_id=...
*   POST /v1/admin/model-payout/adjustments
*
* The UI never derives payout truth: every figure below is a backend snapshot.
* Customer amount, deposit and payment verification are untouched by design.
*/
var PAYOUT_TYPE_LABELS = {
	travel: "ค่าเดินทาง",
	overtime: "งานเกินเวลา",
	parking_toll: "ค่าจอดรถ / ทางด่วน",
	waiting: "ค่ารอ",
	bonus: "โบนัส / เพิ่มพิเศษ",
	reimbursement: "คืนค่าใช้จ่าย",
	correction: "แก้ไขยอด",
	other: "อื่น ๆ"
};
var PAYOUT_TYPES = [
	"travel",
	"overtime",
	"parking_toll",
	"waiting",
	"bonus",
	"reimbursement",
	"correction",
	"other"
];
/** Backend error codes are surfaced verbatim as operator-safe Thai copy. */
var PAYOUT_ERROR_MESSAGES = {
	session_not_found: "ไม่พบงานนี้ในระบบหลังบ้าน — ตรวจ Session ID อีกครั้ง",
	canonical_model_link_required: "งานนี้ยังไม่ผูกกับ Model record จริง — ต้องแก้ที่ระบบหลังบ้านก่อน",
	model_payout_missing: "งานนี้ยังไม่มียอดจ่าย Model ตั้งต้นในระบบหลังบ้าน",
	resulting_payout_invalid: "ยอดหลังปรับไม่ถูกต้อง — ระบบหลังบ้านไม่รับรายการนี้",
	idempotency_key_conflict: "รายการนี้ถูกส่งไปแล้วด้วยคีย์เดียวกัน — โหลดงานใหม่เพื่อดูผลจริง"
};
var PayoutApiError = class extends Error {
	code;
	constructor(code, message) {
		super(message ?? PAYOUT_ERROR_MESSAGES[code] ?? code);
		this.name = "PayoutApiError";
		this.code = code;
	}
};
var BASE = "/v1/admin/model-payout/adjustments";
async function request(path, init = {}, signal) {
	const res = await fetch(path, {
		...init,
		signal: signal ?? null,
		credentials: "include",
		cache: "no-store",
		headers: {
			"content-type": "application/json",
			...init.headers ?? {}
		}
	});
	const text = await res.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = null;
	}
	const errObj = data?.["error"] ?? void 0;
	const code = typeof errObj === "string" && errObj || typeof errObj === "object" && typeof errObj?.["code"] === "string" && errObj["code"] || typeof data?.["code"] === "string" && data["code"] || "";
	if (!res.ok || data?.["ok"] === false) {
		if (code) throw new PayoutApiError(code);
		throw new Error(`${path} failed (${res.status})${text ? `: ${text.slice(0, 300)}` : ""}`);
	}
	return data;
}
var liveModelPayoutApi = {
	listAdjustments: (sessionId, signal) => request(`${BASE}?session_id=${encodeURIComponent(sessionId)}`, { method: "GET" }, signal),
	createAdjustment: (input) => request(BASE, {
		method: "POST",
		body: JSON.stringify(input)
	})
};
var DEMO_SESSIONS = { "SES-2026-0912": {
	session_id: "SES-2026-0912",
	model_name: "Ami",
	model_record_id: "recMD118Ami",
	current_payout_thb: 9e3
} };
var DEMO_LOG = {};
var DEMO_KEYS = /* @__PURE__ */ new Set();
var mockModelPayoutApi = {
	async listAdjustments(sessionId) {
		const session = DEMO_SESSIONS[sessionId];
		if (!session) throw new PayoutApiError("session_not_found");
		return {
			ok: true,
			session: { ...session },
			adjustments: [...DEMO_LOG[sessionId] ?? []],
			policy: {
				customer_amount_affected: false,
				payment_verification_affected: false
			}
		};
	},
	async createAdjustment(input) {
		const session = DEMO_SESSIONS[input.session_id];
		if (!session) throw new PayoutApiError("session_not_found");
		if (DEMO_KEYS.has(input.idempotency_key)) throw new PayoutApiError("idempotency_key_conflict");
		const signed = input.direction === "deduct" ? -input.amount_thb : input.amount_thb;
		const before = session.current_payout_thb;
		const after = before + signed;
		if (after < 0) throw new PayoutApiError("resulting_payout_invalid");
		DEMO_KEYS.add(input.idempotency_key);
		const entry = {
			adjustment_id: `demo-${DEMO_KEYS.size}`,
			session_id: input.session_id,
			model_name: session.model_name ?? null,
			direction: input.direction,
			adjustment_type: input.adjustment_type,
			amount_thb: input.amount_thb,
			signed_amount_thb: signed,
			payout_before_thb: before,
			payout_after_thb: after,
			note: input.note ?? null,
			created_by: "DEMO",
			created_at: (/* @__PURE__ */ new Date()).toISOString()
		};
		session.current_payout_thb = after;
		DEMO_LOG[input.session_id] = [...DEMO_LOG[input.session_id] ?? [], entry];
		return {
			ok: true,
			session: { ...session },
			adjustment: entry
		};
	}
};
/** Preview uses the labelled demo store; live origins hit the Worker. */
var modelPayoutApi = {
	listAdjustments: (id, signal) => (usingDemoData() ? mockModelPayoutApi : liveModelPayoutApi).listAdjustments(id, signal),
	createAdjustment: (input) => (usingDemoData() ? mockModelPayoutApi : liveModelPayoutApi).createAdjustment(input)
};
/**
* OWNER-only payout adjustment tool for an EXISTING canonical Session.
* Presentation + input formatting only — the Worker owns payout truth.
* This never touches customer amount, deposit or payment verification.
*/
var thb = (n) => `฿${Math.round(n).toLocaleString("en-US")}`;
function newKey() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function ModelPayoutAdjustments() {
	const [sessionInput, setSessionInput] = (0, import_react.useState)("");
	const [session, setSession] = (0, import_react.useState)(null);
	const [history, setHistory] = (0, import_react.useState)([]);
	const [loading, setLoading] = (0, import_react.useState)(false);
	const [submitting, setSubmitting] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [success, setSuccess] = (0, import_react.useState)(null);
	const [direction, setDirection] = (0, import_react.useState)("add");
	const [type, setType] = (0, import_react.useState)("travel");
	const [amount, setAmount] = (0, import_react.useState)("");
	const [note, setNote] = (0, import_react.useState)("");
	/** One stable key per intended submission; kept across retries. */
	const keyRef = (0, import_react.useRef)(newKey());
	const amountNum = Number(amount);
	const amountValid = Number.isFinite(amountNum) && amountNum > 0 && Number.isInteger(amountNum);
	const noteRequired = type === "other";
	const canSubmit = Boolean(session) && amountValid && (!noteRequired || note.trim().length > 0) && !submitting;
	const preview = (0, import_react.useMemo)(() => {
		if (!session || !amountValid) return null;
		const signed = direction === "deduct" ? -amountNum : amountNum;
		const after = session.current_payout_thb + signed;
		return {
			after,
			text: `ยอดเดิม ${thb(session.current_payout_thb)} ${direction === "deduct" ? "−" : "+"} ${PAYOUT_TYPE_LABELS[type]} ${thb(amountNum)} = ยอดจ่ายน้องๆและนายแบบ ${thb(after)}`,
			invalid: after < 0
		};
	}, [
		session,
		amountValid,
		amountNum,
		direction,
		type
	]);
	const load = (0, import_react.useCallback)(async (id) => {
		const sid = id.trim();
		if (!sid) return;
		setLoading(true);
		setError(null);
		setSuccess(null);
		try {
			const res = await modelPayoutApi.listAdjustments(sid);
			setSession(res.session);
			setHistory([...res.adjustments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
		} catch (e) {
			setSession(null);
			setHistory([]);
			setError(e instanceof PayoutApiError ? e.message : "เปิดข้อมูลงานไม่สำเร็จ กรุณาลองอีกครั้ง");
		} finally {
			setLoading(false);
		}
	}, []);
	async function submit() {
		if (!session || !canSubmit) return;
		setSubmitting(true);
		setError(null);
		setSuccess(null);
		try {
			const res = await modelPayoutApi.createAdjustment({
				session_id: session.session_id,
				direction,
				adjustment_type: type,
				amount_thb: amountNum,
				...note.trim() ? { note: note.trim() } : {},
				idempotency_key: keyRef.current
			});
			keyRef.current = newKey();
			setAmount("");
			setNote("");
			setSuccess(`บันทึกแล้ว · ยอดจ่ายน้องๆและนายแบบปัจจุบัน ${thb(res.session.current_payout_thb)}`);
			await load(session.session_id);
		} catch (e) {
			setError(e instanceof PayoutApiError ? e.message : "บันทึกไม่สำเร็จ — ไม่มีการเปลี่ยนแปลงยอด");
		} finally {
			setSubmitting(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
		className: "rounded-md border border-gold/30 bg-surface px-3",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Accordion, {
			type: "single",
			collapsible: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AccordionItem, {
				value: "payout-adjustment",
				className: "border-none",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccordionTrigger, {
					className: "min-h-12 py-2 hover:no-underline",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "flex min-w-0 items-center gap-2 text-left",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, {
							className: "h-4 w-4 shrink-0 text-gold",
							"aria-hidden": true
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "min-w-0",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block truncate text-[14px] font-semibold text-foreground",
								children: "ปรับยอดจ่ายน้องๆและนายแบบของงานที่สร้างแล้ว"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block truncate text-[12px] font-normal text-gold",
								children: "ค้นหางานที่สร้างแล้วเพื่อเพิ่มหรือหักยอดจ่ายน้องๆและนายแบบ"
							})]
						})]
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AccordionContent, {
					className: "pb-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								htmlFor: "payout-session",
								className: "text-[13px]",
								children: "รหัสงาน"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "payout-session",
								value: sessionInput,
								onChange: (e) => setSessionInput(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter") load(sessionInput);
								},
								placeholder: "SES-…",
								className: "mt-1 h-11"
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "secondary",
								className: "h-11 self-end",
								disabled: !sessionInput.trim() || loading,
								onClick: () => load(sessionInput),
								children: loading ? "กำลังโหลด…" : "ค้นหางาน"
							})]
						}),
						error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive",
							children: error
						}),
						success && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 rounded-md border border-verified/40 p-3 text-[13px] text-verified",
							children: success
						}),
						session && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 rounded-md border border-border bg-surface-2 p-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[13px] text-muted-foreground",
										children: "น้องๆและนายแบบ"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[15px] font-medium text-foreground",
										children: session.model_name ?? "— ไม่พบชื่อน้องๆและนายแบบ"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-2 text-[13px] text-muted-foreground",
										children: "ยอดจ่ายน้องๆและนายแบบปัจจุบัน"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[15px] font-semibold text-foreground",
										children: thb(session.current_payout_thb)
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 grid gap-2.5 sm:grid-cols-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "sm:col-span-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
											className: "text-[13px]",
											children: "ปรับยอดแบบไหน"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-1 grid grid-cols-2 gap-2",
											children: ["add", "deduct"].map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												type: "button",
												variant: direction === d ? "secondary" : "outline",
												className: "h-11",
												"aria-pressed": direction === d,
												onClick: () => setDirection(d),
												children: d === "add" ? "เพิ่ม" : "หัก"
											}, d))
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										className: "text-[13px]",
										children: "เหตุผล"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
										value: type,
										onValueChange: (v) => setType(v),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
											className: "mt-1 h-11",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: PAYOUT_TYPES.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: t,
											children: PAYOUT_TYPE_LABELS[t]
										}, t)) })]
									})] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										htmlFor: "payout-amount",
										className: "text-[13px]",
										children: "จำนวนเงิน (บาท)"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										id: "payout-amount",
										inputMode: "numeric",
										value: amount,
										onChange: (e) => setAmount(e.target.value.replace(/[^\d]/g, "")),
										placeholder: "ระบุจำนวนเงิน",
										className: "mt-1 h-11"
									})] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "sm:col-span-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Label, {
											htmlFor: "payout-note",
											className: "text-[13px]",
											children: ["โน้ตภายใน ", noteRequired && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-warn",
												children: "· จำเป็นเมื่อเลือก “อื่น ๆ”"
											})]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											id: "payout-note",
											value: note,
											onChange: (e) => setNote(e.target.value),
											placeholder: "เหตุผลสั้น ๆ สำหรับทีมภายใน",
											className: "mt-1 h-11"
										})]
									})
								]
							}),
							preview && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: `mt-3 text-[13px] ${preview.invalid ? "text-destructive" : "text-foreground"}`,
								children: [preview.text, preview.invalid && " — ยอดจ่ายหลังปรับต้องไม่ติดลบ"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								className: "mt-3 h-11 w-full sm:w-auto",
								disabled: !canSubmit,
								onClick: submit,
								children: submitting ? "กำลังบันทึก…" : "บันทึกการปรับยอด"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
									className: "text-[13px] font-semibold text-foreground",
									children: "ประวัติการปรับยอด (หากบันทึกผิด ให้เพิ่มรายการหักหรือเพิ่มเพื่อแก้ยอด)"
								}), history.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-2 text-[13px] text-muted-foreground",
									children: "ยังไม่มีรายการปรับยอดสำหรับงานนี้"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "mt-2 space-y-2",
									children: history.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
										className: "rounded-md border border-border bg-surface-2 p-3",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex flex-wrap items-baseline justify-between gap-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
													className: `text-[15px] font-semibold ${a.signed_amount_thb < 0 ? "text-warn" : "text-verified"}`,
													children: [a.signed_amount_thb < 0 ? "−" : "+", thb(Math.abs(a.signed_amount_thb))]
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "text-[13px] text-muted-foreground",
													children: PAYOUT_TYPE_LABELS[a.adjustment_type] ?? a.adjustment_type
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "mt-1 text-[13px] text-muted-foreground",
												children: [
													thb(a.payout_before_thb),
													" → ",
													thb(a.payout_after_thb)
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "text-[13px] text-muted-foreground",
												children: [new Date(a.created_at).toLocaleString("th-TH"), a.created_by ? ` · ${a.created_by}` : ""]
											}),
											a.note && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "mt-1 text-[13px] text-foreground",
												children: a.note
											})
										]
									}, a.adjustment_id))
								})]
							})
						] })
					]
				})]
			})
		})
	});
}
function sessionStore() {
	try {
		return typeof window === "undefined" ? null : window.sessionStorage;
	} catch {
		return null;
	}
}
function CreateSessionPage() {
	const [step, setStep] = (0, import_react.useState)(1);
	const [client, setClient] = (0, import_react.useState)(null);
	const [work, setWork] = (0, import_react.useState)(null);
	const [modelVerified, setModelVerified] = (0, import_react.useState)(false);
	const [model, setModel] = (0, import_react.useState)(null);
	const [details, setDetails] = (0, import_react.useState)(EMPTY_DETAILS);
	const [privateAccess, setPrivateAccess] = (0, import_react.useState)(EMPTY_PRIVATE_ACCESS);
	const [submitting, setSubmitting] = (0, import_react.useState)(false);
	const [result, setResult] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [grantError, setGrantError] = (0, import_react.useState)(null);
	const [memberRejectionKey, setMemberRejectionKey] = (0, import_react.useState)(null);
	const [approvedGrantKey, setApprovedGrantKey] = (0, import_react.useState)(null);
	const [ownerGrantBusy, setOwnerGrantBusy] = (0, import_react.useState)(false);
	const [ownerGrantError, setOwnerGrantError] = (0, import_react.useState)(null);
	const [jobBoard, setJobBoard] = (0, import_react.useState)(EMPTY_JOB_BOARD);
	const [clientHint, setClientHint] = (0, import_react.useState)("");
	const [modelHint, setModelHint] = (0, import_react.useState)("");
	const [savedLocal, setSavedLocal] = (0, import_react.useState)(null);
	const [localNotice, setLocalNotice] = (0, import_react.useState)("");
	const [restoredStage, setRestoredStage] = (0, import_react.useState)(null);
	const resumeStage = (0, import_react.useRef)(null);
	const guardRef = (0, import_react.useRef)(createMutationGuard());
	const [lock, setLock] = (0, import_react.useState)({ kind: "none" });
	(0, import_react.useEffect)(() => {
		setLock((l) => l.kind === "none" ? lockFromStorage(sessionStore()) : l);
		setSavedLocal(readLocalBooking(browserBookingStore(), usingDemoData() ? "preview" : "live"));
	}, []);
	const clientOk = Boolean(client && isCanonicalRecordId(client.client_id));
	const isPrivate = work?.lane === "private";
	const modelOk = Boolean(model && modelSelectable(model) && (!isPrivate || modelVerified && privateModelReady(model, privateAccess.job_type)));
	const searchScope = modelSearchScope(isPrivate, privateAccess);
	const world = isPrivate ? "private" : "public";
	const boardMissing = jobBoardMissing(jobBoard, world);
	const activePartnersQ = useActivePartners();
	const activePartners = activePartnersQ.data?.available ? activePartnersQ.data.items : null;
	const modelLink = model ? modelPartnerLink(model, activePartners) : null;
	const linkConflict = modelLink ? partnerConflict(modelLink, details.partner ?? EMPTY_PARTNER, activePartners !== null) : null;
	const sourceOk = sourceChoiceReady(details.partner) && partnerMissing(details.partner).length === 0 && !linkConflict;
	const customerPricing = servicePricing(details.amount_thb, isPrivate ? privateAccess : void 0);
	const customerReady = Boolean(work && details.date && details.time && details.duration_minutes && details.duration_minutes > 0 && Number.isFinite(details.amount_thb) && details.amount_thb > 0 && customerPricing.clientGross !== null && Number.isFinite(details.travel_fee_thb ?? 0) && (details.travel_fee_thb ?? 0) >= 0);
	const placeReady = Boolean(details.location.trim() && isValidMapUrl(details.google_map_url));
	const privateMissing = (0, import_react.useMemo)(() => {
		if (!isPrivate) return [];
		const m = [];
		if (!privateAccess.folder) m.push("เลือกกลุ่มน้องๆและนายแบบสำหรับงานส่วนตัว");
		if (!privateAccess.orientation) m.push("เลือกรูปแบบที่ลูกค้าต้องการ");
		if (!privateAccess.job_type) m.push("เลือกประเภทงานส่วนตัว");
		if (!privateAccess.settlement) m.push("เลือกวิธีจ่ายน้องๆและนายแบบ");
		if (privateAccess.settlement === "direct" && !isPartnerManaged(details.partner) && (!privateAccess.model_payout_thb || privateAccess.model_payout_thb <= 0)) m.push("ระบุยอดจ่ายน้องๆและนายแบบ");
		return m;
	}, [
		isPrivate,
		privateAccess,
		details.partner
	]);
	const pricingMissing = [...servicePricing(details.amount_thb, isPrivate ? privateAccess : void 0, { partnerManaged: isPartnerManaged(details.partner) }).missing, ...partnerMissing(details.partner)];
	const completed = [
		...clientOk ? [1] : [],
		...customerReady ? [2] : [],
		...placeReady ? [3] : [],
		...modelOk && sourceOk ? [4] : [],
		...modelOk && sourceOk && privateMissing.length === 0 && pricingMissing.length === 0 ? [5] : []
	];
	const missing = (0, import_react.useMemo)(() => {
		const m = [];
		if (!client) m.push("เลือกลูกค้า");
		if (client && !isCanonicalRecordId(client.client_id)) m.push("ข้อมูลลูกค้ายังไม่พร้อม กรุณาตรวจสอบลูกค้า");
		if (!work) m.push("เลือกประเภทงาน");
		if (!model) m.push("เลือกน้องๆและนายแบบ");
		if (model && !isCanonicalRecordId(model.model_id)) m.push("ข้อมูลน้องๆและนายแบบยังไม่พร้อม กรุณาตรวจสอบน้องๆและนายแบบ");
		if (model && isCanonicalRecordId(model.model_id) && !modelSelectable(model)) m.push("น้องคนนี้ยังรับงานไม่ได้ กรุณาเลือกคนอื่น");
		if (model && isPrivate && !modelOk) m.push("ตรวจ PN/VIP ของผู้รับงานให้ผ่านก่อนกรอกเรท");
		if (model && !sourceOk) m.push("เลือกว่ารับงานโดยตรงหรือผ่านพาร์ตเนอร์");
		if (!details.date || !details.time) m.push("ระบุวันและเวลาเริ่มงาน");
		if (!details.duration_minutes) m.push("เลือกระยะเวลา");
		if (!details.location) m.push("ระบุสถานที่");
		if (!isValidMapUrl(details.google_map_url)) m.push("ลิงก์แผนที่ต้องขึ้นต้นด้วย https://");
		if (!details.amount_thb || details.amount_thb <= 0) m.push("ระบุยอดบริการ");
		if (work && work.lane !== "private" && !isPartnerManaged(details.partner) && (!details.model_base_payout_thb || details.model_base_payout_thb <= 0)) m.push("ระบุเรทถึงน้องๆและนายแบบ");
		return [
			...m,
			...privateMissing,
			...pricingMissing
		];
	}, [
		client,
		work,
		model,
		modelOk,
		isPrivate,
		sourceOk,
		details,
		privateMissing,
		pricingMissing
	]);
	const grantJobKey = (0, import_react.useMemo)(() => {
		if (!client || !work || !model || missing.length) return null;
		try {
			return JSON.stringify(buildJobBody({
				client,
				work,
				model,
				details,
				...payload()
			}));
		} catch {
			return null;
		}
	}, [
		client,
		work,
		model,
		details,
		privateAccess,
		isPrivate,
		missing
	]);
	const memberBlocked = Boolean(isPrivate && grantJobKey && memberRejectionKey === grantJobKey);
	const memberGrantPending = Boolean(grantJobKey && approvedGrantKey === grantJobKey);
	const maxUnlocked = !clientOk ? 1 : !customerReady ? 2 : !placeReady ? 3 : !modelOk || !sourceOk ? 4 : missing.length ? 5 : 7;
	const current = restoredStage ?? Math.min(step, maxUnlocked);
	const formTopRef = (0, import_react.useRef)(null);
	const prevStep = (0, import_react.useRef)(current);
	(0, import_react.useEffect)(() => {
		if (prevStep.current === current) return;
		prevStep.current = current;
		const el = formTopRef.current;
		if (!el) return;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const y = el.getBoundingClientRect().top + window.scrollY - 120;
		window.scrollTo({
			top: Math.max(0, y),
			behavior: reduce ? "auto" : "smooth"
		});
	}, [current]);
	const currentInstruction = [
		"ขั้นตอน 1: เลือกลูกค้าและตรวจรูปภาพ",
		"ขั้นตอน 2: รูปแบบงาน เวลา Option และค่าเดินทางลูกค้า",
		"ขั้นตอน 3: สถานที่และบรีฟภายในสำหรับ MMD",
		"ขั้นตอน 4: เลือกน้องๆและนายแบบ ตรวจ PN/VIP และช่องทางรับงาน",
		"ขั้นตอน 5: เรทและหมายเหตุถึงน้องๆและนายแบบ",
		"ขั้นตอน 6: ตรวจสรุปและย้อนแก้ข้อมูลแต่ละส่วน",
		"ขั้นตอน 7: ยืนยันสร้างงานหนึ่งครั้ง"
	][current - 1];
	function selectClient(c) {
		if (client && c.client_id !== client.client_id) {
			setWork(null);
			setModel(null);
			setDetails(EMPTY_DETAILS);
			setPrivateAccess(EMPTY_PRIVATE_ACCESS);
			setJobBoard(EMPTY_JOB_BOARD);
			setResult(null);
			setGrantError(null);
		}
		setClient(c);
		setClientHint(c.per_rename || c.remembered_name || c.client_name || "");
		setStep(resumeStage.current ?? 1);
		resumeStage.current = null;
		setRestoredStage(null);
	}
	function clearClient() {
		setClient(null);
		setWork(null);
		setModel(null);
		setDetails(EMPTY_DETAILS);
		setPrivateAccess(EMPTY_PRIVATE_ACCESS);
		setJobBoard(EMPTY_JOB_BOARD);
		setResult(null);
		setGrantError(null);
		setStep(1);
	}
	function changePrivateAccess(patch) {
		const next = updatePrivateModelSelection({
			access: privateAccess,
			model,
			step
		}, patch);
		setPrivateAccess(next.access);
		setModel(next.model);
		setStep(next.step);
	}
	function selectWork(w) {
		if (work?.code === w.code) return;
		setModelVerified(false);
		if (work && w.code !== work.code) setModel(null);
		setPrivateAccess(EMPTY_PRIVATE_ACCESS);
		setJobBoard((b) => ({
			...b,
			budget: null
		}));
		setWork(w);
	}
	function payload() {
		return isPrivate ? { privateAccess } : {};
	}
	function handleFailure(e, fallback) {
		if (e instanceof JobGrantError) {
			setGrantError(e.detail);
			return;
		}
		const workRejection = privateWorkRejection(e);
		if (workRejection) {
			setError(workRejection);
			setModel(null);
			setModelVerified(false);
			setStep(4);
			return;
		}
		setError(e instanceof Error ? e.message : fallback);
	}
	async function createSession() {
		if (!client || !work || !model) return;
		if (missing.length) return;
		if (lock.kind !== "none" || guardRef.current.busy || ownerGrantBusy || memberBlocked) return;
		const snapshot = {
			client,
			work,
			model,
			details,
			...payload()
		};
		const snapshotKey = JSON.stringify(buildJobBody(snapshot));
		setSubmitting(true);
		setMemberRejectionKey(null);
		setError(null);
		setGrantError(null);
		setResult(null);
		const outcome = await runGuardedCreate({
			guard: guardRef.current,
			lock,
			storage: sessionStore(),
			persistMarker: !usingDemoData(),
			send: () => api.createSession(snapshot)
		});
		setSubmitting(false);
		if (outcome.kind === "busy" || outcome.kind === "locked") return;
		setLock(outcome.lock);
		setResult(outcome.res);
		if (outcome.kind === "created") {
			clearLocalBookingOnCreated(browserBookingStore(), outcome.lock);
			setSavedLocal(null);
			setLocalNotice("");
			setRestoredStage(null);
		}
		if (outcome.kind === "rejected" && outcome.error) if (isPrivate && isMissingMemberCreateError(outcome.error) && approvedGrantKey !== snapshotKey) {
			setMemberRejectionKey(snapshotKey);
			setError(null);
		} else handleFailure(outcome.error, "สร้างงานไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองอีกครั้ง");
		else if (outcome.kind === "uncertain") setError("ยังยืนยันผลการสร้างงานไม่ได้ กรุณาตรวจงานทั้งหมดและให้ทีมหลังบ้านยืนยันผลคำขอเดิมก่อนสร้างซ้ำ");
	}
	async function ownerGrant() {
		if (!memberBlocked || !grantJobKey || !client || !work || !model || missing.length || ownerGrantBusy || submitting || lock.kind !== "none" || usingDemoData()) return;
		setOwnerGrantBusy(true);
		setOwnerGrantError(null);
		try {
			if ((await api.ownerGrant({
				client,
				work,
				model,
				details,
				...payload()
			})).grant_status !== "pending") throw new Error("ระบบยังไม่ยืนยันสิทธิ์เฉพาะงาน");
			setApprovedGrantKey(grantJobKey);
			setMemberRejectionKey(null);
			setError(null);
		} catch (e) {
			setOwnerGrantError(e instanceof Error ? e.message : "อนุมัติสิทธิ์เฉพาะงานไม่สำเร็จ");
		} finally {
			setOwnerGrantBusy(false);
		}
	}
	function resetCreated() {
		if (lock.kind !== "created") return;
		clearPending(sessionStore());
		setLock({ kind: "none" });
		const f = freshBooking();
		setClient(f.client);
		setWork(f.work);
		setModel(f.model);
		setDetails(f.details);
		setPrivateAccess(f.privateAccess);
		setJobBoard(f.jobBoard);
		setResult(null);
		setError(null);
		setGrantError(null);
		setMemberRejectionKey(null);
		setApprovedGrantKey(null);
		setOwnerGrantError(null);
		setStep(f.step);
		setModelVerified(false);
		setClientHint("");
		setModelHint("");
		setRestoredStage(null);
		resumeStage.current = null;
	}
	function saveBrowserDraft() {
		if (lock.kind === "created" || submitting) return;
		const saved = saveLocalBooking(browserBookingStore(), {
			step: current,
			client,
			work,
			model,
			details,
			privateAccess,
			jobBoard,
			clientHint,
			modelHint: modelHint || model?.model_name || model?.display_name || ""
		}, usingDemoData() ? "preview" : "live");
		setSavedLocal(saved);
		setLocalNotice(saved ? "บันทึกร่างบนเบราว์เซอร์นี้แล้ว · เก็บไว้ 24 ชั่วโมง ไม่ได้สร้างงานหรือรายการชำระเงิน" : "บันทึกบนเบราว์เซอร์นี้ไม่ได้ ข้อมูลที่กรอกยังอยู่ในหน้านี้");
	}
	function reopenBrowserDraft() {
		if (!savedLocal || lock.kind === "created" || submitting) return;
		const latest = readLocalBooking(browserBookingStore(), usingDemoData() ? "preview" : "live");
		if (!latest) {
			setSavedLocal(null);
			setLocalNotice("ร่างหมดอายุหรือเปิดไม่ได้ ข้อมูลที่กรอกยังอยู่ในหน้านี้");
			return;
		}
		if (draftDirty && !window.confirm("เปิดร่างที่บันทึกไว้แทนข้อมูลที่กำลังกรอก?")) return;
		const f = restoreLocalBooking(latest);
		setClient(null);
		setModel(null);
		setModelVerified(false);
		setWork(f.work);
		setDetails(f.details);
		setPrivateAccess(f.privateAccess);
		setJobBoard(f.jobBoard);
		setClientHint(f.clientHint);
		setModelHint(f.modelHint);
		setStep(f.step);
		setRestoredStage(f.step);
		resumeStage.current = f.step;
		setLocalNotice("เปิดร่างแล้ว · ต้องค้นหาและเลือกลูกค้ากับน้องใหม่ก่อนสร้างงาน");
	}
	const createLocked = lock.kind !== "none";
	const boardNode = jobBoard.enabled ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3 space-y-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(JobBoardSummary, {
			value: jobBoard,
			world
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(JobBoardPublish, {
			value: jobBoard,
			world,
			details,
			jobCreated: lock.kind === "created",
			missing: boardMissing
		})]
	}) : null;
	const draftDirty = Boolean(client || work || model || result || jobBoard.enabled || clientHint || modelHint) || JSON.stringify(details) !== JSON.stringify(EMPTY_DETAILS) || JSON.stringify(privateAccess) !== JSON.stringify(EMPTY_PRIVATE_ACCESS);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ConsoleShell, {
		module: "สร้างงาน",
		path: "/internal/admin/jobs/create-job",
		appearance: "console",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "border-b border-border bg-background",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto max-w-[1280px] px-3 py-2.5 sm:px-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
								to: "/internal/admin/control-room",
								"aria-label": "กลับหน้าแรก",
								className: "inline-flex h-11 shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, {
									className: "h-4 w-4 shrink-0",
									"aria-hidden": true
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "hidden sm:inline",
									children: "หน้าแรก"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
									className: "truncate text-lg font-semibold text-foreground sm:text-xl",
									children: "สร้างงาน"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "truncate text-[12px] text-muted-foreground sm:text-[13px]",
									children: currentInstruction
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: "/internal/admin/jobs/all",
								className: "hidden h-9 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground sm:inline-flex",
								children: "งานล่าสุด"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-gold/30 bg-gold-muted px-2 text-[12px] text-gold sm:px-2.5",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, {
										className: "h-4 w-4",
										"aria-hidden": true
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "hidden sm:inline",
										children: "ตรวจสอบข้อมูลก่อนสร้างงาน"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "sm:hidden",
										children: "ตรวจข้อมูล"
									})
								]
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModeSwitch, {
							active: "job",
							dirty: draftDirty
						})
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "sticky top-[105px] z-20 border-b border-border bg-background/95 px-3 py-2 backdrop-blur lg:hidden",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mx-auto max-w-[1280px]",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StepRail, {
						current,
						maxUnlocked,
						completed,
						onSelect: setStep
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "mx-auto grid max-w-[1280px] gap-3 px-3 py-3 sm:px-4 lg:grid-cols-[160px_minmax(0,1fr)] lg:gap-4 lg:py-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
					className: "hidden lg:block",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "sticky top-28 rounded-md border border-border bg-surface p-1.5",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StepRail, {
							current,
							maxUnlocked,
							completed,
							onSelect: setStep,
							orientation: "vertical"
						})
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "w-full max-w-4xl min-w-0 space-y-3 pb-24 lg:pb-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
							"aria-label": "ร่างบนเบราว์เซอร์นี้",
							className: "space-y-2 rounded-md border border-border bg-surface p-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex flex-wrap gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "outline",
										onClick: saveBrowserDraft,
										disabled: submitting || lock.kind === "created",
										children: "บันทึกร่างบนเบราว์เซอร์นี้"
									}), savedLocal && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "ghost",
										onClick: reopenBrowserDraft,
										disabled: submitting || lock.kind === "created",
										children: "เปิดร่างบนเบราว์เซอร์นี้"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[13px] text-muted-foreground",
									children: "ร่างเก็บบนเบราว์เซอร์นี้ 24 ชั่วโมง อาจมีบรีฟและค่าจ้าง ใช้เฉพาะเบราว์เซอร์ส่วนตัว"
								}),
								localNotice && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									role: "status",
									className: "text-[13px] text-foreground",
									children: localNotice
								}),
								restoredStage !== null && !client && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									variant: "outline",
									onClick: () => {
										setRestoredStage(null);
										setStep(1);
									},
									children: ["ยืนยันลูกค้าใหม่", clientHint ? ` · ${clientHint}` : ""]
								}),
								restoredStage === 4 && !client && modelHint && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-[13px] text-muted-foreground",
									children: ["ชื่อที่พิมพ์ไว้ · ", modelHint]
								})
							]
						}),
						lock.kind === "uncertain" && current < 6 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UncertainPanel, { lock }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							ref: formTopRef,
							className: "scroll-mt-32 rounded-md border border-border bg-surface p-3 sm:p-4",
							children: [
								current === 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StepClient, {
									selected: client,
									onSelect: selectClient,
									onClear: clearClient,
									onContinue: () => {
										setRestoredStage(null);
										setStep(2);
									},
									searchHint: clientHint,
									onSearchHintChange: setClientHint
								}),
								current === 2 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StepWork, {
									...client ? { clientId: client.client_id } : {},
									value: work,
									onSelect: selectWork,
									details,
									onDetailsChange: (patch) => setDetails((d) => ({
										...d,
										...patch
									})),
									privateAccess,
									onPrivateChange: changePrivateAccess
								}),
								current === 3 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StepPlace, {
									value: details,
									onChange: (patch) => setDetails((d) => ({
										...d,
										...patch
									}))
								}),
								error && current < 6 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									role: "alert",
									className: "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive",
									children: error
								}),
								current === 4 && client && work && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [isPrivate && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PrivateModelScope, {
									value: privateAccess,
									onChange: changePrivateAccess
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StepModel, {
									clientId: client.client_id,
									memberId: client.member_id ?? null,
									workTypeCode: work.code,
									bookingVisibility: searchScope?.bookingVisibility ?? null,
									customerLane: searchScope?.customerLane ?? null,
									selectedAccessFolder: searchScope?.selectedAccessFolder ?? null,
									privateWork: searchScope?.privateWork ?? null,
									serviceOptions: searchScope?.serviceOptions ?? [],
									scopeIncomplete: isPrivate && !searchScope,
									value: model,
									searchHint: modelHint,
									onSearchHintChange: setModelHint,
									partner: details.partner,
									onPartnerChange: (p) => setDetails((d) => ({
										...d,
										partner: p
									})),
									onContinue: () => setStep(5),
									onVerificationChange: setModelVerified,
									onSelect: (m) => {
										if (m.model_id !== model?.model_id) {
											setModelVerified(false);
											setError(null);
											setDetails((d) => ({
												...d,
												partner: partnerOnModelChange(d.partner)
											}));
										}
										setModel(m);
									}
								})] }),
								current === 5 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StepDetails, {
									value: details,
									onEditPlace: () => setStep(3),
									onChange: (p) => setDetails((d) => ({
										...d,
										...p
									})),
									isPrivate,
									privateAccess,
									onPrivateChange: changePrivateAccess
								}),
								current === 5 && missing.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									role: "status",
									className: "rounded-md border border-border p-3 text-[13px]",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "font-semibold",
										children: "ยังต้องเติมก่อนตรวจสรุป"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
										className: "mt-2 list-disc pl-5",
										children: missing.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: item }, item))
									})]
								}),
								current === 5 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mt-3",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(JobBoardEditor, {
										value: jobBoard,
										world,
										onChange: (p) => setJobBoard((b) => ({
											...b,
											...p
										}))
									})
								}),
								current >= 6 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
									"aria-label": "ตรวจรายละเอียดงาน",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRail, {
										current,
										onEdit: setStep,
										client,
										work,
										model,
										details,
										privateAccess: isPrivate ? privateAccess : void 0,
										missing,
										submitting,
										memberBlocked,
										memberGrantPending,
										ownerGrantBusy,
										ownerGrantError,
										onOwnerGrant: ownerGrant,
										result,
										error,
										grantError,
										onCreate: createSession,
										onReset: resetCreated,
										createLock: lock,
										onNext: () => setStep(Math.min(current + 1, maxUnlocked)),
										nextDisabled: current + 1 > maxUnlocked,
										jobBoard: boardNode
									})
								}) })
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelPayoutAdjustments, {}),
						current > 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "outline",
									onClick: () => setStep(current - 1),
									className: "h-11",
									children: "ย้อนกลับ"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "ghost",
									onClick: saveBrowserDraft,
									disabled: submitting || lock.kind === "created",
									className: "h-11 justify-self-start",
									children: "บันทึกร่างบนเบราว์เซอร์นี้"
								}),
								current < 6 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									variant: "secondary",
									onClick: () => setStep(Math.min(current + 1, maxUnlocked)),
									disabled: current + 1 > maxUnlocked,
									className: "h-11",
									children: ["ถัดไป ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, {
										className: "ml-1 h-4 w-4",
										"aria-hidden": true
									})]
								})
							]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "fixed inset-x-0 bottom-[57px] z-20 border-t border-border bg-background/95 px-3 py-2 backdrop-blur lg:hidden",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "truncate text-[13px] font-medium text-foreground",
							children: [
								STEPS[current - 1]?.code,
								" · ",
								STEPS[current - 1]?.shortLabel
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "truncate text-[13px] text-muted-foreground",
							children: currentInstruction
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						onClick: current === 7 ? createSession : () => setStep(Math.min(current + 1, maxUnlocked)),
						disabled: current === 7 ? missing.length > 0 || submitting || createLocked : current + 1 > maxUnlocked,
						className: "h-11 px-4",
						children: current === 7 ? submitting ? "กำลังสร้างงาน…" : lock.kind === "created" ? "สร้างงานแล้ว" : lock.kind === "uncertain" ? "ตรวจผลคำขอเดิมก่อน" : "สร้างงาน" : [
							"",
							"ต่อไป: เลือกงาน",
							"ต่อไป: สถานที่",
							"ต่อไป: เลือกน้องๆและนายแบบ",
							"ต่อไป: กรอกเรท",
							"ต่อไป: ตรวจสรุป",
							"ต่อไป: สร้างงาน"
						][current]
					})]
				})
			})
		]
	});
}
function CreateJobRoute() {
	const { mode, view } = Route.useSearch();
	if (mode === "broadcast") return view === "list" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BroadcastListPage, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BroadcastWorkPage, {});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreateSessionPage, {});
}
//#endregion
export { CreateJobRoute as component };
