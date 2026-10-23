import { a as apiPost, i as apiGet, s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/clients-D1ivRQGK.js
/**
* Member Intelligence — canonical client discovery (READ ONLY).
*
* Endpoints (same-origin, credentials included, no-store):
* - GET  /v1/admin/clients/recent
* - POST /v1/admin/clients/lineage-lookup   { query }
*
* The backend owns identity resolution. Nothing here merges, ranks or
* fabricates a customer; ambiguous or non-canonical results stay flagged.
*/
function isCanonicalId(id) {
	return typeof id === "string" && /^rec[A-Za-z0-9]{6,}$/.test(id);
}
/** Identity review flags are discovery evidence, never permission to open details. */
function isSelectableClient(client, clients) {
	return client.canonical && isCanonicalId(client.client_id) && !client.manual_public_only && client.identity_status !== "needs_review" && clients.filter((candidate) => candidate.client_id === client.client_id).length === 1;
}
/** Revalidate against the current payload; never retain an old customer object. */
function resolveSelectedClient(clients, selectedId) {
	const client = clients.find((candidate) => candidate.client_id === selectedId);
	return client && isSelectableClient(client, clients) ? client : void 0;
}
/** Best operator-readable label. Remembered name first — Per's own language. */
function displayName(c) {
	return c.remembered_name?.trim() || c.canonical_name?.trim() || c.client_name?.trim() || c.line_display_name?.trim() || "Unnamed customer";
}
function toClient(raw) {
	const id = typeof raw["client_id"] === "string" ? raw["client_id"] : "";
	return {
		...raw,
		client_id: id,
		canonical: isCanonicalId(id) && (raw["canonical"] === void 0 || raw["canonical"] === true)
	};
}
function unwrap(data) {
	const inner = data?.["data"];
	return inner && typeof inner === "object" ? inner : data;
}
function normalizeList(data) {
	const src = unwrap(data);
	const arrays = [
		"records",
		"results",
		"items"
	].map((k) => src[k]).filter((v) => Array.isArray(v));
	const list = arrays.find((a) => a.length > 0) ?? arrays[0] ?? [];
	const clients = (Array.isArray(list) ? list : []).map((r) => toClient(r ?? {}));
	return {
		authority: "backend",
		clients,
		degraded_sources: Array.isArray(src["degraded_sources"]) ? src["degraded_sources"] : [],
		no_canonical_match: src["no_canonical_match"] === true || clients.every((c) => !c.canonical)
	};
}
var DEMO = [
	{
		client_id: "recCL000412Nuey",
		canonical: true,
		remembered_name: "คุณหนุ่ย",
		canonical_name: "Nattapong Sirichai",
		aliases: ["หนุ่ย", "Nuey"],
		matched_on: "per_alias",
		matched_value: "คุณหนุ่ย",
		member_id: "MMD-2019-0087",
		member_email: "n.sirichai@example.com",
		phone: "+66 8x-xxx-4412",
		line_display_name: "N.",
		telegram_username: "@nuey_s",
		tier: "Privé Gold",
		membership_status: "Active",
		package_code: "PRV-G12",
		purchased_history: "14 sessions since 2019",
		identity_status: "verified",
		confidence: .97,
		lineage_source: "LINE OFC → Clients[rec…]"
	},
	{
		client_id: "recCL000903Wichai",
		canonical: true,
		remembered_name: "เฮียตี๋",
		canonical_name: "Wichai Tanthapanich",
		aliases: ["ตี๋"],
		member_id: "MMD-2020-0155",
		tier: "Privé Black",
		membership_status: "Active",
		identity_status: "verified",
		confidence: .95,
		lineage_source: "canonical_client"
	},
	{
		client_id: "CL-PUB-3391",
		canonical: false,
		client_name: "หนุ่ย (public form)",
		matched_on: "historical_alias",
		matched_value: "หนุ่ย",
		identity_status: "needs_review",
		confidence: .33,
		lineage_source: "public_intake_form",
		warnings: ["Public-only candidate — no canonical client record linked."]
	}
];
var demoList = (clients) => ({
	authority: "demo",
	clients,
	degraded_sources: [],
	no_canonical_match: clients.every((c) => !c.canonical)
});
/** GET /v1/admin/clients/recent */
async function fetchRecentClients(signal) {
	if (isPreviewRuntime()) return demoList(DEMO);
	return normalizeList(await apiGet("/v1/admin/clients/recent", signal));
}
/** POST /v1/admin/clients/lineage-lookup — remembered name first. */
async function lookupClients(query, signal) {
	const q = query.trim();
	if (isPreviewRuntime()) {
		const hay = (c) => [
			c.remembered_name,
			c.canonical_name,
			c.client_name,
			c.member_id,
			c.phone,
			c.member_email,
			...c.aliases ?? []
		].filter(Boolean).join(" ").toLowerCase();
		return demoList(DEMO.filter((c) => hay(c).includes(q.toLowerCase())));
	}
	return normalizeList(await apiPost("/v1/admin/clients/lineage-lookup", { query: q }, signal));
}
//#endregion
export { resolveSelectedClient as a, lookupClients as i, fetchRecentClients as n, isSelectableClient as r, displayName as t };
