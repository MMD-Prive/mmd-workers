import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { o as cn, r as SigilLogo } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link, p as useRouterState, x as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { J as usingDemoData } from "./provider-CvQy8AcV.mjs";
import { r as redirectToCanonicalLogin, t as fetchAuthMe } from "./auth-D66UAcCi.mjs";
import { F as Ellipsis, V as CirclePlus, Y as CalendarCheck, k as House, n as Wallet, p as Search, r as Users, t as X } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ConsoleShell-Dawp5DUR.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* MMD OS — owner-first navigation canon.
*
* Exactly six rooms are primary navigation. Everything else (Control Room,
* Membership Access, Payments, Protocol Center, Access Invite, Studio…) stays
* reachable as a destination INSIDE a room, never as a top-level item.
*
* Navigation is presentation only. Authority (auth, permissions, entitlement,
* validation, writes, publish/audit) stays in the Workers backend.
*/
var ROOMS = [
	{
		id: "home",
		th: "หน้าแรก",
		en: "HOME",
		to: "/internal/admin/control-room",
		icon: House,
		match: [
			"/internal/admin/control-room",
			"/internal/ceo",
			"/internal/admin/dashboard",
			"/internal/admin/kenji",
			"/internal/admin/studio",
			"/internal/admin/models",
			"/internal/admin/mms",
			"/internal/admin/telegram-brief",
			"/internal/admin/model-job-board",
			"/internal/console"
		]
	},
	{
		id: "clients",
		th: "ค้นหาลูกค้า",
		en: "CLIENTS",
		to: "/internal/admin/customer-data",
		icon: Users,
		match: [
			"/internal/admin/customer-data",
			"/internal/admin/clients",
			"/internal/admin/member-intelligence",
			"/internal/admin/membership-access",
			"/internal/admin/access/invite"
		]
	},
	{
		id: "create",
		th: "สร้างงาน",
		en: "CREATE JOB",
		to: "/internal/admin/jobs/create-job",
		icon: CirclePlus,
		match: ["/internal/admin/jobs/create-job", "/internal/admin/jobs/create-session"]
	},
	{
		id: "jobs",
		th: "งานทั้งหมด",
		en: "ALL JOBS",
		to: "/internal/admin/jobs/all",
		icon: CalendarCheck,
		match: [
			"/internal/admin/jobs/all",
			"/internal/admin/broadcasts",
			"/internal/admin/work",
			"/internal/admin/calendar",
			"/internal/admin/protocol",
			"/internal/admin/owner"
		]
	},
	{
		id: "money",
		th: "รับเงิน",
		en: "PAYMENTS",
		to: "/internal/admin/payments",
		icon: Wallet,
		match: ["/internal/admin/payments", "/internal/ceo/payment-slip-inbox"]
	}
];
/** All five fit the mobile bottom bar; hidden pages stay reachable by URL. */
var MOBILE_PRIMARY = [
	"home",
	"clients",
	"create",
	"jobs",
	"money"
];
var MOBILE_MORE = [];
function roomForPath(pathname) {
	let best;
	for (const r of ROOMS) for (const m of r.match) if ((pathname === m || pathname.startsWith(`${m}/`)) && (!best || m.length > best.len)) best = {
		room: r,
		len: m.length
	};
	return best?.room;
}
/** Destinations inside the CLIENTS room. */
var CLIENT_ROOM_ITEMS = [
	{
		code: "C360",
		label: "Customer 360",
		to: "/internal/admin/customer-data",
		description: "ชื่อที่เปอร์เรียก · ประวัติ · การต่ออายุ"
	},
	{
		code: "MIN",
		label: "Member Intelligence",
		to: "/internal/admin/member-intelligence",
		description: "สรุปลูกค้าแบบอ่านอย่างเดียวจากแหล่งข้อมูลจริง"
	},
	{
		code: "MAC",
		label: "Membership Access",
		to: "/internal/admin/membership-access",
		description: "สถานะสิทธิ์จาก resolver และการอนุมัติที่มีการ์ด"
	},
	{
		code: "INV",
		label: "Access Invite",
		to: "/internal/admin/access/invite",
		description: "คำเชิญเข้าใช้งานที่ออกโดยผู้ดูแล"
	},
	{
		code: "PAY",
		label: "Payments",
		to: "/internal/admin/payments",
		description: "หลักฐานการชำระเงิน · payments-worker เป็นผู้ยืนยัน"
	},
	{
		code: "HBF",
		label: "Historical Backfill",
		to: "/internal/admin/payments/historical-backfill",
		description: "ประวัติการชำระย้อนหลัง · อ่านอย่างเดียว"
	},
	{
		code: "SLP",
		label: "Payment Slip Inbox",
		to: "/internal/ceo/payment-slip-inbox",
		description: "สลิปที่ต้องให้เปอร์ดู · ไม่ยืนยันยอดจากหน้านี้"
	}
];
/** Destinations inside the PER TODAY room. */
var TODAY_ROOM_ITEMS = [
	{
		code: "CEO",
		label: "Per Today",
		to: "/internal/ceo",
		description: "สิ่งที่ต้องให้เปอร์ตัดสินตอนนี้"
	},
	{
		code: "DSH",
		label: "Dashboard",
		to: "/internal/admin/dashboard",
		description: "สรุปธุรกิจและระบบจาก /v1/admin/dashboard"
	},
	{
		code: "CTL",
		label: "Control Room",
		to: "/internal/admin/control-room",
		description: "แผนที่งานและสิ่งที่ต้องทำต่อ"
	}
];
/** Destinations inside the WORK room. */
var WORK_ROOM_ITEMS = [
	{
		code: "BRC",
		label: "จัดการประกาศ",
		to: "/internal/admin/broadcasts",
		description: "รายการประกาศ สถานะ และรายละเอียดที่ระบบยืนยัน"
	},
	{
		code: "SES",
		label: "Create Job",
		to: "/internal/admin/jobs/create-job",
		description: "Public / Private · ลูกค้า → ประเภทงาน → โมเดล → รายละเอียด → ตรวจ → Create Job"
	},
	{
		code: "ALL",
		label: "All Jobs",
		to: "/internal/admin/jobs/all",
		description: "ติดตามงานและเปิดเคสที่เลือกด้วย session_id"
	},
	{
		code: "JBD",
		label: "Job Board · Public / Private",
		href: "/internal/admin/jobs/job-board",
		description: "ประกาศหาโมเดล · Public MMD / Private SIGIL"
	},
	{
		code: "CTL",
		label: "Control Room",
		to: "/internal/admin/control-room",
		description: "ภาพรวมงานและสถานะระบบวันนี้"
	},
	{
		code: "CAL",
		label: "Calendar",
		to: "/internal/admin/calendar",
		description: "ปฏิทินงาน · ข้อมูลจากระบบหลังบ้านเท่านั้น"
	},
	{
		code: "PRO",
		label: "Protocol Center",
		to: "/internal/admin/protocol",
		description: "กฎการทำงาน · Draft → Review → QA → Publish"
	},
	{
		code: "OWN",
		label: "Owner Setup",
		to: "/internal/admin/owner/setup",
		description: "เครื่องมือตั้งค่าเสริม · Advanced"
	}
];
/** Destinations inside the MODELS & STUDIO room. */
var MODEL_ROOM_ITEMS = [
	{
		code: "MDL",
		label: "Model Console",
		to: "/internal/ceo/models",
		description: "ค้นหา · ความพร้อม · asset ของโมเดล"
	},
	{
		code: "STD",
		label: "Studio",
		to: "/internal/admin/studio",
		description: "หน้าเริ่มต้นสตูดิโอ"
	},
	{
		code: "UPL",
		label: "Upload",
		to: "/internal/admin/studio/upload",
		description: "Drive / Intake → Studio"
	},
	{
		code: "REV",
		label: "Review",
		to: "/internal/admin/studio/review",
		description: "ตรวจก่อนเข้า R2 + Airtable"
	},
	{
		code: "PRV",
		label: "Model Preview",
		to: "/internal/admin/studio/model-preview",
		description: "ตรวจดูเท่านั้น · ไม่ให้สิทธิ์ publish"
	},
	{
		code: "JBR",
		label: "Job Board Release",
		to: "/internal/admin/model-job-board/release-control",
		description: "พร้อม broadcast ให้โมเดลหรือยัง · ระบบหลังบ้านยืนยัน"
	},
	{
		code: "CBK",
		label: "Care-back",
		to: "/internal/admin/studio/care-back",
		description: "โมเดลที่ต้องอัปเดตต่อ"
	}
];
/** Destinations inside the KENJI AI room. */
var KENJI_ROOM_ITEMS = [
	{
		code: "KNJ",
		label: "Kenji Admin",
		to: "/internal/admin/kenji",
		description: "ความรู้ · QA · publish · audit"
	},
	{
		code: "KCT",
		label: "Kenji Control",
		to: "/internal/ceo/kenji-control",
		description: "มุมมองเจ้าของ · อ่านอย่างเดียว"
	},
	{
		code: "TGC",
		label: "Telegram Concierges",
		to: "/internal/admin/telegram-brief",
		description: "HYPE + HENNA · routing / health / handoff"
	}
];
/** Destinations inside the MALE MASSAGE room. */
var MMS_ITEMS = [
	{
		code: "MMS",
		label: "MMS Overview",
		to: "/internal/admin/mms",
		description: "สถานะการทำงานของ MMS วันนี้"
	},
	{
		code: "BKG",
		label: "Booking Requests",
		to: "/internal/admin/mms/bookings",
		description: "คำขอที่รอจับคู่หรือยืนยัน"
	},
	{
		code: "CUS",
		label: "Customer Intelligence",
		to: "/internal/admin/mms/customers",
		description: "ประวัติและความต้องการของลูกค้า MMS"
	},
	{
		code: "THP",
		label: "Therapists",
		to: "/internal/admin/mms/therapists",
		description: "รายชื่อและความพร้อมของเธอราปิสต์"
	},
	{
		code: "APP",
		label: "Applications",
		to: "/internal/admin/mms/applications",
		description: "ใบสมัครและสถานะ onboarding"
	},
	{
		code: "MTC",
		label: "Matching",
		to: "/internal/admin/mms/matching",
		description: "จับคู่เธอราปิสต์กับคำขอ"
	},
	{
		code: "PAY",
		label: "Payments & Deposit",
		to: "/internal/admin/mms/payments",
		description: "หลักฐานมัดจำและการชำระเงิน ตรวจโดยระบบหลังบ้าน"
	},
	{
		code: "CAS",
		label: "Customer Cases",
		to: "/internal/admin/mms/cases",
		description: "ปัญหา การติดตาม และการแก้ไข"
	}
];
var SEARCH_PLACEHOLDER = "ชื่อที่เปอร์เรียก / LINE / โทร / Email / Client ID";
function ConsoleShell({ module, path, actions, appearance = "default", children }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const search = useRouterState({ select: (s) => s.location.searchStr });
	const navigate = useNavigate();
	const [more, setMore] = (0, import_react.useState)(false);
	const [query, setQuery] = (0, import_react.useState)("");
	const [demo, setDemo] = (0, import_react.useState)(false);
	const activeRoom = roomForPath(pathname);
	(0, import_react.useEffect)(() => {
		setDemo(usingDemoData());
	}, []);
	(0, import_react.useEffect)(() => {
		if (usingDemoData()) return;
		let alive = true;
		fetchAuthMe().then((me) => {
			if (!alive) return;
			if (!me || me.ok === false || me.authenticated === false) redirectToCanonicalLogin(`${pathname}${search ?? ""}`);
		});
		return () => {
			alive = false;
		};
	}, [
		navigate,
		pathname,
		search
	]);
	function submitSearch(e) {
		e.preventDefault();
		const q = query.trim();
		navigate({
			to: "/internal/admin/customer-data",
			search: { q }
		});
	}
	const rail = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
		"aria-label": "ห้องทำงานหลัก",
		className: "space-y-1.5",
		children: ROOMS.map((room) => {
			const Icon = room.icon;
			const active = activeRoom?.id === room.id;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
				to: room.to,
				"aria-current": active ? "page" : void 0,
				className: cn("step-transition flex min-h-[44px] items-center gap-3 rounded-xl border px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-gold/60 bg-gold-muted text-foreground" : "border-transparent text-foreground/80 hover:border-border hover:bg-surface-2"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
					className: cn("h-5 w-5 shrink-0", active ? "text-gold" : "text-muted-foreground"),
					"aria-hidden": true
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "block truncate text-[16px] font-medium leading-tight",
						children: room.th
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "block truncate text-[13px] text-muted-foreground",
						children: room.en
					})]
				})]
			}, room.id);
		})
	});
	const bottomRooms = MOBILE_PRIMARY.map((id) => ROOMS.find((r) => r.id === id)).filter(Boolean);
	const moreRooms = MOBILE_MORE.map((id) => ROOMS.find((r) => r.id === id)).filter(Boolean);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("internal-admin-theme min-h-screen bg-background text-foreground", appearance === "console" && "session-pro-theme", appearance === "sigil" && "session-pro-theme broadcast-pink", "control-room-theme", !/^\/internal\/(admin|console)\/mms(\/|$)/.test(pathname) && "internal-white-theme"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: cn("sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur", path === "/internal/admin/control-room" && "lg:min-h-24"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: cn("mx-auto flex flex-wrap items-center gap-3 px-4 py-3", path === "/internal/admin/control-room" && "lg:min-h-[95px] lg:flex-nowrap", appearance !== "default" ? "max-w-[1520px]" : "max-w-[1400px]"),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/internal/admin/control-room",
								className: "block",
								"aria-label": "SĪGIL System · กลับหน้าหลัก",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SigilLogo, {})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "sr-only",
								children: module
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
							role: "search",
							onSubmit: submitSearch,
							className: cn("order-last flex w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 lg:order-none lg:ml-6 lg:w-auto lg:max-w-xl lg:flex-1"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
								className: "h-4 w-4 shrink-0 text-muted-foreground",
								"aria-hidden": true
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: query,
								onChange: (e) => setQuery(e.target.value),
								placeholder: SEARCH_PLACEHOLDER,
								"aria-label": `ค้นหาลูกค้า — ${SEARCH_PLACEHOLDER}`,
								className: "min-h-[44px] w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "ml-auto flex items-center gap-2",
							children: [actions, demo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: cn("rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[13px] text-warn"),
								children: "ข้อมูลตัวอย่าง · ไม่ใช่ข้อมูลจริง"
							})]
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "sr-only",
					children: path
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: cn("mx-auto flex", appearance !== "default" ? "max-w-[1520px]" : "max-w-[1400px]"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
					className: cn("sigil-navigation-rail hidden shrink-0 border-r border-border px-3 py-5 lg:block", appearance !== "default" ? "w-[220px]" : "w-[248px]"),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "sticky top-28",
						children: rail
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "min-w-0 flex-1 pb-24 lg:pb-0",
					children
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
				"aria-label": "ห้องทำงานหลัก",
				className: "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/98 backdrop-blur lg:hidden",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-5",
					children: [bottomRooms.map((room) => {
						const Icon = room.icon;
						const active = activeRoom?.id === room.id;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: room.to,
							"aria-current": active ? "page" : void 0,
							onClick: () => setMore(false),
							className: cn("flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[13px]", active ? "text-gold" : "text-muted-foreground"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
								className: "h-5 w-5",
								"aria-hidden": true
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "truncate",
								children: room.th
							})]
						}, room.id);
					}), moreRooms.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						"aria-expanded": more,
						onClick: () => setMore((v) => !v),
						className: cn("flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[13px]", more ? "text-gold" : "text-muted-foreground"),
						children: [more ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {
							className: "h-5 w-5",
							"aria-hidden": true
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ellipsis, {
							className: "h-5 w-5",
							"aria-hidden": true
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "เพิ่มเติม" })]
					})]
				}), more && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "border-t border-border p-3",
					children: moreRooms.map((room) => {
						const Icon = room.icon;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: room.to,
							onClick: () => setMore(false),
							className: "flex min-h-[52px] items-center gap-3 rounded-xl px-3 py-2 text-[16px] hover:bg-surface-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
									className: "h-5 w-5 text-muted-foreground",
									"aria-hidden": true
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: room.th }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "ml-auto text-[13px] text-muted-foreground",
									children: room.en
								})
							]
						}, room.id);
					})
				})]
			})
		]
	});
}
//#endregion
export { MODEL_ROOM_ITEMS as a, MMS_ITEMS as i, ConsoleShell as n, TODAY_ROOM_ITEMS as o, KENJI_ROOM_ITEMS as r, WORK_ROOM_ITEMS as s, CLIENT_ROOM_ITEMS as t };
