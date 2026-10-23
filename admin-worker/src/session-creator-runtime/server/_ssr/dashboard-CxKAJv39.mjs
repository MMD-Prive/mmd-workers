import { i as apiGet, s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/dashboard-CxKAJv39.js
/**
* Control Room dashboard state.
*
* Read-only. No field is invented: the adapter surfaces exactly the scalar
* entries the Worker returns and nothing is computed, inferred or defaulted in
* the browser. Missing values stay missing so the UI can render "—" / Checking.
*/
var DEMO_STATE = {
	authority: "demo",
	metrics: [
		{
			key: "sessions_today",
			label: "Sessions today",
			value: "3"
		},
		{
			key: "sessions_pending",
			label: "Pending review",
			value: "1"
		},
		{
			key: "members_active",
			label: "Active members",
			value: "128"
		},
		{
			key: "protocols_draft",
			label: "Protocols in draft",
			value: "9"
		}
	],
	notes: [{
		key: "source",
		label: "Source",
		value: "Seeded preview data"
	}],
	concierges: {
		hype: null,
		henna: null
	}
};
function humanize(key) {
	const s = key.replace(/[_.-]+/g, " ").trim();
	return s.charAt(0).toUpperCase() + s.slice(1);
}
function scalar(value) {
	if (value === null || value === void 0) return null;
	if (typeof value === "string") return value.length ? value : null;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return null;
}
var ENVELOPE_KEYS = /* @__PURE__ */ new Set([
	"ok",
	"authority",
	"source_of_truth",
	"generated_at",
	"request_id"
]);
var HEALTH_VALUES = /* @__PURE__ */ new Set([
	"configured",
	"partial",
	"degraded",
	"unavailable"
]);
function projection(value, sourceKey) {
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		return HEALTH_VALUES.has(normalized) ? {
			status: normalized,
			detail: null,
			sourceKey
		} : null;
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value;
	const rawStatus = [
		record["status"],
		record["state"],
		record["health"]
	].find((entry) => typeof entry === "string");
	if (!rawStatus) return null;
	const normalized = rawStatus.trim().toLowerCase();
	if (!HEALTH_VALUES.has(normalized)) return null;
	return {
		status: normalized,
		detail: [
			record["summary"],
			record["detail"],
			record["message"]
		].find((entry) => typeof entry === "string" && entry.length > 0) ?? null,
		sourceKey
	};
}
function firstProjection(body, keys) {
	for (const key of keys) {
		const candidate = projection(body[key], key);
		if (candidate) return candidate;
	}
	return null;
}
/** GET /v1/admin/dashboard — real Control Room state on production. */
async function fetchDashboard(signal) {
	if (isPreviewRuntime()) return DEMO_STATE;
	const raw = await apiGet("/v1/admin/dashboard", signal);
	const body = raw && typeof raw["data"] === "object" && raw["data"] !== null ? raw["data"] : raw;
	const metrics = [];
	const notes = [];
	for (const [key, value] of Object.entries(body ?? {})) {
		const v = scalar(value);
		if (v === null) continue;
		const entry = {
			key,
			label: humanize(key),
			value: v
		};
		if (ENVELOPE_KEYS.has(key)) notes.push(entry);
		else metrics.push(entry);
	}
	for (const key of ENVELOPE_KEYS) {
		const v = scalar(raw?.[key]);
		if (v !== null && !notes.some((n) => n.key === key)) notes.push({
			key,
			label: humanize(key),
			value: v
		});
	}
	return {
		authority: "backend",
		metrics,
		notes,
		concierges: {
			hype: firstProjection(body, [
				"telegram_router_health",
				"hype_operational_status",
				"hype_coverage"
			]),
			henna: firstProjection(body, [
				"henna_health",
				"mms_system_state",
				"mms_backend_state"
			])
		}
	};
}
//#endregion
export { fetchDashboard as t };
