import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link, x as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { V as CirclePlus, Y as CalendarCheck, b as Megaphone, n as Wallet, p as Search, r as Users } from "../_libs/lucide-react.mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { n as useOwnerSnapshot, t as snapshotCount } from "./owner-snapshot-BtaivETD.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.control-room-BRJdXwyc.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var TASKS = [
	{
		n: 1,
		to: "/internal/admin/customer-data",
		title: "ค้นหาลูกค้า",
		note: "ชื่อที่เปอร์จำ → ประวัติทั้งหมด",
		icon: Users,
		keys: []
	},
	{
		n: 2,
		to: "/internal/admin/jobs/create-job",
		title: "สร้างงาน",
		note: "เลือกลูกค้า → โมเดล → ราคา → สร้าง",
		icon: CirclePlus,
		keys: ["jobs_need_confirm"],
		countLabel: "รอยืนยัน"
	},
	{
		n: 3,
		to: "/internal/admin/jobs/all",
		title: "งานทั้งหมด",
		note: "สถานะ · ลิงก์ชำระ · ยกเลิกงานซ้ำ",
		icon: CalendarCheck,
		keys: ["jobs_pending_payment", "payments_pending"],
		countLabel: "รอชำระ"
	},
	{
		n: 4,
		to: "/internal/admin/payments",
		title: "รับเงิน / สลิป",
		note: "ตรวจสลิป → ยืนยันเงินเข้า",
		icon: Wallet,
		keys: [
			"payments_review_pending",
			"payment_review_queue",
			"money_review_pending",
			"payment_slips_pending",
			"payment_proofs_pending"
		],
		countLabel: "สลิปรอตรวจ"
	}
];
function Home() {
	const snap = useOwnerSnapshot();
	const navigate = useNavigate();
	const [q, setQ] = (0, import_react.useState)("");
	const submit = (e) => {
		e.preventDefault();
		const v = q.trim();
		navigate({
			to: "/internal/admin/customer-data",
			search: { q: v }
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "หน้าแรก",
		path: "/internal/admin/control-room",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-3xl space-y-6 px-4 py-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-2xl font-semibold tracking-tight",
					children: "วันนี้เริ่มจากอะไรดี เปอร์"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[15px] text-muted-foreground",
					children: "ค้นหาลูกค้า → สร้างงาน → ส่งลิงก์ชำระ → ตรวจสลิป"
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: submit,
					role: "search",
					className: "flex items-center gap-2 rounded-2xl border border-gold/40 bg-surface px-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
							className: "size-5 shrink-0 text-muted-foreground",
							"aria-hidden": true
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: q,
							onChange: (e) => setQ(e.target.value),
							placeholder: "ชื่อที่เปอร์จำ เช่น หนุ่ย",
							"aria-label": "ค้นหาลูกค้า",
							className: "min-h-14 w-full bg-transparent text-[17px] outline-none placeholder:text-muted-foreground"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							className: "min-h-11 shrink-0 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground",
							children: "ค้นหา"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
					className: "grid gap-3 sm:grid-cols-2",
					children: TASKS.map((t) => {
						const Icon = t.icon;
						const c = t.keys.length ? snapshotCount(snap.data, t.keys) : null;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: t.to,
							className: "flex h-full min-h-32 items-start gap-3 rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold-muted",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
									className: "size-5",
									"aria-hidden": true
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "flex min-h-24 min-w-0 flex-1 flex-col",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "block text-[17px] font-semibold",
										children: [
											t.n,
											" · ",
											t.title
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mt-0.5 block text-[14px] text-muted-foreground",
										children: t.note
									}),
									t.countLabel && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mt-auto block min-h-7 pt-1",
										children: c ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "inline-flex rounded-full border border-gold/50 bg-gold-muted px-2.5 py-0.5 text-[13px] font-semibold",
											children: [
												t.countLabel,
												" ",
												c
											]
										}) : null
									})
								]
							})]
						}) }, t.to);
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/internal/admin/broadcasts",
					className: "flex min-h-16 items-center gap-3 border-t border-border py-4 text-foreground hover:text-gold",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Megaphone, {
						className: "size-5 shrink-0",
						"aria-hidden": true
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "block text-[17px] font-semibold",
						children: "จัดการประกาศ"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[13px] text-muted-foreground",
						children: "ประกาศที่ลงแล้ว · สถานะ · รายละเอียดและลิงก์"
					})] })]
				}),
				snap.isError && !snap.data && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					role: "status",
					className: "text-[13px] text-muted-foreground",
					children: "ตัวเลขสรุปยังโหลดไม่ได้ · ใช้งานทุกหน้าได้ตามปกติ"
				})
			]
		})
	});
}
//#endregion
export { Home as component };
