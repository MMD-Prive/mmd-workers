import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { a as useQueryClient } from "../_libs/tanstack__react-query.mjs";
import { a as resolveSelectedClient, i as lookupClients, r as isSelectableClient, t as displayName } from "./clients-D1ivRQGK.mjs";
import { i as jobsQueryOptions } from "./jobs-DEY8sWDt.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/CustomerIdentityAction-DeT6j4Ki.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function hasLinkedCustomer(id) {
	return typeof id === "string" && /^rec[A-Za-z0-9]{14,30}$/.test(id);
}
/** Accept only the customer identity link, never a payment or model URL. */
function customerIdentityUrl(value, sessionId, now = Date.now()) {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		if (url.origin !== "https://miniapp.line.me" || url.pathname !== "/2010862595-yT4DCEMc/" || url.username || url.password || url.hash) return null;
		if (url.searchParams.get("intent") !== "status" || url.searchParams.get("view") !== "jobs") return null;
		if ([...url.searchParams.keys()].some((key) => ![
			"intent",
			"view",
			"job_claim"
		].includes(key)) || [...url.searchParams].length !== 3) return null;
		const token = url.searchParams.get("job_claim") || "";
		if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
		const part = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
		const claims = JSON.parse(atob(part + "=".repeat((4 - part.length % 4) % 4)));
		if (claims.kind !== "mmd_job_identity_claim_v1" || claims.role !== "customer" || claims.session_id !== sessionId || typeof claims.exp !== "number" || claims.exp <= now / 1e3) return null;
		return url.toString();
	} catch {
		return null;
	}
}
async function issueCustomerIdentityLink(sessionId) {
	if (isPreviewRuntime()) throw new Error("หน้าตัวอย่างไม่ออกลิงก์จริง");
	const res = await fetch("/v1/admin/job/create", {
		method: "POST",
		credentials: "include",
		cache: "no-store",
		headers: {
			"content-type": "application/json",
			accept: "application/json"
		},
		body: JSON.stringify({
			operational_create_mode: "issue_identity_links",
			session_id: sessionId
		})
	});
	const body = await res.json().catch(() => null);
	if (res.status === 401 || res.status === 403) throw new Error("เซสชันหมดอายุหรือไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่");
	if (!res.ok || body?.ok !== true || body.session_id !== sessionId) throw new Error("ออกลิงก์ผูกลูกค้าไม่ได้ กรุณาตรวจสถานะงานล่าสุด");
	const url = customerIdentityUrl(body.customer_identity_url, sessionId);
	if (!url) throw new Error("ระบบไม่ได้ส่งลิงก์ผูกลูกค้าที่ใช้ได้ กรุณาตรวจสถานะงานล่าสุด");
	return url;
}
/** Reuse the owner/admin held-job reconciliation contract. Never creates a client. */
async function bindExistingCustomer(sessionId, clientId) {
	if (isPreviewRuntime()) throw new Error("หน้าตัวอย่างไม่ผูกข้อมูลจริง");
	if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(sessionId) || !hasLinkedCustomer(clientId)) throw new Error("ข้อมูลลูกค้าหรืองานไม่ถูกต้อง");
	const res = await fetch("/v1/admin/job/create", {
		method: "POST",
		credentials: "include",
		cache: "no-store",
		headers: {
			"content-type": "application/json",
			accept: "application/json"
		},
		body: JSON.stringify({
			operational_create_mode: "reconcile_held",
			session_id: sessionId,
			client_record_id: clientId
		})
	}).catch(() => {
		throw new Error("ยังยืนยันผลการผูกไม่ได้ กรุณาตรวจสถานะล่าสุดก่อนส่งคำขอใหม่");
	});
	const body = await res.json().catch(() => null);
	if (!res.ok || body?.ok !== true || body.session_id !== sessionId) throw new Error("ยังยืนยันผลการผูกไม่ได้ กรุณาตรวจสถานะล่าสุด งานอาจยังรอข้อมูลหรือสิทธิ์เพิ่มเติม");
}
function ManualCustomerBinding({ sessionId, onBound, onBusyChange }) {
	const qc = useQueryClient();
	const lock = (0, import_react.useRef)(false);
	const [query, setQuery] = (0, import_react.useState)("");
	const [rows, setRows] = (0, import_react.useState)([]);
	const [selected, setSelected] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [attempted, setAttempted] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	const [searched, setSearched] = (0, import_react.useState)(false);
	const chosen = resolveSelectedClient(rows, selected);
	const valid = chosen && hasLinkedCustomer(chosen.client_id);
	async function search() {
		if (lock.current || query.trim().length < 2 || attempted) return;
		lock.current = true;
		setBusy(true);
		onBusyChange(true);
		setRows([]);
		setSelected(null);
		setSearched(false);
		setError("");
		try {
			const result = await lookupClients(query);
			setRows(result.clients);
			setSearched(true);
		} catch {
			setError("ค้นลูกค้าไม่ได้ กรุณาตรวจสิทธิ์หรือเชื่อมต่อใหม่");
		} finally {
			lock.current = false;
			setBusy(false);
			onBusyChange(false);
		}
	}
	async function bind() {
		if (lock.current || !valid || attempted) return;
		lock.current = true;
		setBusy(true);
		onBusyChange(true);
		setError("");
		try {
			const result = await lookupClients(query);
			const current = resolveSelectedClient(result.clients, selected);
			if (!current || !hasLinkedCustomer(current.client_id)) throw Error("ผลค้นหาลูกค้าเปลี่ยนไป กรุณาค้นหาและเลือกใหม่");
			const jobs = await qc.fetchQuery(jobsQueryOptions({ session_id: sessionId }));
			if (jobs.jobs?.length !== 1 || jobs.jobs[0].client_id) throw Error("สถานะลูกค้าของงานเปลี่ยนไป กรุณาตรวจสถานะล่าสุดก่อน");
			setAttempted(true);
			await bindExistingCustomer(sessionId, current.client_id);
			await onBound();
		} catch (e) {
			setError(e instanceof Error ? e.message : "ยังยืนยันการผูกลูกค้าไม่ได้ กรุณาตรวจสถานะล่าสุด");
		} finally {
			lock.current = false;
			setBusy(false);
			onBusyChange(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "space-y-3 rounded-lg border border-primary/40 bg-surface p-3",
		"aria-label": "เลือกลูกค้าจาก Airtable",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[14px] font-semibold",
				children: "ผูกเองจาก Airtable"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "block text-[14px]",
				children: ["LINE ID / ชื่อ Per rename", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value: query,
					maxLength: 180,
					disabled: busy || attempted,
					onChange: (e) => {
						setQuery(e.target.value);
						setRows([]);
						setSelected(null);
						setSearched(false);
					},
					className: "mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-[15px]",
					placeholder: "พิมพ์ชื่อที่เปอร์จำได้ หรือ LINE ID"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: search,
				disabled: busy || attempted || query.trim().length < 2,
				className: "min-h-11 rounded-lg border border-border bg-background px-3 text-[14px] disabled:opacity-40",
				children: "ค้นลูกค้าใน Airtable"
			}),
			searched && !rows.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "text-[14px]",
				children: "ไม่พบลูกค้าที่ผูกได้ ลองชื่ออื่นหรือตรวจข้อมูลลูกค้าใน Airtable"
			}),
			rows.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "space-y-2",
				children: rows.map((client, i) => {
					const selectable = hasLinkedCustomer(client.client_id) && isSelectableClient(client, rows);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						disabled: busy || attempted || !selectable,
						"aria-pressed": selected === client.client_id,
						onClick: () => setSelected(client.client_id),
						className: `min-h-11 w-full rounded-lg border p-3 text-left text-[14px] disabled:opacity-40 ${selected === client.client_id ? "border-primary bg-primary/10" : "border-border bg-background"}`,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block font-medium",
								children: displayName(client)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block break-words text-[12px] text-muted-foreground",
								children: [
									client.line_display_name,
									client.member_id,
									client.client_id
								].filter(Boolean).join(" · ")
							}),
							!selectable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block text-[12px]",
								children: "ข้อมูลยังไม่พร้อมผูก กรุณาตรวจรายการลูกค้าก่อน"
							})
						]
					}) }, `${client.client_id}-${i}`);
				})
			}),
			valid && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[14px]",
					children: [
						"ผูก ",
						displayName(chosen),
						" กับงาน ",
						sessionId,
						" โดยใช้ลูกค้า record เดิม เมื่อข้อมูลครบ ระบบจะดำเนินขั้นตอนงานต่อ ยังไม่อนุมัติเงินจากสลิป"
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: bind,
					disabled: busy || attempted,
					className: "min-h-11 rounded-lg bg-primary px-3 text-[14px] font-medium text-primary-foreground disabled:opacity-40",
					children: busy ? "กำลังผูก…" : "ยืนยันผูกลูกค้ากับงานนี้"
				})]
			}),
			attempted && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "text-[14px]",
				children: "ส่งคำขอผูกแล้ว ใช้ปุ่มตรวจสถานะลูกค้าล่าสุดด้านบนก่อนดำเนินการต่อ"
			}),
			error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "text-[14px] text-destructive",
				children: error
			})
		]
	});
}
/** This panel never reads or displays customer_payment_url / confirmation URLs. */
function CustomerIdentityAction({ sessionId, onVerified }) {
	const qc = useQueryClient();
	const lock = (0, import_react.useRef)(false);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [manualBusy, setManualBusy] = (0, import_react.useState)(false);
	const [missing, setMissing] = (0, import_react.useState)(false);
	const [linked, setLinked] = (0, import_react.useState)(false);
	const [url, setUrl] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)("");
	const [copied, setCopied] = (0, import_react.useState)(false);
	async function check() {
		if (lock.current) return;
		lock.current = true;
		setBusy(true);
		setError("");
		setUrl(null);
		setLinked(false);
		setMissing(false);
		onVerified(null);
		try {
			const result = await qc.fetchQuery(jobsQueryOptions({ session_id: sessionId }));
			if (result.jobs?.length !== 1) throw Error("ไม่พบงานที่ระบุ กรุณาตรวจเลขงานอีกครั้ง");
			const client = result.jobs[0].client_id;
			const ready = hasLinkedCustomer(client);
			setLinked(ready);
			setMissing(!ready);
			onVerified(ready ? sessionId : null);
		} catch {
			setError("ตรวจลูกค้าของงานนี้ไม่ได้ กรุณาตรวจเลขงานและสิทธิ์เข้าใช้งาน แล้วลองตรวจใหม่");
		} finally {
			lock.current = false;
			setBusy(false);
		}
	}
	async function issue() {
		if (lock.current || !missing) return;
		lock.current = true;
		setBusy(true);
		setError("");
		setUrl(null);
		setCopied(false);
		try {
			setUrl(await issueCustomerIdentityLink(sessionId));
		} catch (e) {
			setError(e instanceof Error ? e.message : "ออกลิงก์ผูกลูกค้าไม่ได้");
		} finally {
			lock.current = false;
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "space-y-2 rounded-lg border border-border bg-background p-3",
		"aria-label": "ผูกลูกค้ากับงาน",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[14px] font-medium",
				children: "ผูกลูกค้ากับงานนี้ก่อนตรวจรับเงิน"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: check,
				disabled: busy || manualBusy,
				className: "min-h-11 rounded-lg border border-border bg-surface px-3 text-[14px] disabled:opacity-40",
				children: busy ? "กำลังตรวจ…" : "ตรวจสถานะลูกค้าล่าสุด"
			}),
			linked && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "text-[14px]",
				children: "งานนี้ผูกลูกค้าแล้ว ตรวจสลิปและประเภทเงินก่อนอนุมัติ"
			}),
			missing && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[14px]",
					children: "งานนี้ยังไม่ผูกลูกค้า เลือกผูกเองจาก Airtable หรือให้ลูกค้ายืนยันผ่าน LINE"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ManualCustomerBinding, {
					sessionId,
					onBound: check,
					onBusyChange: setManualBusy
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[13px] text-muted-foreground",
					children: "หรือส่งลิงก์ให้ลูกค้ายืนยันเองผ่าน LINE"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: issue,
					disabled: busy || manualBusy,
					className: "min-h-11 rounded-lg bg-primary px-3 text-[14px] font-medium text-primary-foreground disabled:opacity-40",
					children: "ออกลิงก์ผูกลูกค้า"
				})
			] }),
			url && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2 rounded-lg border border-primary/40 p-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[14px] font-medium",
						children: "ลิงก์ผูกลูกค้า · ยืนยันตัวตนผ่าน LINE"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-muted-foreground",
						children: "ส่งให้ลูกค้าของงานนี้ การออกลิงก์ยังไม่ถือว่าผูกสำเร็จ"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: async () => {
							try {
								await navigator.clipboard.writeText(url);
								setCopied(true);
							} catch {
								setError("คัดลอกไม่สำเร็จ กรุณาเปิดลิงก์แล้วคัดลอกจากเบราว์เซอร์");
							}
						},
						className: "min-h-11 rounded-lg bg-primary px-3 text-[14px] font-medium text-primary-foreground",
						children: copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์ผูกลูกค้า"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: url,
						target: "_blank",
						rel: "noopener noreferrer",
						className: "ml-3 inline-flex min-h-11 items-center text-primary underline",
						children: "เปิดลิงก์ ↗"
					})
				]
			}),
			error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "text-[14px] text-destructive",
				children: error
			})
		]
	});
}
//#endregion
export { hasLinkedCustomer as n, CustomerIdentityAction as t };
