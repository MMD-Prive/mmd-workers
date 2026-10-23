import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { o as cn, r as SigilLogo, s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link, p as useRouterState, w as useHydrated } from "../_libs/@tanstack/react-router+[...].mjs";
import { r as redirectToCanonicalLogin, t as fetchAuthMe } from "./auth-D66UAcCi.mjs";
import { A as HandHeart, D as Info, F as Ellipsis, J as Camera, U as CircleAlert, X as BrainCircuit, Y as CalendarCheck, Z as Bot, f as ShieldAlert, nt as ArrowLeft, o as Sun, p as Search, r as Users, t as X, v as MessageSquare, x as Lock } from "../_libs/lucide-react.mjs";
import { t as Button } from "./button-C7XS-FYH.mjs";
import { t as Input } from "./input-Dk5AGV7h.mjs";
import { d as DialogContent, f as DialogDescription, g as DialogTrigger, h as DialogTitle, l as Dialog, m as DialogPortal, p as DialogOverlay, u as DialogClose } from "../_libs/@radix-ui/react-alert-dialog+[...].mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
import { i as lookupClients, n as fetchRecentClients, r as isSelectableClient, t as displayName } from "./clients-D1ivRQGK.mjs";
import { t as Skeleton } from "./skeleton-McP_xT7w.mjs";
import { n as TABS, t as Route } from "./internal.console.clients._clientId-DK3tLUor.mjs";
import { i as TabsTrigger$1, n as TabsContent$1, r as TabsList$1, t as Tabs$1 } from "../_libs/radix-ui__react-tabs.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.console.clients._clientId-C77rXVft.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var Sheet = Dialog;
var SheetTrigger = DialogTrigger;
var SheetPortal = DialogPortal;
var SheetOverlay = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay, {
	className: cn("fixed inset-0 z-50 bg-overlay/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className),
	...props,
	ref
}));
SheetOverlay.displayName = DialogOverlay.displayName;
var sheetVariants = cva("fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out", {
	variants: { side: {
		top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
		bottom: "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
		left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
		right: "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm"
	} },
	defaultVariants: { side: "right" }
});
var SheetContent = import_react.forwardRef(({ side = "right", className, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SheetPortal, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SheetOverlay, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
	ref,
	className: cn(sheetVariants({ side }), className),
	...props,
	children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogClose, {
		className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "sr-only",
			children: "Close"
		})]
	}), children]
})] }));
SheetContent.displayName = DialogContent.displayName;
var SheetHeader = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col space-y-2 text-center sm:text-left", className),
	...props
});
SheetHeader.displayName = "SheetHeader";
var SheetFooter = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className),
	...props
});
SheetFooter.displayName = "SheetFooter";
var SheetTitle = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, {
	ref,
	className: cn("text-lg font-semibold text-foreground", className),
	...props
}));
SheetTitle.displayName = DialogTitle.displayName;
var SheetDescription = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription, {
	ref,
	className: cn("text-sm text-muted-foreground", className),
	...props
}));
SheetDescription.displayName = DialogDescription.displayName;
var delay = (v, ms = 260) => new Promise((r) => setTimeout(() => r(v), ms));
var DEMO_BANNER = "ข้อมูลตัวอย่างสำหรับพรีวิว UI — ไม่ใช่ข้อมูลจริง";
var winnie = {
	id: "demo-winnie",
	perName: "คุณวินนี่",
	note: "ชื่อที่เปอร์เรียก",
	matchSource: "per_rename",
	matchConfidence: .94,
	membershipTier: "Premium",
	membershipState: "pending",
	lastActivity: "7 ก.ย. 69",
	headline: "ต่ออายุ Premium 2,500 บาท — ได้รับหลักฐานแล้ว รอการยืนยันอย่างเป็นทางการ",
	identity: {
		emails: ["(ภายในเท่านั้น) w•••@•••.com"],
		phones: ["(ภายในเท่านั้น) 08x-xxx-4471"],
		lineUserId: "U••••••••••••3f2",
		telegramUsername: "รอ resolver",
		memberId: "MMD-•••-0219",
		identitySource: "Airtable canonical (demo)",
		verification: "pending"
	},
	renewals: [
		{
			date: "9 มี.ค. 65",
			package: "Premium",
			amount: "—",
			state: "verified"
		},
		{
			date: "21 ต.ค. 66",
			package: "Premium",
			amount: "—",
			state: "verified"
		},
		{
			date: "21 ต.ค. 67",
			package: "Premium",
			amount: "—",
			state: "verified"
		},
		{
			date: "13 ก.ค. 68",
			package: "Premium",
			amount: "—",
			state: "verified"
		},
		{
			date: "7 ก.ย. 69",
			package: "Premium (ตั้งใจต่ออายุ)",
			amount: "2,500 บาท",
			state: "pending"
		}
	],
	work: [
		{
			ref: "JOB-•••-0142",
			date: "12 ก.ค. 68",
			lane: "Privé Session",
			model: "Model A",
			rateSnapshot: "บันทึกไว้ตามงานเดิม",
			state: "verified"
		},
		{
			ref: "JOB-•••-0098",
			date: "3 พ.ย. 67",
			lane: "Privé Session",
			model: "Model C",
			rateSnapshot: "บันทึกไว้ตามงานเดิม",
			state: "verified"
		},
		{
			ref: "JOB-•••-0031",
			date: "18 มี.ค. 65",
			lane: "Privé Session",
			model: "ไม่ระบุในระบบเดิม",
			rateSnapshot: "ไม่พบ snapshot",
			state: "needs_review"
		}
	],
	conversation: [
		{
			at: "7 ก.ย. 69 · 10:12",
			from: "client",
			text: "โอนแล้วนะครับ ต่ออายุ Premium"
		},
		{
			at: "7 ก.ย. 69 · 10:12",
			from: "client",
			text: "[แนบสลิป] 2,500 บาท"
		},
		{
			at: "7 ก.ย. 69 · 10:20",
			from: "ofc",
			text: "รับเรื่องแล้วครับ กำลังตรวจสอบยอด"
		}
	],
	access: [{
		channel: "telegram",
		result: "pending",
		note: "ต้อง reconcile หลังยืนยันยอด — ยังไม่ได้ให้สิทธิ์"
	}, {
		channel: "drive",
		result: "pending",
		note: "resolver ยังไม่ได้ยืนยันสถานะปัจจุบัน"
	}],
	intendedAction: {
		title: "ต่ออายุ Premium",
		amount: "2,500 บาท",
		evidence: [
			{
				label: "หลักฐานการโอน",
				value: "ได้รับแล้ว (สลิปจาก LINE OFC)",
				state: "pending"
			},
			{
				label: "การยืนยันยอด",
				value: "ยังไม่ยืนยันอย่างเป็นทางการ",
				state: "pending"
			},
			{
				label: "Membership",
				value: "resolver จะตัดสินหลังยืนยัน",
				state: "unavailable"
			}
		],
		requiresOfficialVerification: true
	},
	historicalGaps: ["ช่วง 65–66 ไม่มี snapshot ราคาในระบบเดิม (ต้องตรวจ)"]
};
var others = [{
	id: "demo-nui",
	perName: "หนุ่ย",
	matchSource: "line_ofc",
	matchConfidence: .71,
	ambiguous: true,
	membershipState: "needs_review",
	lastActivity: "2 ก.ย. 69",
	headline: "พบชื่อใกล้เคียง 2 รายการ — ต้องตรวจ identity ก่อน"
}, {
	id: "demo-kim",
	perName: "คุณคิม",
	canonicalName: "(canonical จาก Airtable)",
	matchSource: "airtable_canonical",
	matchConfidence: .97,
	membershipTier: "Signature",
	membershipState: "verified",
	lastActivity: "29 ส.ค. 69",
	headline: "งานล่าสุดปิดเรียบร้อย"
}];
var summaryOf = (c) => {
	const { renewals, work, conversation, access, ...rest } = c;
	return rest;
};
var advisoryByRoom = {
	ceo: {
		mode: "ready_for_per",
		summary: "มี 1 เคสรอการยืนยันยอด และ 1 เคสที่ identity ยังไม่ชัด",
		missing: ["ผลยืนยันยอดอย่างเป็นทางการของคุณวินนี่", "การแยกตัวตนของ “หนุ่ย”"],
		nextAction: "เปิดเคสคุณวินนี่แล้วตรวจหลักฐาน",
		reason: "อ้างอิงจากรายการที่ค้างในคิววันนี้ (ตัวอย่าง)",
		confidence: "ปานกลาง",
		state: "ready"
	},
	clients: {
		mode: "ready_for_per",
		summary: "การค้นหาจัดลำดับตามชื่อที่เปอร์เรียกก่อนเสมอ",
		missing: ["อีเมล/เบอร์ที่ยืนยันแล้วของบางราย"],
		nextAction: "ตรวจรายที่ขึ้นสถานะ needs_review",
		state: "ready"
	},
	work: {
		mode: "per_only",
		summary: "ยังไม่เลือกลูกค้า canonical จึงยังแนะนำงานไม่ได้",
		missing: ["client_id ที่ resolve แล้ว"],
		state: "ready"
	},
	models: {
		mode: "auto",
		summary: "มีโปรไฟล์รอรีวิว 2 รายการ",
		missing: ["ชุดภาพสตูดิโอที่ผ่านการรีวิว"],
		state: "ready"
	},
	kenji: {
		mode: "per_only",
		summary: "มีคำตอบรอตรวจ 3 รายการก่อนเผยแพร่",
		missing: ["การอนุมัติจากเปอร์"],
		state: "ready"
	},
	mms: {
		mode: "auto",
		summary: "โดเมน MMS แยกจาก MMD Privé ไม่มีการรวมข้อมูลลูกค้า",
		missing: [],
		state: "ready"
	}
};
var demoAdapter = {
	kind: "demo",
	async searchClients(query) {
		const all = [summaryOf(winnie), ...others];
		const q = query.trim().toLowerCase();
		if (!q) return delay(all);
		return delay(all.filter((c) => (c.perName + (c.canonicalName ?? "")).toLowerCase().includes(q)));
	},
	async getClient(id) {
		if (id === winnie.id) return delay(winnie);
		const found = others.find((o) => o.id === id);
		if (!found) return delay(null);
		return delay({
			...found,
			renewals: [],
			work: [],
			conversation: [],
			access: []
		});
	},
	async getDecisions() {
		return delay([
			{
				id: "d1",
				what: "คุณวินนี่ ส่งหลักฐานการโอนต่ออายุ Premium",
				detail: "2,500 บาท · ได้รับสลิปทาง LINE OFC เมื่อ 7 ก.ย. 69 ยังไม่ยืนยันยอดอย่างเป็นทางการ",
				chips: [
					{
						label: "หลักฐาน",
						value: "ได้รับแล้ว",
						state: "pending"
					},
					{
						label: "ยอดเงิน",
						value: "ยังไม่ยืนยัน",
						state: "pending"
					},
					{
						label: "สิทธิ์",
						value: "resolver ตัดสินภายหลัง",
						state: "unavailable"
					}
				],
				primaryAction: "ตรวจหลักฐานและยืนยันยอด",
				clientId: "demo-winnie",
				clientLabel: "คุณวินนี่"
			},
			{
				id: "d2",
				what: "“หนุ่ย” ตรงกับลูกค้าได้มากกว่าหนึ่งราย",
				detail: "ต้องตรวจ identity ก่อน ระบบจะไม่แสดงข้อเสนอหรือสิทธิ์ใด ๆ จนกว่าจะชัดเจน",
				chips: [{
					label: "Identity",
					value: "ต้องตรวจก่อน",
					state: "needs_review"
				}],
				primaryAction: "เปิดหน้าตรวจ identity",
				clientId: "demo-nui",
				clientLabel: "หนุ่ย"
			},
			{
				id: "d3",
				what: "มีการโอนเข้าที่ยังจับคู่ไม่ได้ 1 รายการ",
				detail: "อยู่ในคิวรายการที่ยังไม่ระบุตัวตน เข้าถึงได้จากตัวกรองรองในหน้า CLIENTS",
				chips: [{
					label: "จับคู่",
					value: "ยังไม่พบเจ้าของ",
					state: "needs_review"
				}],
				primaryAction: "เปิดคิวรายการที่ยังจับคู่ไม่ได้"
			}
		]);
	},
	async getAdvisory(room) {
		return delay(advisoryByRoom[room] ?? {
			mode: "auto",
			summary: "ยังไม่มีคำแนะนำสำหรับห้องนี้",
			missing: [],
			state: "empty"
		});
	},
	async getModels() {
		return delay([
			{
				code: "MDL-A",
				name: "Model A",
				lane: "Privé",
				reviewState: "verified",
				studioState: "ชุดภาพผ่านรีวิวแล้ว",
				lastUsed: "12 ก.ค. 68"
			},
			{
				code: "MDL-C",
				name: "Model C",
				lane: "Privé",
				reviewState: "pending",
				studioState: "รอรีวิวชุดใหม่",
				lastUsed: "3 พ.ย. 67"
			},
			{
				code: "MDL-F",
				name: "Model F",
				lane: "MMS",
				reviewState: "needs_review",
				studioState: "ข้อมูลโปรไฟล์ไม่ครบ"
			}
		]);
	},
	async getKenjiKnowledge() {
		return delay([
			{
				id: "k1",
				topic: "ขั้นตอนการต่ออายุ Premium",
				status: "approved",
				updated: "1 ก.ย. 69",
				owner: "Per"
			},
			{
				id: "k2",
				topic: "การตอบเรื่องราคาย้อนหลัง",
				status: "needs_review",
				updated: "5 ก.ย. 69",
				owner: "Kenji"
			},
			{
				id: "k3",
				topic: "สรุปสเปคลูกค้าเดิม",
				status: "advisory",
				updated: "6 ก.ย. 69",
				owner: "Kenji"
			},
			{
				id: "k4",
				topic: "ข้อความต้อนรับใหม่",
				status: "draft",
				updated: "6 ก.ย. 69",
				owner: "Kenji"
			}
		]);
	},
	async getMmsCases() {
		return delay([{
			ref: "MMS-0231",
			title: "เคสนัดหมายรายวัน",
			area: "สุขุมวิท",
			state: "pending",
			updated: "7 ก.ย. 69"
		}, {
			ref: "MMS-0229",
			title: "เคสติดตามผล",
			area: "สาทร",
			state: "verified",
			updated: "5 ก.ย. 69"
		}]);
	},
	async getUnmatchedPayments() {
		return delay([{
			ref: "TRF-•••-8821",
			amount: "2,500 บาท",
			received: "7 ก.ย. 69 · 09:58",
			state: "needs_review"
		}]);
	}
};
/**
* Per Console adapter.
* - Clients use the SAME customer source as Create Job / Create Session:
*   POST /v1/admin/clients/lineage-lookup via src/lib/mmd-api/clients.ts
*   (same-origin, credentials, no-store → MMD-Prive/mmd-workers).
* - Other reads have no confirmed Worker contract yet: preview uses the
*   labelled demo provider; production fails closed (error → unavailable state).
* Read-only. No mutation, entitlement or payment authority here.
*/
var MATCH = {
	per_rename: "per_rename",
	per_alias: "per_rename",
	historical_alias: "alias",
	canonical: "airtable_canonical",
	line_display_name: "line_ofc",
	phone: "phone",
	email: "email",
	line_user_id: "line_user_id",
	telegram: "telegram",
	member_id: "member_id"
};
function verification(c, all) {
	if (isSelectableClient(c, all)) return "verified";
	if (c.identity_status === "needs_review" || !c.canonical) return "needs_review";
	return "pending";
}
function toSummary(c, all) {
	return {
		id: c.client_id,
		perName: displayName(c),
		canonicalName: c.canonical_name ?? c.client_name ?? void 0,
		matchSource: c.matched_on && MATCH[c.matched_on] || (c.canonical ? "airtable_canonical" : "unresolved"),
		matchConfidence: c.confidence ?? void 0,
		ambiguous: !isSelectableClient(c, all),
		membershipTier: c.tier ?? void 0,
		membershipState: c.membership_status ? "verified" : "unavailable",
		headline: c.warnings?.[0]
	};
}
var unavailable = () => Promise.reject(/* @__PURE__ */ new Error("ยังไม่มีข้อมูลจริงจากระบบหลังบ้าน"));
var adapter = {
	kind: "worker",
	async searchClients(query) {
		const list = await lookupClients(query);
		return list.clients.map((c) => toSummary(c, list.clients));
	},
	async getClient(id) {
		let list = await lookupClients(id);
		if (!list.clients.some((x) => x.client_id === id)) list = await fetchRecentClients();
		const c = list.clients.find((x) => x.client_id === id);
		if (!c) return null;
		return {
			...toSummary(c, list.clients),
			note: "ชื่อที่เปอร์เรียก",
			identity: {
				emails: c.member_email ? [c.member_email] : [],
				phones: c.phone ? [c.phone] : [],
				telegramUsername: c.telegram_username ?? void 0,
				memberId: c.member_id ?? void 0,
				identitySource: c.lineage_source ?? void 0,
				verification: verification(c, list.clients)
			},
			renewals: [],
			work: [],
			conversation: [],
			access: [],
			historicalGaps: ["ประวัติงาน/ต่ออายุยังไม่ได้รับจากระบบหลังบ้าน — ไม่แสดงข้อมูลแทน"]
		};
	},
	getDecisions: () => isPreviewRuntime() ? demoAdapter.getDecisions() : unavailable(),
	getAdvisory: (room) => isPreviewRuntime() ? demoAdapter.getAdvisory(room) : unavailable(),
	getModels: () => isPreviewRuntime() ? demoAdapter.getModels() : unavailable(),
	getKenjiKnowledge: () => isPreviewRuntime() ? demoAdapter.getKenjiKnowledge() : unavailable(),
	getMmsCases: () => isPreviewRuntime() ? demoAdapter.getMmsCases() : unavailable(),
	getUnmatchedPayments: () => isPreviewRuntime() ? demoAdapter.getUnmatchedPayments() : unavailable()
};
/** Hydration-safe demo flag (false on SSR and production). */
function useIsDemo() {
	return useHydrated() && isPreviewRuntime();
}
var badge = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium leading-none", {
	variants: { tone: {
		verified: "border-transparent bg-verified text-verified-foreground",
		pending: "border-transparent bg-pending text-pending-foreground",
		review: "border-transparent bg-attention text-attention-foreground",
		neutral: "border-border bg-muted text-muted-foreground",
		advisory: "border-advisory-border bg-advisory text-advisory-foreground",
		gold: "border-transparent bg-gold-soft text-gold-foreground"
	} },
	defaultVariants: { tone: "neutral" }
});
var stateLabel = {
	verified: {
		th: "ยืนยันแล้ว",
		tone: "verified"
	},
	pending: {
		th: "รอยืนยัน",
		tone: "pending"
	},
	needs_review: {
		th: "ต้องตรวจก่อน",
		tone: "review"
	},
	unavailable: {
		th: "ยังไม่มีข้อมูล",
		tone: "neutral"
	}
};
function StateBadge({ state, label, tone, className }) {
	const resolved = state ? stateLabel[state] : void 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn(badge({ tone: tone ?? resolved?.tone ?? "neutral" }), className),
		children: label ?? resolved?.th ?? "—"
	});
}
var matchSourceLabel = {
	per_rename: "ชื่อที่เปอร์เรียก",
	line_ofc: "LINE Official ล่าสุด",
	airtable_canonical: "Airtable canonical",
	alias: "ชื่อเดิม / alias",
	phone: "เบอร์โทร",
	email: "อีเมล",
	line_user_id: "LINE User ID",
	telegram: "Telegram",
	member_id: "Member ID",
	unresolved: "ยังจับคู่ไม่ได้"
};
function ClientIdentityHeader({ client }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		className: "rounded-xl border border-border bg-card p-5 shadow-calm sm:p-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] uppercase tracking-wide text-muted-foreground",
				children: client.note ?? "ชื่อที่เปอร์เรียก"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "mt-1 text-3xl font-semibold tracking-tight",
				children: client.perName
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex flex-wrap items-center gap-2",
				children: [
					client.canonicalName ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[15px] text-muted-foreground",
						children: client.canonicalName
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateBadge, {
						tone: "gold",
						label: `ที่มาการจับคู่: ${matchSourceLabel[client.matchSource]}`
					}),
					client.membershipTier ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateBadge, { label: `สมาชิก: ${client.membershipTier}` }) : null,
					client.membershipState ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateBadge, { state: client.membershipState }) : null,
					client.lastActivity ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "meta-text",
						children: ["ล่าสุด ", client.lastActivity]
					}) : null
				]
			}),
			client.ambiguous ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-4 flex items-center gap-2 rounded-lg bg-attention px-3 py-2.5 text-[15px] text-attention-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldAlert, { className: "size-4 shrink-0" }), "ต้องตรวจ identity ก่อน — ยังไม่แสดงข้อเสนอหรือการดำเนินการที่ต้องใช้สิทธิ์"]
			}) : client.headline ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 text-[15px]",
				children: client.headline
			}) : null
		]
	});
}
var PLACEHOLDER = "ชื่อที่เปอร์เรียก / LINE / โทร / Email / Client ID";
function GlobalClientSearch() {
	const [q, setQ] = (0, import_react.useState)("");
	const [focused, setFocused] = (0, import_react.useState)(false);
	const { data, isFetching } = useQuery({
		queryKey: ["client-search", q],
		queryFn: () => adapter.searchClients(q),
		enabled: q.trim().length > 0
	});
	const open = focused && q.trim().length > 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
				value: q,
				onChange: (e) => setQ(e.target.value),
				onFocus: () => setFocused(true),
				onBlur: () => window.setTimeout(() => setFocused(false), 150),
				placeholder: PLACEHOLDER,
				"aria-label": "ค้นหาลูกค้า",
				className: "h-11 rounded-full border-border bg-card pl-10 text-[15px] placeholder:text-muted-foreground md:text-[15px]"
			}),
			open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "absolute left-0 right-0 top-[52px] z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-calm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "border-b border-border-soft px-4 py-2 text-[13px] text-muted-foreground",
					children: "ลำดับการค้นหา: ชื่อที่เปอร์เรียก → LINE OFC ล่าสุด → Airtable canonical → alias/เบอร์/อีเมล"
				}), isFetching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "px-4 py-4 text-[15px] text-muted-foreground",
					children: "กำลังตรวจสอบ…"
				}) : !data || data.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "px-4 py-4 text-[15px] text-muted-foreground",
					children: "ไม่พบรายการที่ตรงกัน"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: data.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/internal/console/clients/$clientId",
					params: { clientId: c.id },
					className: "flex min-h-14 flex-col gap-1 px-4 py-3 hover:bg-accent",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "flex flex-wrap items-center gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[15px] font-medium",
								children: c.perName
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateBadge, {
								tone: "gold",
								label: matchSourceLabel[c.matchSource]
							}),
							c.ambiguous ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateBadge, {
								tone: "review",
								label: "ต้องตรวจ identity ก่อน"
							}) : null
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "meta-text flex items-center gap-1.5",
						children: [c.ambiguous ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldAlert, { className: "size-3.5" }) : null, c.headline ?? "—"]
					})]
				}) }, c.id)) })]
			}) : null
		]
	});
}
var ROOMS = [
	{
		to: "/internal/ceo",
		th: "วันนี้ของเปอร์",
		en: "PER TODAY",
		icon: Sun,
		inBottomNav: true
	},
	{
		to: "/internal/admin/customer-data",
		th: "ลูกค้า",
		en: "CLIENTS",
		icon: Users,
		inBottomNav: true
	},
	{
		to: "/internal/admin/work",
		th: "งาน",
		en: "WORK",
		icon: CalendarCheck,
		inBottomNav: true
	},
	{
		to: "/internal/ceo/models",
		th: "โมเดล & สตูดิโอ",
		en: "MODELS & STUDIO",
		icon: Camera,
		inBottomNav: true
	},
	{
		to: "/internal/admin/kenji",
		th: "เคนจิ AI",
		en: "KENJI AI",
		icon: Bot
	},
	{
		to: "/internal/admin/mms",
		th: "นวดชาย",
		en: "MALE MASSAGE",
		icon: HandHeart
	}
];
function useActive() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	return (to) => pathname === to || pathname.startsWith(`${to}/`);
}
function RailItem({ room, active }) {
	const Icon = room.icon;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
		to: room.to,
		className: cn("flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors", active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-calm" : "text-sidebar-foreground hover:bg-sidebar-accent/60"),
		"aria-current": active ? "page" : void 0,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
			className: "size-[18px] shrink-0",
			strokeWidth: 1.7
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "min-w-0",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "block truncate text-[15px] font-medium leading-tight",
				children: room.th
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "block truncate text-[13px] leading-tight text-muted-foreground",
				children: room.en
			})]
		})]
	});
}
function RoomNav() {
	const isActive = useActive();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
		className: "flex flex-col gap-1",
		"aria-label": "ห้องหลัก",
		children: ROOMS.map((room) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RailItem, {
			room,
			active: isActive(room.to)
		}, room.to))
	});
}
function MobileNav() {
	const isActive = useActive();
	const [open, setOpen] = (0, import_react.useState)(false);
	const bottom = ROOMS.filter((r) => r.inBottomNav);
	const more = ROOMS.filter((r) => !r.inBottomNav);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
		className: "fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 backdrop-blur lg:hidden",
		children: [bottom.map((room) => {
			const Icon = room.icon;
			const active = isActive(room.to);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
				to: room.to,
				className: cn("flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[13px]", active ? "text-foreground" : "text-muted-foreground"),
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
						className: "size-5",
						strokeWidth: 1.7
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "truncate",
						children: room.th
					}),
					active ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-0.5 w-6 rounded-full bg-gold" }) : null
				]
			}, room.to);
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Sheet, {
			open,
			onOpenChange: setOpen,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SheetTrigger, {
				className: "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[13px] text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ellipsis, {
					className: "size-5",
					strokeWidth: 1.7
				}), "เพิ่มเติม"]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SheetContent, {
				side: "bottom",
				className: "rounded-t-2xl",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SheetHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SheetTitle, {
					className: "text-left",
					children: "เพิ่มเติม"
				}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col gap-1 p-4 pt-0",
					children: [more.map((room) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						onClick: () => setOpen(false),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RailItem, {
							room,
							active: isActive(room.to)
						})
					}, room.to)), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						onClick: () => setOpen(false),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/internal/admin/owner/setup",
							className: "flex min-h-11 items-center rounded-lg px-3 py-2.5 text-[15px] text-muted-foreground",
							children: "เครื่องมือรอง (Advanced)"
						})
					})]
				})]
			})]
		})]
	});
}
function AppShell({ title, eyebrow, description, children }) {
	const isDemo = useIsDemo();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	import_react.useEffect(() => {
		if (isPreviewRuntime()) return;
		let alive = true;
		fetchAuthMe().then((me) => {
			if (alive && (!me || me.ok === false || me.authenticated === false)) redirectToCanonicalLogin(window.location.pathname + window.location.search);
		});
		return () => {
			alive = false;
		};
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("internal-admin-theme control-room-theme min-h-screen bg-background text-foreground", !/^\/internal\/(admin|console)\/mms(\/|$)/.test(pathname) && "internal-white-theme"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex w-full max-w-[1500px]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "sigil-navigation-rail sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-6 border-r border-border bg-sidebar px-4 py-6 lg:flex",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/internal/ceo",
						className: "px-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SigilLogo, { variant: "dark" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoomNav, {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-auto px-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/internal/admin/owner/setup",
							className: "meta-text hover:text-foreground",
							children: "เครื่องมือรอง · Advanced"
						})
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0 flex-1 pb-24 lg:pb-0",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "sticky top-0 z-30 border-b border-border bg-background/92 backdrop-blur",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/internal/admin/control-room",
								className: "block lg:hidden",
								"aria-label": "SĪGIL System · กลับหน้าหลัก",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SigilLogo, {})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "min-w-0 flex-1",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlobalClientSearch, {})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "hidden items-center gap-2 rounded-full border border-primary bg-gold-soft px-3 py-1.5 text-[13px] font-medium text-foreground sm:inline-flex",
								children: "PER · OWNER MODE"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "ghost",
								size: "icon",
								className: "size-11 sm:hidden",
								"aria-label": "ค้นหา",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "size-5" })
							})
						]
					}), isDemo ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "border-t border-border-soft bg-surface px-4 py-1.5 text-[13px] text-muted-foreground sm:px-6",
						children: DEMO_BANNER
					}) : null]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
					className: "px-4 py-6 sm:px-6 sm:py-8",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-6",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[13px] uppercase tracking-[0.14em] text-muted-foreground",
								children: eyebrow
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "mt-1 text-2xl font-semibold tracking-tight sm:text-3xl",
								children: title
							}),
							description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 max-w-2xl text-[15px] text-muted-foreground",
								children: description
							}) : null
						]
					}), children]
				})]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MobileNav, {})]
	});
}
var modeLabel = {
	auto: "Auto",
	ready_for_per: "Ready for Per",
	per_only: "Per only"
};
function AdvisoryPanel({ room, className }) {
	const { data, isLoading, isError } = useQuery({
		queryKey: ["advisory", room],
		queryFn: () => adapter.getAdvisory(room)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: cn("rounded-xl border border-dashed border-advisory-border bg-advisory p-5 text-advisory-foreground", className, room === "mms" && "border-solid border-border bg-background text-foreground"),
		"aria-label": "AI advisory panel",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrainCircuit, {
						className: "size-[18px]",
						strokeWidth: 1.7
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-[15px] font-semibold tracking-wide",
						children: "PER · AI OPS"
					})]
				}), data ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded-full border border-advisory-border px-2.5 py-1 text-[13px]",
					children: modeLabel[data.mode]
				}) : null]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 flex items-start gap-1.5 text-[13px] opacity-80",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Info, { className: "mt-0.5 size-3.5 shrink-0" }), "AI เป็นคำแนะนำ ไม่ใช่อำนาจยืนยัน"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-4 space-y-4 text-[15px]",
				children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-4 w-4/5 bg-advisory-border/50" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-4 w-3/5 bg-advisory-border/50" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] opacity-70",
						children: "กำลังตรวจสอบ…"
					})
				] }) : isError || !data ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "flex items-center gap-2 text-[15px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "size-4" }), " ดึงคำแนะนำไม่สำเร็จ ลองใหม่อีกครั้ง"]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[13px] uppercase tracking-wide opacity-70",
						children: "สรุป"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1",
						children: data.summary
					})] }),
					data.missing.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[13px] uppercase tracking-wide opacity-70",
						children: "ข้อมูลที่ยังขาด"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-1 list-disc space-y-1 pl-5",
						children: data.missing.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: m }, m))
					})] }) : null,
					data.nextAction ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[13px] uppercase tracking-wide opacity-70",
						children: "สิ่งที่ควรทำต่อ"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1",
						children: data.nextAction
					})] }) : null,
					data.reason || data.confidence ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-[13px] opacity-70",
						children: [
							data.reason,
							" ",
							data.confidence ? `· ความมั่นใจ: ${data.confidence}` : ""
						]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "border-t border-advisory-border pt-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] opacity-70",
							children: "ข้อความตอบกลับที่ AI ร่างไว้ (พรีวิวเท่านั้น)"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "outline",
							size: "sm",
							disabled: true,
							className: "mt-2 h-11",
							children: "ส่งข้อความ (ปิดใช้งานในโหมดพรีวิว)"
						})]
					})
				] })
			})
		]
	});
}
function EvidenceRow({ item, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("flex min-h-11 flex-wrap items-center justify-between gap-3 border-b border-border-soft py-2.5 last:border-b-0", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[13px] uppercase tracking-wide text-muted-foreground",
			children: item.label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "flex items-center gap-2 text-[15px]",
			children: [item.value, item.state ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateBadge, { state: item.state }) : null]
		})]
	});
}
function ActionBar({ primary, secondary, note, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("flex flex-col gap-2 border-t border-border-soft pt-4", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center gap-2",
			children: [primary, secondary]
		}), note ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[13px] text-muted-foreground",
			children: note
		}) : null]
	});
}
function EmptyState({ icon: Icon, title, description, action, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-12 text-center", className),
		children: [
			Icon ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
				className: "size-6 text-muted-foreground",
				strokeWidth: 1.6
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-base font-medium",
				children: title
			}),
			description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-md text-[15px] text-muted-foreground",
				children: description
			}) : null,
			action
		]
	});
}
var Tabs = Tabs$1;
var TabsList = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsList$1, {
	ref,
	className: cn("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className),
	...props
}));
TabsList.displayName = TabsList$1.displayName;
var TabsTrigger = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsTrigger$1, {
	ref,
	className: cn("inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow", className),
	...props
}));
TabsTrigger.displayName = TabsTrigger$1.displayName;
var TabsContent = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent$1, {
	ref,
	className: cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className),
	...props
}));
TabsContent.displayName = TabsContent$1.displayName;
function Panel({ title, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-xl border border-border bg-card p-5 shadow-calm",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "text-[17px] font-semibold",
			children: title
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-4",
			children
		})]
	});
}
function ClientDetailRoute() {
	const { clientId } = Route.useParams();
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError } = useQuery({
		queryKey: ["client", clientId],
		queryFn: () => adapter.getClient(clientId)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AppShell, {
		eyebrow: "CLIENTS · CLIENT 360",
		title: "รายละเอียดลูกค้า",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
			to: "/internal/admin/customer-data",
			search: { q: "" },
			className: "mb-4 inline-flex min-h-11 items-center gap-2 text-[15px] text-muted-foreground hover:text-foreground",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), " กลับไปหน้าลูกค้า"]
		}), isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-64 rounded-xl" }) : isError || !data ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
			title: "ไม่พบลูกค้ารายนี้",
			description: "ลิงก์เดิมยังเปิดได้ แต่ยังไม่มีข้อมูลที่ตรงกัน"
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClientIdentityHeader, { client: data }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
					value: tab ?? "overview",
					onValueChange: (v) => navigate({ search: { tab: v } }),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsList, {
							className: "flex h-auto w-full flex-wrap justify-start gap-1 bg-surface p-1.5",
							children: TABS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsTrigger, {
								value: t.id,
								className: "h-11 px-4 text-[15px]",
								children: t.label
							}, t.id))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
							value: "overview",
							className: "mt-5 space-y-5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
								title: "ใครคือคนนี้ / เกิดอะไรขึ้น / ต้องทำอะไรต่อ",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "table-text",
										children: data.headline ?? "ยังไม่มีสรุปสถานะสำหรับลูกค้ารายนี้"
									}),
									data.intendedAction ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-4",
										children: data.intendedAction.evidence.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: e }, e.label))
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionBar, {
										className: "mt-5",
										primary: data.ambiguous ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
											className: "h-11",
											disabled: true,
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldAlert, { className: "size-4" }), " ต้องตรวจ identity ก่อน"]
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											className: "h-11",
											onClick: () => navigate({ search: { tab: "payment" } }),
											children: "ตรวจหลักฐานและยืนยันยอด"
										}),
										secondary: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
											variant: "outline",
											className: "h-11",
											onClick: () => navigate({ search: { tab: "conversation" } }),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageSquare, { className: "size-4" }), " เปิดบทสนทนาล่าสุด"]
										}),
										note: "การยืนยันยอดเป็นขั้นตอนอย่างเป็นทางการฝั่งระบบหลัก ไม่มีการให้สิทธิ์แบบคลิกเดียวในหน้านี้"
									})
								]
							}), data.historicalGaps?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
								title: "ช่วงประวัติที่ยังไม่สมบูรณ์",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "list-disc space-y-1 pl-5 table-text",
									children: data.historicalGaps.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: g }, g))
								})
							}) : null]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
							value: "conversation",
							className: "mt-5",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
								title: "บทสนทนาล่าสุดจาก LINE Official",
								children: [data.conversation.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, { title: "ยังไม่มีบทสนทนาที่ดึงมาได้" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "space-y-3",
									children: data.conversation.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
										className: m.from === "client" ? "max-w-[85%] rounded-xl bg-surface px-4 py-3 table-text" : "ml-auto max-w-[85%] rounded-xl bg-primary px-4 py-3 table-text text-primary-foreground",
										children: [m.text, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: m.from === "client" ? "meta-text mt-1 block" : "mt-1 block text-[13px] opacity-70",
											children: m.at
										})]
									}, i))
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "meta-text mt-4",
									children: "แสดงเพื่ออ่านบริบทเท่านั้น ไม่มีการส่งข้อความออกจากหน้านี้"
								})]
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
							value: "history",
							className: "mt-5",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
								title: "ประวัติงานทั้งหมด",
								children: data.work.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, { title: "ยังไม่พบงานย้อนหลัง" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "overflow-x-auto",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
										className: "w-full table-text",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
											className: "sticky top-0 bg-card text-left",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
												className: "text-[13px] uppercase tracking-wide text-muted-foreground",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
														className: "py-3 pr-4 font-medium",
														children: "วันที่"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
														className: "py-3 pr-4 font-medium",
														children: "งาน"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
														className: "py-3 pr-4 font-medium",
														children: "Model"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
														className: "py-3 pr-4 font-medium",
														children: "เรทที่บันทึกไว้"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
														className: "py-3 font-medium",
														children: "สถานะ"
													})
												]
											})
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: data.work.map((w) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
											className: "border-t border-border-soft",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "py-4 pr-4",
													children: w.date
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
													className: "py-4 pr-4",
													children: [w.lane, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "meta-text block",
														children: w.ref
													})]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "py-4 pr-4",
													children: w.model ?? "—"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "py-4 pr-4",
													children: w.rateSnapshot ?? "—"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "py-4",
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateBadge, { state: w.state })
												})
											]
										}, w.ref)) })]
									})
								})
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
							value: "payment",
							className: "mt-5",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
								title: "ชำระเงินและต่ออายุ",
								children: [
									data.intendedAction ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "table-text",
										children: [
											data.intendedAction.title,
											" · ",
											data.intendedAction.amount
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-4",
										children: data.intendedAction.evidence.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: e }, e.label))
									})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, { title: "ยังไม่มีรายการที่รอยืนยัน" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										className: "mt-6 text-[15px] font-semibold",
										children: "ประวัติการต่ออายุ"
									}),
									data.renewals.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "meta-text mt-2",
										children: "ไม่มีข้อมูล"
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
										className: "mt-2 divide-y divide-border-soft",
										children: data.renewals.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
											className: "flex min-h-12 flex-wrap items-center justify-between gap-2 py-3 table-text",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
												r.date,
												" · ",
												r.package,
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "meta-text block",
													children: r.amount
												})
											] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateBadge, { state: r.state })]
										}, r.date))
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionBar, {
										className: "mt-6",
										primary: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											className: "h-11",
											disabled: data.ambiguous,
											children: "ตรวจหลักฐานและยืนยันยอด"
										}),
										secondary: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											variant: "outline",
											className: "h-11",
											onClick: () => navigate({ search: { tab: "conversation" } }),
											children: "เปิดบทสนทนาล่าสุด"
										}),
										note: "หลังยืนยันยอด resolver จะเป็นผู้ตัดสินสถานะสมาชิก และ Telegram/Drive ต้องผ่านการ reconcile — ยังไม่ถือว่าให้สิทธิ์แล้ว"
									})
								]
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
							value: "points",
							className: "mt-5",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
								title: "แต้มและสมาชิก",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: {
										label: "ระดับสมาชิก",
										value: data.membershipTier ?? "ไม่มีข้อมูล",
										state: data.membershipState ?? "unavailable"
									} }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: {
										label: "แต้มสะสม",
										value: "ต้องอ่านจาก resolver",
										state: "unavailable"
									} }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: {
										label: "วันหมดอายุ",
										value: "ต้องอ่านจาก resolver",
										state: "unavailable"
									} }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "meta-text mt-4",
										children: "หน้านี้เป็นการอ่านผลจาก entitlement resolver เท่านั้น ไม่มีการแก้ไขจากเบราว์เซอร์"
									})
								]
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
							value: "access",
							className: "mt-5",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
								title: "ผลการ reconcile สิทธิ์เข้าถึง",
								children: [data.access.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, { title: "ยังไม่มีผลการ reconcile" }) : data.access.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: {
									label: a.channel === "telegram" ? "Telegram" : "Google Drive",
									value: a.note,
									state: a.result
								} }, a.channel)), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "meta-text mt-4",
									children: "แสดงเป็นผลลัพธ์ของ resolver เท่านั้น ไม่ใช่สวิตช์เปิด/ปิดสิทธิ์"
								})]
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
							value: "advanced",
							className: "mt-5",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "rounded-xl border border-dashed border-border bg-surface/60 p-5",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
										className: "flex items-center gap-2 text-[15px] font-semibold text-muted-foreground",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, { className: "size-4" }), " ขั้นสูง · ใช้เมื่อจำเป็นเท่านั้น"]
									}),
									data.identity ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-4",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "meta-text",
											children: "ข้อมูลติดต่อภายในเท่านั้น — แสดงหลังจับคู่ canonical แล้ว ห้ามใช้กับลูกค้าโดยตรง"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-3",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: {
													label: "อีเมล",
													value: data.identity.emails.join(", ") || "—"
												} }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: {
													label: "เบอร์",
													value: data.identity.phones.join(", ") || "—"
												} }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: {
													label: "LINE User ID",
													value: data.identity.lineUserId ?? "—"
												} }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: {
													label: "Telegram",
													value: data.identity.telegramUsername ?? "—"
												} }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: {
													label: "Member ID",
													value: data.identity.memberId ?? "—"
												} }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EvidenceRow, { item: {
													label: "ที่มาข้อมูลตัวตน",
													value: data.identity.identitySource ?? "—",
													state: data.identity.verification
												} })
											]
										})]
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "meta-text mt-3",
										children: "ยังไม่มีการจับคู่ canonical จึงไม่แสดงข้อมูลตัวตน"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionBar, {
										className: "mt-5",
										primary: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											variant: "outline",
											className: "h-11",
											disabled: true,
											children: "ซ่อมข้อมูลตัวตน (ยังไม่เปิดใช้งานในโหมดพรีวิว)"
										})
									})
								]
							})
						})
					]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AdvisoryPanel, {
				room: "clients",
				className: "h-fit xl:sticky xl:top-28"
			})]
		})]
	});
}
//#endregion
export { ClientDetailRoute as component };
