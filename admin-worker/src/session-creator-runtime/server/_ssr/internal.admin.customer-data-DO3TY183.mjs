import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { o as cn, s as isPreviewRuntime, t as ApiError } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { J as usingDemoData } from "./provider-CvQy8AcV.mjs";
import { H as CircleCheck, a as TriangleAlert } from "../_libs/lucide-react.mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as Route } from "./internal.admin.customer-data-CWeMksG_.mjs";
import { t as AiAdvisory } from "./AiAdvisory-COXlDbpb.mjs";
import { a as resolveSelectedClient, i as lookupClients, n as fetchRecentClients, r as isSelectableClient, t as displayName } from "./clients-D1ivRQGK.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.customer-data-DO3TY183.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* CLIENTS · AUDIENCE — segment counts (READ ONLY, typed interface).
*
* Audience helps Per find what to look at. It is not entitlement, membership
* or payment truth: every count and every record comes from the backend, and
* the browser never computes a segment. No canonical same-origin segment
* contract exists in `MMD-Prive/mmd-workers` yet, so on a live origin this
* adapter reports `unavailable` instead of inventing a fetch path.
*/
/** Operator-facing labels; ids are the contract keys. */
var AUDIENCE_LABELS = {
	all: "ลูกค้าทั้งหมด",
	identity_review: "ต้องตรวจ identity",
	payment_pending: "รอชำระ / ต่ออายุ",
	active_member: "สมาชิกที่ใช้งานอยู่",
	expiring: "ใกล้หมดอายุ / หมดอายุ",
	recent_conversation: "คุยกันล่าสุด",
	no_recent_context: "ไม่มีบริบทล่าสุด"
};
var AUDIENCE_NOTE = "Audience ช่วยให้หาเรื่องที่ต้องดู ไม่ใช่สิทธิ์หรือสถานะจริง";
var ORDER = [
	"all",
	"identity_review",
	"payment_pending",
	"active_member",
	"expiring",
	"recent_conversation",
	"no_recent_context"
];
var unavailableSegments = () => ORDER.map((id) => ({
	segment_id: id,
	label: AUDIENCE_LABELS[id],
	count: null,
	description: null,
	source_status: "unavailable",
	records: []
}));
/** DEMO / PREVIEW ONLY — ตัวอย่าง UI · ไม่ใช่ข้อมูลจริง. */
var DEMO_COUNTS = {
	all: 128,
	identity_review: 3,
	payment_pending: 5,
	active_member: 96,
	expiring: 7,
	recent_conversation: 22,
	no_recent_context: 31
};
/**
* Read audience segments. Live origins currently have no segment contract, so
* the UI must disable the selector and say the segments are waiting for real
* backend data — never show a made-up count.
*/
async function readAudienceSegments() {
	if (isPreviewRuntime()) return {
		source_status: "demo",
		segments: ORDER.map((id) => ({
			segment_id: id,
			label: AUDIENCE_LABELS[id],
			count: DEMO_COUNTS[id],
			description: null,
			source_status: "demo",
			records: []
		}))
	};
	return {
		source_status: "unavailable",
		segments: unavailableSegments()
	};
}
/**
* CLIENTS · AUDIENCE — compact segment selector.
*
* Read-only navigation aid. Counts come from the backend only; when no
* segment contract answers, the control is disabled and says so. It never
* decides membership, payment or access state.
*/
function AudienceControl({ selected, onSelect }) {
	const [state, setState] = (0, import_react.useState)(null);
	const [checking, setChecking] = (0, import_react.useState)(true);
	(0, import_react.useEffect)(() => {
		let alive = true;
		readAudienceSegments().then((s) => {
			if (alive) setState(s);
		}).finally(() => {
			if (alive) setChecking(false);
		});
		return () => {
			alive = false;
		};
	}, []);
	const disabled = checking || state?.source_status === "unavailable";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-label": "Audience",
		className: "space-y-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[15px] font-semibold",
					children: "กลุ่มลูกค้า"
				}), state?.source_status === "demo" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-[13px] text-warn",
					children: "ตัวอย่าง UI · ไม่ใช่ข้อมูลจริง"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex flex-wrap gap-2",
				children: (state?.segments ?? []).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					disabled,
					"aria-pressed": selected === s.segment_id,
					onClick: () => onSelect(s.segment_id),
					className: cn("min-h-[44px] rounded-xl border px-3.5 text-[15px] disabled:cursor-not-allowed disabled:opacity-50", selected === s.segment_id && !disabled ? "border-gold/60 bg-gold-muted font-medium" : "border-border bg-surface hover:bg-surface-2"),
					children: [s.label, s.count != null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "ml-2 text-[13px] text-muted-foreground",
						children: s.count
					})]
				}, s.segment_id))
			}),
			checking ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "กำลังตรวจสอบกลุ่มลูกค้าจากระบบหลังบ้าน"
			}) : state?.source_status === "unavailable" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "text-[13px] text-warn",
				children: "กลุ่มลูกค้ารอข้อมูลจริงจากระบบหลังบ้าน"
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: AUDIENCE_NOTE
			})
		]
	});
}
var TABS = [
	"Overview",
	"Conversation",
	"History & Work",
	"Payment & Renewal",
	"Points & Membership",
	"Access",
	"Advanced"
];
var RENEWALS = [
	"9 มี.ค. 65",
	"21 ต.ค. 66",
	"21 ต.ค. 67",
	"13 ก.ค. 68",
	"7 ก.ย. 69"
];
function Row({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-wrap justify-between gap-2 border-b border-border py-2.5 last:border-0",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[15px] text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[15px] font-medium",
			children: value
		})]
	});
}
function Panel({ title, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-2xl border border-border bg-surface p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
			className: "text-[16px] font-semibold",
			children: title
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-2",
			children
		})]
	});
}
function ClientsRoom() {
	const { q } = Route.useSearch();
	return usingDemoData() ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DemoClient360, { q }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveClient360, { q }, q);
}
function DemoClient360({ q }) {
	const [tab, setTab] = (0, import_react.useState)("Overview");
	const [segment, setSegment] = (0, import_react.useState)("all");
	const ambiguous = q.trim() !== "" && !q.includes("วินนี่");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "ลูกค้า",
		path: "/internal/admin/customer-data",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-4xl space-y-6 px-4 py-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-muted-foreground",
						children: "ชื่อที่เปอร์เรียก"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-2xl font-semibold tracking-tight",
						children: ambiguous ? q : "คุณวินนี่"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-[15px] text-muted-foreground",
						children: ambiguous ? "ยังไม่พบ canonical client record ที่ยืนยันได้" : "ยืนยัน canonical match แล้วจากระบบหลังบ้าน"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn",
						children: "ตัวอย่างเพื่อการออกแบบ · ไม่ใช่ข้อมูลจริง"
					})
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AudienceControl, {
					selected: segment,
					onSelect: setSegment
				}),
				ambiguous ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-2xl border border-warn/50 bg-warn/10 p-4",
					role: "status",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 text-warn",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
								className: "h-5 w-5",
								"aria-hidden": true
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								className: "text-[16px] font-semibold",
								children: "ต้องตรวจ identity ก่อน"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-[15px] leading-relaxed",
							children: "ชื่อที่ค้นหาตรงกับหลายรายการหรือยังไม่มีการยืนยันตัวตน จึงยังเปิดข้อมูลติดต่อภายใน การชำระเงิน หรือสิทธิ์การใช้งานไม่ได้ และยังทำรายการที่ต้องการสิทธิ์ไม่ได้"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/internal/admin/member-intelligence",
							search: {
								q: "",
								client_id: ""
							},
							className: "mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 text-[15px] font-medium hover:bg-surface-2",
							children: "เปิดตรวจ identity"
						})
					]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex flex-wrap gap-2",
						role: "tablist",
						"aria-label": "Client 360",
						children: TABS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							role: "tab",
							"aria-selected": tab === t,
							onClick: () => setTab(t),
							className: cn("min-h-[44px] rounded-xl border px-3.5 text-[15px]", tab === t ? "border-gold/60 bg-gold-muted font-medium" : "border-border bg-surface hover:bg-surface-2"),
							children: t
						}, t))
					}),
					tab === "Overview" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
								title: "สถานะวันนี้",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										label: "ชื่อที่เปอร์เรียก",
										value: "คุณวินนี่"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										label: "แพ็กเกจ",
										value: "Premium"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										label: "ยอดต่ออายุที่แจ้ง",
										value: "2,500"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										label: "หลักฐานการโอน",
										value: "ได้รับแล้ว · รอ Official Verify"
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "rounded-2xl border border-gold/50 bg-gold-muted p-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										className: "text-[16px] font-semibold",
										children: "รอการตัดสินใจของเปอร์"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-2 text-[15px] leading-relaxed",
										children: "ลูกค้าส่งหลักฐานการต่ออายุ Premium 2,500 แล้ว เมื่อยืนยันยอดอย่างเป็นทางการ ระบบ resolver และการกระทบยอด จะเป็นผู้ตัดสินสถานะสมาชิก รวมถึง Telegram และ Drive ต่อเอง หน้านี้ไม่ได้ให้สิทธิ์ใด ๆ ด้วยตัวเอง"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-3 flex flex-wrap gap-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
											to: "/internal/admin/membership-access",
											className: "inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:opacity-90",
											children: "ตรวจหลักฐานและยืนยันยอด"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											onClick: () => setTab("Conversation"),
											className: "inline-flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 text-[15px] font-medium hover:bg-surface-2",
											children: "เปิดบทสนทนาล่าสุด"
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AiAdvisory, {
								mode: "ready_for_per",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "รูปแบบการต่ออายุของลูกค้ารายนี้สม่ำเสมอ และยอดที่แจ้งตรงกับแพ็กเกจ Premium แนะนำให้ตรวจหลักฐานแล้วยืนยันยอด" })
							})
						]
					}),
					tab === "Conversation" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
						title: "บทสนทนาล่าสุด",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[15px] leading-relaxed text-muted-foreground",
							children: "แสดงบทสนทนาแบบอ่านอย่างเดียวจากระบบหลังบ้าน ร่างข้อความเป็นตัวอย่างเท่านั้น การส่งข้อความปิดอยู่ในหน้านี้"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 rounded-xl border border-border bg-surface-2 p-3 text-[15px]",
							children: ["“ได้รับสลิปแล้วครับ กำลังตรวจสอบยอดและจะแจ้งกลับอีกครั้ง”", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mt-2 block text-[13px] text-muted-foreground",
								children: "ร่างพรีวิว · การส่งถูกปิดไว้"
							})]
						})]
					}),
					tab === "History & Work" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
						title: "ประวัติงาน",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[15px] text-muted-foreground",
							children: "ประวัติงานทั้งหมดมาจากระบบหลังบ้าน หากช่วงใดไม่มีข้อมูลจะแสดงเป็นช่องว่าง ไม่มีการเดาแทน"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/internal/admin/member-intelligence",
							search: {
								q: "",
								client_id: ""
							},
							className: "mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 text-[15px] hover:bg-surface-2",
							children: "เปิด Member Intelligence"
						})]
					}),
					tab === "Payment & Renewal" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
								title: "ประวัติการต่ออายุ",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "space-y-2",
									children: RENEWALS.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
										className: "flex items-center gap-2 text-[15px]",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, {
											className: "h-4 w-4 text-verified",
											"aria-hidden": true
										}), r]
									}, r))
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
								title: "การต่ออายุปัจจุบัน",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										label: "แพ็กเกจ",
										value: "Premium"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										label: "ยอด",
										value: "2,500"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										label: "หลักฐาน",
										value: "ได้รับแล้ว"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										label: "สถานะ",
										value: "ต้อง Official Verify ก่อน"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-2 text-[13px] text-muted-foreground",
										children: "หลังยืนยัน ระบบ resolver และการกระทบยอดเป็นผู้ตัดสินผลลัพธ์"
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[15px]",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/internal/admin/payments",
									className: "text-primary underline-offset-4 hover:underline",
									children: "ดูรายการชำระเงินที่ยังจับคู่ไม่ได้"
								})
							})
						]
					}),
					tab === "Points & Membership" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
						title: "แต้มและสมาชิก",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[15px] text-muted-foreground",
							children: "สถานะสมาชิก แต้ม และวันหมดอายุ มาจาก resolver เท่านั้น หน้านี้ไม่คำนวณเองและไม่ให้สิทธิ์"
						})
					}),
					tab === "Access" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
						title: "การเข้าถึง",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[15px] text-muted-foreground",
							children: "Telegram และ Drive เป็นสถานะปลายทางที่สังเกตได้เท่านั้น ไม่ใช่การให้สิทธิ์จากหน้านี้"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/internal/admin/membership-access",
							className: "mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 text-[15px] hover:bg-surface-2",
							children: "เปิด Membership Access"
						})]
					}),
					tab === "Advanced" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
						title: "ข้อมูลติดต่อภายใน",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[15px] text-muted-foreground",
								children: "อีเมลและเบอร์โทรภายในจะแสดงเมื่อ canonical match ยืนยันแล้วเท่านั้น และแสดงเท่าที่ระบบหลังบ้านส่งมา"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								label: "Canonical match",
								value: "ยืนยันแล้ว"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								label: "แหล่งที่มา",
								value: "ระบบหลังบ้าน"
							})
						]
					})
				] })
			]
		})
	});
}
/**
* Live origin: nothing renders unless the backend returned it. No demo
* constant — no name, amount, conversation, membership, access, decision,
* evidence or contact value — is reachable from this branch.
*/
function LiveClient360({ q }) {
	const [list, setList] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [selectedId, setSelectedId] = (0, import_react.useState)(null);
	const [reload, setReload] = (0, import_react.useState)(0);
	(0, import_react.useEffect)(() => {
		const ac = new AbortController();
		setLoading(true);
		setList(null);
		setError(null);
		setSelectedId(null);
		(q.trim() ? lookupClients(q, ac.signal) : fetchRecentClients(ac.signal)).then((r) => {
			if (ac.signal.aborted) return;
			setList(r);
			setError(null);
		}).catch((e) => {
			if (ac.signal.aborted) return;
			setList(null);
			setError(e instanceof ApiError ? e : new ApiError("unavailable", 0, "unavailable"));
		}).finally(() => {
			if (!ac.signal.aborted) setLoading(false);
		});
		return () => ac.abort();
	}, [q, reload]);
	const clients = list?.clients ?? [];
	const selectableClients = clients.filter((client) => isSelectableClient(client, clients));
	const resolved = !loading && !error ? resolveSelectedClient(clients, selectedId) : void 0;
	(0, import_react.useEffect)(() => {
		if (selectedId !== null && !resolved) setSelectedId(null);
	}, [selectedId, resolved]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "ลูกค้า",
		path: "/internal/admin/customer-data",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-4xl space-y-6 px-4 py-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[13px] text-muted-foreground",
					children: "ชื่อที่เปอร์เรียก"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-2xl font-semibold tracking-tight",
					children: resolved ? displayName(resolved) : q.trim() || "ค้นหาลูกค้า"
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[15px] text-muted-foreground",
					children: [q.trim() ? "ผลการค้นหาลูกค้า" : "ลูกค้าล่าสุดจากระบบหลังบ้าน", " · เลือกรายชื่อก่อนเปิดข้อมูล"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: loading,
					onClick: () => {
						setSelectedId(null);
						setLoading(true);
						setReload((value) => value + 1);
					},
					className: "min-h-[44px] rounded-xl border border-border bg-surface px-4 text-[15px] disabled:opacity-50",
					children: "อ่านข้อมูลอีกครั้ง"
				}),
				!loading && !error && list && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
					title: q.trim() ? "ผลการค้นหา" : "ลูกค้าล่าสุด",
					children: [list.degraded_sources.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						role: "status",
						className: "mb-3 text-[13px] text-warn",
						children: "บางแหล่งข้อมูลยังไม่พร้อม รายการที่เห็นอาจไม่ครบ"
					}), list.clients.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						role: "status",
						className: "text-[15px] text-muted-foreground",
						children: q.trim() ? "ไม่พบลูกค้าที่ตรงกับคำค้น ลองชื่ออื่นหรือ Client ID" : "ยังไม่มีรายชื่อลูกค้าล่าสุดจากระบบ"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "space-y-2",
						"aria-label": "รายชื่อลูกค้า",
						children: list.clients.map((client, index) => {
							const selectable = isSelectableClient(client, clients);
							return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								disabled: !selectable,
								"aria-pressed": selectedId === client.client_id && selectable,
								onClick: () => {
									if (selectable) setSelectedId(client.client_id);
								},
								className: cn("min-h-[44px] w-full rounded-xl border p-3 text-left disabled:opacity-60", selectedId === client.client_id && selectable ? "border-gold/60 bg-gold-muted" : "border-border bg-surface hover:bg-surface-2"),
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "block text-[16px] font-medium",
										children: displayName(client)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mt-1 block text-[13px] text-muted-foreground",
										children: [client.member_id, client.client_id].filter(Boolean).join(" · ")
									}),
									!selectable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mt-1 block text-[13px] text-warn",
										children: "ต้องตรวจตัวตนก่อนเปิดข้อมูล"
									})
								]
							}) }, `${client.client_id}-${index}`);
						})
					})]
				}),
				loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: "กำลังรอข้อมูลจริงจากระบบหลังบ้าน",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[15px] text-muted-foreground",
						children: "ระบบกำลังอ่านข้อมูลลูกค้าจากแหล่งข้อมูลจริง"
					})
				}) : error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-2xl border border-warn/50 bg-warn/10 p-4",
					role: "status",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 text-warn",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
								className: "h-5 w-5",
								"aria-hidden": true
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								className: "text-[16px] font-semibold",
								children: error.kind === "unauthorized" ? "เซสชันผู้ดูแลหมดอายุ" : error.kind === "forbidden" ? "ไม่มีสิทธิ์ดูข้อมูลนี้" : error.code === "read_timeout" ? "ระบบอ่านข้อมูลนานเกินไป · ลองใหม่ได้" : "ยังดึงข้อมูลจริงไม่ได้"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-[15px] leading-relaxed",
							children: "หน้านี้จะไม่แสดงข้อมูลลูกค้า ยอดเงิน บทสนทนา สิทธิ์ หรือข้อมูลติดต่อใด ๆ จนกว่าระบบหลังบ้านจะส่งข้อมูลจริงกลับมา"
						}),
						error.kind === "unauthorized" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
							href: "/internal/admin/login?next=" + encodeURIComponent("/internal/admin/customer-data" + (q.trim() ? "?q=" + encodeURIComponent(q) : "")),
							className: "mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 text-[15px]",
							children: "เข้าสู่ระบบแล้วกลับมาดูรายนี้"
						})
					]
				}) : !resolved ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-2xl border border-warn/50 bg-warn/10 p-4",
					role: "status",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 text-warn",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
								className: "h-5 w-5",
								"aria-hidden": true
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								className: "text-[16px] font-semibold",
								children: "เลือกลูกค้าที่ต้องการดู"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-[15px] leading-relaxed",
							children: selectableClients.length > 0 ? "เลือกรายชื่อจากรายการด้านบน ระบบจะเปิดข้อมูลเฉพาะรายที่เลือก" : "หากตัวตนยังไม่ชัดเจน ให้ตรวจใน MMD Memory ก่อน"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/internal/admin/member-intelligence",
							search: {
								q: "",
								client_id: ""
							},
							className: "mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 text-[15px] font-medium hover:bg-surface-2",
							children: "ค้นหาและตรวจตัวตน"
						})
					]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
							className: "flex flex-wrap gap-3",
							"aria-label": "ทำงานต่อกับลูกค้ารายนี้",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: "/internal/admin/member-intelligence?q=" + encodeURIComponent(displayName(resolved)) + "&client_id=" + encodeURIComponent(resolved.client_id),
								className: "inline-flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 text-[15px]",
								children: "ดู Memory และประวัติของรายนี้"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: "/internal/admin/jobs/create-job?client_id=" + encodeURIComponent(resolved.client_id),
								className: "inline-flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 text-[15px]",
								children: "สร้างงานกับลูกค้ารายนี้"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
							title: "ข้อมูลที่ระบบหลังบ้านยืนยันแล้ว",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "Canonical client",
									value: resolved.client_id
								}),
								resolved.tier ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "ระดับสมาชิก",
									value: resolved.tier
								}) : null,
								resolved.membership_status ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "สถานะสมาชิก",
									value: resolved.membership_status
								}) : null,
								resolved.member_id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "Member ID",
									value: resolved.member_id
								}) : null,
								resolved.canonical_name ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "ชื่อในระบบ",
									value: resolved.canonical_name
								}) : null,
								resolved.aliases?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "ชื่อเรียกอื่น",
									value: resolved.aliases.join(" · ")
								}) : null,
								resolved.identity_status ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "สถานะตัวตน",
									value: resolved.identity_status
								}) : null,
								resolved.matched_on ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "จับคู่จาก",
									value: resolved.matched_on
								}) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-2 text-[13px] text-muted-foreground",
									children: "แสดงเฉพาะค่าที่ระบบหลังบ้านส่งมา ไม่มีการคำนวณหรือเดาแทน"
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
							title: "ช่องทางติดต่อ",
							children: [
								resolved.line_display_name ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "ชื่อบน LINE",
									value: resolved.line_display_name
								}) : null,
								resolved.phone ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "โทรศัพท์",
									value: resolved.phone
								}) : null,
								resolved.member_email ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "อีเมล",
									value: resolved.member_email
								}) : null,
								resolved.telegram_username ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "Telegram",
									value: resolved.telegram_username
								}) : null,
								!resolved.line_display_name && !resolved.phone && !resolved.member_email && !resolved.telegram_username && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[15px] text-muted-foreground",
									children: "ระบบยังไม่ได้ส่งข้อมูลติดต่อของรายนี้"
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
							title: "ประวัติและแพ็กเกจ",
							children: [
								resolved.package_code ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "แพ็กเกจ",
									value: resolved.package_code
								}) : null,
								resolved.purchased_history ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
									label: "ประวัติที่ระบบส่งมา",
									value: resolved.purchased_history
								}) : null,
								!resolved.package_code && !resolved.purchased_history && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[15px] text-muted-foreground",
									children: "ระบบยังไม่ได้ส่งประวัติหรือแพ็กเกจของรายนี้"
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Panel, {
							title: "ประวัติ การชำระเงิน และสิทธิ์",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[15px] text-muted-foreground",
								children: "กำลังรอข้อมูลจริงจากระบบหลังบ้าน ส่วนนี้จะแสดงเมื่อมีสัญญาข้อมูลจริงเท่านั้น"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 flex flex-wrap gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/internal/admin/payments",
									className: "inline-flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 text-[15px] hover:bg-surface-2",
									children: "ดูรายการชำระเงินที่ยังจับคู่ไม่ได้"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/internal/admin/membership-access",
									className: "inline-flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 text-[15px] hover:bg-surface-2",
									children: "เปิด Membership Access"
								})]
							})]
						})
					]
				})
			]
		})
	});
}
//#endregion
export { ClientsRoom as component };
