import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { i as apiGet, s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { K as ChevronDown } from "../_libs/lucide-react.mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
import { a as resolveSelectedClient, i as lookupClients, n as fetchRecentClients, r as isSelectableClient, t as displayName } from "./clients-D1ivRQGK.mjs";
import { t as Route } from "./internal.admin.member-intelligence-DDs9ZHn5.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.member-intelligence-D7OeIf_a.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Customer Memory + AI Intelligence (READ ONLY).
*
* Preferred canonical facade (AI Intelligence Contract V1):
*   GET /v1/admin/clients/intelligence?client_id=…
* Legacy fallback while the facade is not deployed:
*   GET /v1/admin/kenji/control/memory?client_id=…
*
* The backend owns all content. This adapter only normalizes the response
* into operator-readable slots. Any slot the backend does not provide stays
* empty — the UI shows "AI analysis not available yet" instead of guessing.
*
* AI slots are advisory/derived only. They are never payment, membership,
* access or entitlement authority, and this layer never derives them.
*/
var AI_MODE_LABELS = {
	auto: "Auto — AI can handle",
	ready_for_per: "Ready for Per — AI prepared, Per decides",
	per_only: "Per only — operator decision required"
};
var AI_FIELDS = [
	"ai_summary",
	"ai_notices",
	"next_best_action",
	"suggested_reply",
	"follow_up"
];
function str(v) {
	if (typeof v === "string") return v.trim() ? v.trim() : null;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return null;
}
function list(v) {
	if (Array.isArray(v)) return v.map((x) => str(x) ?? "").filter(Boolean);
	const s = str(v);
	return s ? [s] : [];
}
function humanize(key) {
	const s = key.replace(/[_.-]+/g, " ").trim();
	return s.charAt(0).toUpperCase() + s.slice(1);
}
var KNOWN = /* @__PURE__ */ new Set([
	"ok",
	"authority",
	"client_id",
	"request_id",
	"generated_at",
	"relationship",
	"relationship_summary",
	"context",
	"summary",
	"memory_summary",
	"recent",
	"recent_activity",
	"timeline",
	"events",
	"notes",
	"unresolved",
	"open_items",
	"needs_attention",
	"ai",
	"mode",
	"operating_mode",
	"reason",
	"confidence",
	"evidence_refs",
	"send_allowed",
	...AI_FIELDS
]);
function aiMode(v) {
	const s = str(v);
	return s === "auto" || s === "ready_for_per" || s === "per_only" ? s : null;
}
function confidence(v) {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
	return null;
}
function evidenceRefs(v) {
	if (!Array.isArray(v)) return [];
	const out = [];
	for (const e of v.slice(0, 12)) if (e && typeof e === "object") {
		const o = e;
		const label = str(o["label"]) ?? str(o["title"]) ?? str(o["type"]) ?? str(o["source"]);
		const ref = str(o["ref"]) ?? str(o["id"]) ?? str(o["record_id"]) ?? str(o["url"]);
		if (label || ref) out.push({
			label: label ?? "Reference",
			ref
		});
	} else {
		const s = str(e);
		if (s) out.push({
			label: s,
			ref: null
		});
	}
	return out;
}
var DEMO = {
	authority: "demo",
	contract: "demo",
	relationship: "Long-standing Privé Gold customer since 2019. Books roughly monthly, prefers evening sessions in Sukhumvit.",
	summary: "14 sessions since 2019 · last contact 6 days ago · no open payment.",
	recent: [{
		label: "Last session",
		value: "Completed · 12 days ago"
	}, {
		label: "Last message",
		value: "Asked about availability next weekend"
	}],
	aiSummary: "Reliable repeat customer, low risk. Recent interest in a weekend booking has not been answered.",
	aiNotices: ["An availability question from 6 days ago has no recorded reply."],
	nextBestAction: "Reply with weekend availability, then open Create Job if confirmed.",
	aiMode: "ready_for_per",
	aiReason: "Seeded preview text — not authoritative.",
	aiConfidence: null,
	evidenceRefs: [{
		label: "Seeded preview snapshot",
		ref: null
	}],
	suggestedReply: "Seeded preview text — not authoritative.",
	sendAllowed: false,
	followUp: "Check back in 3 days if no reply.",
	unresolved: [],
	details: [{
		label: "Memory source",
		value: "Seeded preview snapshot"
	}],
	missingAiFields: []
};
/**
* Normalize AI slots from the V1 facade (`ai.*` nested object) and, while the
* facade rolls out, the legacy flat fields on the memory response. Nested
* contract wins when both exist. Missing slots stay null — never invented.
*/
function normalizeAi(body) {
	const aiRaw = body["ai"];
	const ai = aiRaw && typeof aiRaw === "object" ? aiRaw : {};
	const nextRaw = ai["next_best_action"] ?? body["next_best_action"];
	let nextBestAction = null;
	let nestedMode = null;
	let nestedReason = null;
	let nestedConfidence = null;
	let nestedEvidence = [];
	if (nextRaw && typeof nextRaw === "object") {
		const n = nextRaw;
		nextBestAction = str(n["action"]) ?? str(n["text"]) ?? str(n["summary"]);
		nestedMode = aiMode(n["mode"]) ?? aiMode(n["operating_mode"]);
		nestedReason = str(n["reason"]);
		nestedConfidence = confidence(n["confidence"]);
		nestedEvidence = evidenceRefs(n["evidence_refs"]);
	} else nextBestAction = str(nextRaw);
	return {
		aiSummary: str(ai["summary"]) ?? str(body["ai_summary"]),
		aiNotices: list(ai["notices"]).length ? list(ai["notices"]) : list(body["ai_notices"]),
		nextBestAction,
		aiMode: nestedMode ?? aiMode(ai["mode"]) ?? aiMode(body["mode"]) ?? aiMode(body["operating_mode"]),
		aiReason: nestedReason ?? str(ai["reason"]) ?? str(body["reason"]),
		aiConfidence: nestedConfidence ?? confidence(ai["confidence"]) ?? confidence(body["confidence"]),
		evidenceRefs: nestedEvidence.length ? nestedEvidence : evidenceRefs(ai["evidence_refs"] ?? body["evidence_refs"]),
		suggestedReply: str(ai["suggested_reply"]) ?? str(body["suggested_reply"]),
		sendAllowed: ai["send_allowed"] === true || body["send_allowed"] === true,
		followUp: str(ai["follow_up"]) ?? str(body["follow_up"])
	};
}
function normalizeBody(raw, contract) {
	const inner = raw?.["data"];
	const body = inner && typeof inner === "object" ? inner : raw;
	const details = [];
	for (const [k, v] of Object.entries(body ?? {})) {
		if (KNOWN.has(k)) continue;
		const s = str(v);
		if (s) details.push({
			label: humanize(k),
			value: s
		});
	}
	const recentRaw = body["recent"] ?? body["recent_activity"] ?? body["timeline"] ?? body["events"];
	const recent = Array.isArray(recentRaw) ? recentRaw.slice(0, 12).map((e, i) => {
		if (e && typeof e === "object") {
			const o = e;
			return {
				label: str(o["date"]) ?? str(o["at"]) ?? str(o["type"]) ?? `Item ${i + 1}`,
				value: str(o["summary"]) ?? str(o["text"]) ?? str(o["note"]) ?? "—"
			};
		}
		return {
			label: `Item ${i + 1}`,
			value: str(e) ?? "—"
		};
	}) : [];
	const ai = normalizeAi(body);
	const aiContainer = body["ai"] && typeof body["ai"] === "object" ? body["ai"] : null;
	const missingAiFields = AI_FIELDS.filter((f) => {
		const inContainer = aiContainer ? aiContainer[f === "ai_summary" ? "summary" : f === "ai_notices" ? "notices" : f] !== void 0 : false;
		return body[f] === void 0 && !inContainer;
	}).map(String);
	return {
		authority: "backend",
		contract,
		relationship: str(body["relationship"]) ?? str(body["relationship_summary"]) ?? str(body["context"]),
		summary: str(body["summary"]) ?? str(body["memory_summary"]),
		recent,
		...ai,
		unresolved: [
			...list(body["unresolved"]),
			...list(body["open_items"]),
			...list(body["needs_attention"])
		],
		details,
		missingAiFields
	};
}
/**
* Fetch and normalize customer memory / AI intelligence. Production only —
* fails closed. Tries the AI Intelligence V1 facade first; if the backend
* has not deployed it yet, falls back to the legacy memory endpoint. Any
* field the backend omits stays empty and renders as unavailable.
*/
async function fetchCustomerMemory(clientId, signal) {
	if (isPreviewRuntime()) return DEMO;
	const id = encodeURIComponent(clientId);
	try {
		return normalizeBody(await apiGet(`/v1/admin/clients/intelligence?client_id=${id}`, signal), "intelligence_v1");
	} catch (err) {
		if (err instanceof Error && err.name === "ApiError") {
			const ae = err;
			if (ae.kind === "unauthorized" || ae.kind === "forbidden") throw err;
		}
		return normalizeBody(await apiGet(`/v1/admin/kenji/control/memory?client_id=${id}`, signal), "legacy_memory");
	}
}
var EM = "—";
function Status({ tone, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: `rounded-lg border px-4 py-3 text-[12px] ${tone === "ok" ? "border-gold/40 bg-gold-muted text-foreground" : tone === "warn" ? "border-warn/40 bg-warn/10 text-warn" : "border-border bg-surface-2 text-muted-foreground"}`,
		role: "status",
		children
	});
}
function Card({ title, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-lg border border-border bg-surface p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
			className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
			children: title
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-2 text-[13px] leading-relaxed",
			children
		})]
	});
}
function apiMessage(err) {
	if (!err) return null;
	if (err.kind === "unauthorized" || err.kind === "forbidden") return "Authentication required — sign in again at /internal/admin/login.";
	return `Backend unavailable — ${err.message}`;
}
function ClientRow({ c, selected, onSelect, selectable }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		disabled: !selectable,
		onClick: () => {
			if (selectable) onSelect(c);
		},
		"aria-current": selected ? "true" : void 0,
		className: `step-transition w-full rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-gold/60 bg-gold-muted" : "border-border bg-surface hover:bg-surface-2"}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "truncate text-[13px] font-medium",
				children: displayName(c)
			}), !c.canonical && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "shrink-0 rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-warn",
				children: "Identity review"
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "truncate text-[11px] text-muted-foreground",
			children: [[
				c.canonical_name,
				c.member_id,
				c.tier
			].filter(Boolean).join(" · ") || EM, !selectable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "mt-1 block text-warn",
				children: "ต้องตรวจตัวตน หรือเลือกรายที่ตรงกับลูกค้าต้นทางก่อน"
			})]
		})]
	});
}
/** One customer, read as a brief. Never a raw record dump. */
function CustomerBrief({ client }) {
	const [showDetails, setShowDetails] = (0, import_react.useState)(false);
	const memory = useQuery({
		queryKey: [
			"mmd",
			"memory",
			client.client_id
		],
		queryFn: ({ signal }) => fetchCustomerMemory(client.client_id, signal),
		enabled: client.canonical,
		retry: false,
		staleTime: 15e3
	});
	const memErr = memory.error;
	const m = memory.data;
	const aiUnavailable = "AI analysis not available yet.";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "rounded-lg border border-border bg-surface p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-lg font-semibold tracking-tight",
						children: displayName(client)
					}), client.canonical ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded border border-gold/40 bg-gold-muted px-2 py-0.5 text-[10px] uppercase tracking-wider",
						children: "Canonical client"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded border border-warn/40 bg-warn/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-warn",
						children: "Identity review"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[12px] text-muted-foreground",
					children: [
						client.canonical_name,
						client.member_id,
						client.tier,
						client.membership_status
					].filter(Boolean).join(" · ") || EM
				})]
			}),
			!client.canonical && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, {
				tone: "warn",
				children: "Identity Review — this candidate has no canonical client record. Resolve the identity in the canonical backend before acting. No customer is created here."
			}),
			client.canonical && memErr && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, {
				tone: "warn",
				children: apiMessage(memErr)
			}),
			client.canonical && memory.isPending && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, {
				tone: "muted",
				children: "Loading customer memory…"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 md:grid-cols-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
						title: "Relationship",
						children: m?.relationship ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted-foreground",
							children: EM
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
						title: "Current state",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
							className: "space-y-1 text-[12px]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["Membership: ", client.membership_status ?? EM] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["Tier: ", client.tier ?? EM] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["Package: ", client.package_code ?? EM] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["History: ", client.purchased_history ?? EM] })
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-2 text-[11px] text-muted-foreground",
							children: [
								"Shown as returned by the backend. Entitlement truth stays in",
								" ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono",
									children: "my_mmd_entitlement_resolver_v1"
								}),
								"."
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
						title: "Recent context",
						children: m?.recent.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "space-y-1 text-[12px]",
							children: m.recent.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "text-muted-foreground",
									children: [r.label, ":"]
								}),
								" ",
								r.value
							] }, `${r.label}-${i}`))
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted-foreground",
							children: m?.summary ?? EM
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
						title: "What needs attention",
						children: m?.unresolved.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "list-disc space-y-1 pl-4 text-[12px]",
							children: m.unresolved.map((u, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: u }, i))
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted-foreground",
							children: m ? "Nothing unresolved reported." : "Review required"
						})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-lg border border-gold/25 bg-gold-muted/30 p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
							children: "AI advisory"
						}),
						m?.aiMode && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "rounded border border-gold/40 bg-gold-muted px-2 py-0.5 text-[10px] uppercase tracking-wider",
							children: AI_MODE_LABELS[m.aiMode]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[10px] text-muted-foreground",
							children: "Derived insight — never payment, membership, access or entitlement authority."
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 grid gap-3 md:grid-cols-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							title: "AI summary",
							children: m?.aiSummary ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: aiUnavailable
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							title: "What AI notices",
							children: m?.aiNotices.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
								className: "list-disc space-y-1 pl-4 text-[12px]",
								children: m.aiNotices.map((n, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: n }, i))
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: aiUnavailable
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							title: "Next best action",
							children: m?.nextBestAction ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: m.nextBestAction }),
								m.aiReason && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-[12px] text-muted-foreground",
									children: ["Why: ", m.aiReason]
								}),
								m.aiConfidence != null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-[11px] text-muted-foreground",
									children: [
										"Confidence:",
										" ",
										m.aiConfidence <= 1 ? `${Math.round(m.aiConfidence * 100)}%` : `${Math.round(m.aiConfidence)}%`
									]
								}),
								m.evidenceRefs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-[11px] text-muted-foreground",
									children: [
										"Evidence:",
										" ",
										m.evidenceRefs.map((e) => e.ref ? `${e.label} (${e.ref})` : e.label).join(" · ")
									]
								})
							] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted-foreground",
								children: aiUnavailable
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
							title: "Suggested reply · follow-up",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: m?.suggestedReply ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-muted-foreground",
									children: aiUnavailable
								}) }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-[12px] text-muted-foreground",
									children: ["Follow-up: ", m?.followUp ?? "Review required"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-2 text-[11px] text-muted-foreground",
									children: [
										"Preview only — sending is disabled on this surface",
										m && !m.sendAllowed ? " (send_allowed: false)" : "",
										". Messaging stays on its canonical surface."
									]
								})
							]
						})
					]
				})]
			}),
			client.canonical && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-lg border border-border bg-surface-2 p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
						children: "Open in the canonical surface"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 flex flex-wrap gap-2 text-[12px]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: "/internal/admin/membership-access?client_id=" + encodeURIComponent(client.client_id),
								className: "rounded-md border border-border px-3 py-2 hover:bg-surface",
								children: "ตรวจสิทธิ์สมาชิก"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: "/internal/admin/jobs/create-job?client_id=" + encodeURIComponent(client.client_id),
								className: "rounded-md border border-border px-3 py-2 hover:bg-surface",
								children: "สร้างงานกับลูกค้ารายนี้"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: "/internal/admin/payments",
								className: "rounded-md border border-border px-3 py-2 hover:bg-surface",
								children: "เปิดคิวรับเงิน"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: "/internal/admin/kenji",
								className: "rounded-md border border-border px-3 py-2 hover:bg-surface",
								children: "เปิดเคนจิ"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-[11px] text-muted-foreground",
						children: "Member Intelligence understands the customer; protected actions happen on their own authoritative surface."
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-lg border border-border bg-surface",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => setShowDetails((v) => !v),
					"aria-expanded": showDetails,
					className: "flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[12px] font-medium",
					children: ["View details", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
						className: `h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`,
						"aria-hidden": true
					})]
				}), showDetails && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-2 border-t border-border px-4 py-3 text-[12px]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", {
							className: "grid gap-x-4 gap-y-1 sm:grid-cols-2",
							children: [
								["Client record", client.client_id],
								["Member id", client.member_id],
								["Identity status", client.identity_status],
								["Matched on", client.matched_on],
								["Matched value", client.matched_value],
								["Aliases", client.aliases?.join(", ")],
								["Email", client.member_email],
								["Phone", client.phone],
								["LINE display name", client.line_display_name],
								["Telegram", client.telegram_username],
								["Confidence", client.confidence != null ? String(client.confidence) : null],
								["Lineage source", client.lineage_source]
							].map(([label, value]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dt", {
									className: "text-muted-foreground",
									children: [label, ":"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
									className: "min-w-0 break-words font-mono text-[11px]",
									children: value || EM
								})]
							}, String(label)))
						}),
						m?.details.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "border-t border-border pt-2",
							children: m.details.map((d, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "font-mono text-[11px] text-muted-foreground",
								children: [
									d.label,
									": ",
									d.value
								]
							}, i))
						}) : null,
						client.warnings?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "list-disc pl-4 text-warn",
							children: client.warnings.map((w, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: w }, i))
						}) : null,
						m && m.missingAiFields.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "border-t border-border pt-2 font-mono text-[11px] text-muted-foreground",
							children: ["AI fields not returned by the backend: ", m.missingAiFields.join(", ")]
						})
					]
				})]
			})
		]
	});
}
function MemberIntelligence() {
	const preview = isPreviewRuntime();
	const { q: initialQuery, client_id: expectedClientId } = Route.useSearch();
	const [input, setInput] = (0, import_react.useState)(initialQuery);
	const [query, setQuery] = (0, import_react.useState)(initialQuery);
	const [selected, setSelected] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		setInput(initialQuery);
		setQuery(initialQuery);
		setSelected(null);
	}, [initialQuery]);
	const recent = useQuery({
		queryKey: [
			"mmd",
			"clients",
			"recent"
		],
		queryFn: ({ signal }) => fetchRecentClients(signal),
		retry: false,
		staleTime: 3e4
	});
	const search = useQuery({
		queryKey: [
			"mmd",
			"clients",
			"lookup",
			query
		],
		queryFn: ({ signal }) => lookupClients(query, signal),
		enabled: query.trim().length > 0,
		retry: false
	});
	const active = query.trim() ? search : recent;
	const err = active.error;
	const clients = active.data?.clients ?? [];
	const candidate = !active.isFetching && !err ? resolveSelectedClient(clients, selected?.client_id ?? null) : void 0;
	const resolved = candidate && (!expectedClientId || candidate.client_id === expectedClientId) ? candidate : void 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "Member Intelligence",
		path: "/internal/admin/member-intelligence",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-5xl space-y-5 px-4 py-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-xl font-semibold tracking-tight",
					children: "Who is this customer?"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 max-w-2xl text-[13px] text-muted-foreground",
					children: "Search by the name you remember. Read-only — this surface never changes membership, payments, points, access or entitlement."
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "flex gap-2",
					onSubmit: (e) => {
						e.preventDefault();
						setSelected(null);
						setQuery(input);
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: input,
							onChange: (e) => setInput(e.target.value),
							placeholder: "Remembered name, alias, phone, email or member id",
							"aria-label": "Search customers",
							className: "min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							className: "rounded-md border border-gold/50 bg-gold-muted px-4 py-2 text-[13px] font-medium",
							children: "Search"
						}),
						query && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								setInput("");
								setQuery("");
							},
							className: "rounded-md border border-border px-3 py-2 text-[13px]",
							children: "Clear"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "space-y-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
							children: query.trim() ? "Search results" : "Recent customers"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[10px] text-muted-foreground",
							children: active.data?.authority === "backend" ? "Live backend · read-only" : preview ? "Demo data · not authoritative" : "Checking"
						})]
					}), err ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, {
						tone: "warn",
						children: apiMessage(err)
					}) : active.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, {
						tone: "muted",
						children: "Loading customers…"
					}) : clients.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, {
						tone: "warn",
						children: "Identity Review — no canonical customer matched. Nothing is guessed and no customer is created here."
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						active.data?.no_canonical_match && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, {
							tone: "warn",
							children: "Identity Review — no canonical client record in these results."
						}),
						(active.data?.degraded_sources.length ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Status, {
							tone: "warn",
							children: [
								"Some identity sources are degraded: ",
								active.data?.degraded_sources.join(", "),
								"."
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid gap-2 sm:grid-cols-2",
							children: clients.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClientRow, {
								c,
								selected: resolved?.client_id === c.client_id,
								selectable: isSelectableClient(c, clients) && (!expectedClientId || c.client_id === expectedClientId),
								onSelect: setSelected
							}, c.client_id || displayName(c)))
						})
					] })]
				}),
				resolved ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerBrief, { client: resolved }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, {
					tone: "muted",
					children: "Select a customer to see their brief."
				})
			]
		})
	});
}
//#endregion
export { MemberIntelligence as component };
