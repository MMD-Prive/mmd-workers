import { i as apiGet, s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
import { w as useHydrated } from "../_libs/@tanstack/react-router+[...].mjs";
import { r as useQuery } from "../_libs/tanstack__react-query.mjs";
import { t as fetchDashboard } from "./dashboard-CxKAJv39.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/owner-snapshot-BtaivETD.js
/**
* Owner snapshot fetcher — Fast App Runtime V1.
*
* Prefers the lightweight `GET /v1/internal/owner/snapshot`
* (schema `mmd.internal.owner.snapshot.v1`) for owner shortcut counts and the
* fast dashboard shell. Falls back to `GET /v1/admin/dashboard` only when the
* lightweight endpoint is unavailable, not deployed yet, or returns an
* unexpected schema.
*
* Auth failures (401/403) are NEVER swallowed into the fallback — they
* propagate so the caller can clear the cache and fail closed.
*
* Missing/unverified counts stay missing; nothing is coerced to a fake 0.
*/
var LIGHT_PATH = "/v1/internal/owner/snapshot";
var LIGHT_SCHEMA = "mmd.internal.owner.snapshot.v1";
/** Fixed count keys the lightweight endpoint may return. */
var OWNER_SNAPSHOT_COUNT_KEYS = [
	"payment_slip_inbox",
	"money_control",
	"model_assets_pending",
	"jobs_need_confirm",
	"membership_review",
	"historical_recovery"
];
var COUNT_LABELS = {
	payment_slip_inbox: "Payment slip inbox",
	money_control: "Money control",
	model_assets_pending: "Model assets pending",
	jobs_need_confirm: "Jobs need confirm",
	membership_review: "Membership review",
	historical_recovery: "Historical recovery"
};
function boundedCount(value) {
	if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 999999) return String(value);
	if (typeof value === "string" && /^\d{1,6}$/.test(value)) return value;
	return null;
}
/**
* Parse the lightweight envelope. Returns null when the schema is missing or
* unexpected so the caller falls back to the dashboard endpoint.
*/
function parseLightSnapshot(raw) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const envelope = raw;
	const body = envelope["data"] && typeof envelope["data"] === "object" && !Array.isArray(envelope["data"]) ? envelope["data"] : envelope;
	if ((typeof body["schema"] === "string" ? body["schema"] : envelope["schema"]) !== LIGHT_SCHEMA) return null;
	const counts = body["counts"] && typeof body["counts"] === "object" && !Array.isArray(body["counts"]) ? body["counts"] : body;
	const metrics = [];
	for (const key of OWNER_SNAPSHOT_COUNT_KEYS) {
		const v = boundedCount(counts[key]);
		if (v === null) continue;
		metrics.push({
			key,
			label: COUNT_LABELS[key] ?? key,
			value: v
		});
	}
	const notes = [{
		key: "schema",
		label: "Schema",
		value: LIGHT_SCHEMA
	}];
	const generatedAt = body["generated_at"] ?? envelope["generated_at"];
	if (typeof generatedAt === "string" && generatedAt.length > 0) notes.push({
		key: "generated_at",
		label: "Generated at",
		value: generatedAt
	});
	return {
		authority: "backend",
		metrics,
		notes,
		concierges: {
			hype: null,
			henna: null
		}
	};
}
/**
* Fetch the owner snapshot: lightweight endpoint first, dashboard fallback.
* Throws ApiError only when both fail or on auth failure (no fallback then).
*/
async function fetchOwnerSnapshot(signal) {
	if (isPreviewRuntime()) return fetchDashboard(signal);
	try {
		const parsed = parseLightSnapshot(await apiGet(LIGHT_PATH, signal));
		if (parsed) return parsed;
	} catch (e) {
		const kind = e?.kind;
		if (kind === "unauthorized" || kind === "forbidden") throw e;
	}
	return fetchDashboard(signal);
}
/**
* Owner snapshot — Fast App Runtime V1 ("เร็วตอนดู / จริงตอนตัดสินใจ").
*
* Single shared read of GET /v1/admin/dashboard for every owner surface.
* - In-memory (TanStack Query) + sessionStorage cache, max 2 minutes old.
* - Stale-while-revalidate: cached snapshot renders instantly, refetch runs in background.
* - Cache is UI advisory ONLY. It never feeds payment, entitlement, job, access or
*   model decisions; every authority action still calls the Worker fresh.
* - Preview/demo snapshots are never persisted. Errors are never cached.
*/
var OWNER_SNAPSHOT_KEY = ["mmd", "dashboard"];
var STORE_KEY = "mmd.owner-snapshot.v1";
var MAX_AGE_MS = 12e4;
var STALE_MS = 15e3;
function readCache() {
	if (typeof window === "undefined" || isPreviewRuntime()) return void 0;
	try {
		const raw = window.sessionStorage.getItem(STORE_KEY);
		if (!raw) return void 0;
		const s = JSON.parse(raw);
		if (!s || typeof s.savedAt !== "number" || s.data?.authority !== "backend") return void 0;
		if (Date.now() - s.savedAt > MAX_AGE_MS) return void 0;
		return s;
	} catch {
		return;
	}
}
function writeCache(data) {
	if (typeof window === "undefined" || isPreviewRuntime() || data.authority !== "backend") return;
	try {
		window.sessionStorage.setItem(STORE_KEY, JSON.stringify({
			savedAt: Date.now(),
			data
		}));
	} catch {}
}
function clearOwnerSnapshotCache() {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.removeItem(STORE_KEY);
	} catch {}
}
function useOwnerSnapshot(opts = {}) {
	const hydrated = useHydrated();
	const cached = hydrated ? readCache() : void 0;
	const q = useQuery({
		queryKey: OWNER_SNAPSHOT_KEY,
		queryFn: async ({ signal }) => {
			try {
				const d = await fetchOwnerSnapshot(signal);
				writeCache(d);
				return d;
			} catch (e) {
				const kind = e?.kind;
				if (kind === "unauthorized" || kind === "forbidden") clearOwnerSnapshotCache();
				throw e;
			}
		},
		enabled: hydrated && opts.enabled !== false,
		retry: false,
		staleTime: STALE_MS,
		...cached ? { placeholderData: cached.data } : {}
	});
	const fromCache = q.isPlaceholderData && !!cached;
	return {
		...q,
		/** True while a cached snapshot is shown and a fresh read is in flight. */
		fromCache,
		refreshing: q.isFetching,
		updatedAt: fromCache ? cached.savedAt : q.dataUpdatedAt || null
	};
}
/** Bounded integer count from the snapshot, or null. Never defaults to 0. */
function snapshotCount(d, keys) {
	if (!d || d.authority !== "backend") return null;
	const m = d.metrics.find((x) => keys.includes(x.key));
	return m?.value && /^\d{1,6}$/.test(m.value) ? m.value : null;
}
//#endregion
export { useOwnerSnapshot as n, snapshotCount as t };
