import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { i as apiGet, s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { i as MMS_ITEMS, n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.mms.index-BYW_B9OA.js
var import_jsx_runtime = require_jsx_runtime();
/**
* MMS / MALE MASSAGE — first-class operational domain.
*
* Read-only for this phase. MMS records, matching, deposits and service state
* are owned by the MMS Workers behind the same-origin /v1/admin/mms/* family.
* Nothing here shares MMD Privé membership logic and nothing is inferred in
* the browser; missing values stay missing so the UI can fail closed.
*/
var DEMO_OVERVIEW = {
	authority: "demo",
	metrics: [
		{
			key: "requests_open",
			label: "Open booking requests",
			value: "3"
		},
		{
			key: "needs_match",
			label: "Needing therapist match",
			value: "2"
		},
		{
			key: "deposits_pending",
			label: "Deposits pending",
			value: "1"
		},
		{
			key: "therapists_ready",
			label: "Therapists ready",
			value: "7"
		},
		{
			key: "applications_review",
			label: "Applications in review",
			value: "2"
		},
		{
			key: "cases_open",
			label: "Open customer cases",
			value: "1"
		}
	]
};
function humanize(key) {
	const s = key.replace(/[_.-]+/g, " ").trim();
	return s.charAt(0).toUpperCase() + s.slice(1);
}
function scalar(value) {
	if (typeof value === "string") return value.length ? value : null;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return null;
}
var ENVELOPE = /* @__PURE__ */ new Set([
	"ok",
	"authority",
	"source_of_truth",
	"generated_at",
	"request_id"
]);
/** GET /v1/admin/mms/overview — real MMS state on production only. */
async function fetchMmsOverview(signal) {
	if (isPreviewRuntime()) return DEMO_OVERVIEW;
	const raw = await apiGet("/v1/admin/mms/overview", signal);
	const body = raw && typeof raw["data"] === "object" && raw["data"] !== null ? raw["data"] : raw;
	const metrics = [];
	for (const [key, value] of Object.entries(body ?? {})) {
		if (ENVELOPE.has(key)) continue;
		const v = scalar(value);
		if (v === null) continue;
		metrics.push({
			key,
			label: humanize(key),
			value: v
		});
	}
	return {
		authority: "backend",
		metrics
	};
}
function MmsOverviewPage() {
	const preview = isPreviewRuntime();
	const overview = useQuery({
		queryKey: [
			"mmd",
			"mms",
			"overview"
		],
		queryFn: ({ signal }) => fetchMmsOverview(signal),
		retry: false,
		staleTime: 15e3
	});
	const err = overview.error;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "MMS Overview",
		path: "/internal/admin/mms",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-5xl space-y-6 px-4 py-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-xl font-semibold tracking-tight",
					children: "MMS · Male Massage"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 max-w-2xl text-[13px] text-muted-foreground",
					children: "A separate operating domain with its own customers, therapists, bookings and payments. MMS records never share MMD Privé membership logic, and every state shown here is decided by the backend."
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-2xl border border-gold/40 bg-gold-muted p-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center justify-between gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								className: "text-[17px] font-semibold",
								children: "HENNA · MMS Specialist"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[13px] text-muted-foreground",
								children: "MMS specialist concierge/persona"
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-full border border-border px-2.5 py-1 font-mono text-[12px] text-muted-foreground",
								children: overview.data?.metrics.some((metric) => [
									"henna_health",
									"mms_system_state",
									"mms_backend_state"
								].includes(metric.key)) ? "MMS BACKEND STATE" : "CHECK VIA MMS"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 grid gap-2 text-[14px] sm:grid-cols-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Application routing" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Manual / recovery handoff" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Telegram Ops delivery through telegram-worker" })
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-[13px] text-muted-foreground",
							children: "Final MMS authority remains mms-worker and authorized operators. HENNA does not approve Therapist readiness or Matching."
						})
					]
				}),
				err ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-[12px] text-warn",
					role: "status",
					children: err.kind === "unauthorized" || err.kind === "forbidden" ? "Authentication required — your operator session is not active or has expired." : `Backend unavailable — ${err.message} No data is shown.`
				}) : overview.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12px] text-muted-foreground",
					role: "status",
					children: "Checking MMS state…"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
								children: "MMS state"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[10px] text-muted-foreground",
								children: overview.data?.authority === "backend" ? "Live backend · read-only" : "Demo data · not authoritative"
							})]
						}),
						overview.data && overview.data.metrics.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
							children: overview.data.metrics.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-lg border border-border bg-surface p-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[11px] uppercase tracking-wider text-muted-foreground",
									children: m.label
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-[18px] font-semibold",
									children: m.value ?? "—"
								})]
							}, m.key))
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12px] text-muted-foreground",
							children: "No MMS values returned by the backend yet."
						}),
						preview && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[11px] text-muted-foreground",
							children: "Preview shows seeded values only. MMS confirmations, matching and deposit actions stay disabled here."
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "grid gap-3 sm:grid-cols-2",
					children: MMS_ITEMS.filter((i) => i.to !== "/internal/admin/mms").map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: m.to,
						className: "step-transition block rounded-lg border border-border bg-surface p-4 outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[15px] font-semibold",
								children: m.label
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[10px] text-muted-foreground",
								children: m.code
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[12px] text-muted-foreground",
							children: m.description
						})]
					}, m.code))
				})
			]
		})
	});
}
//#endregion
export { MmsOverviewPage as component };
