import { s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
import { r as fetchList } from "./LiveState-B_hGkOGT.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/money-CgZ4DJmI.js
/**
* Money read adapters (payments-worker = Money Truth).
*
* Read-only in this project. Decisions (POST /v1/admin/payments/review) and
* historical intake/reprocess/review POSTs are NOT wired here because their
* exact request bodies are not present in this project; the UI hands off to
* the existing production routes instead of inventing payloads.
*
* Live LINE Slip Intake is automatic (member-dashboard-chat-worker
* /webhooks/line) and is evidence only — there is no browser control for it.
*/
var DEMO_QUEUE = [{
	proof_id: "demo-proof-1",
	status: "pending",
	source_channel: "line_ofc",
	amount_thb: 4500,
	client_display: "ตัวอย่าง · คุณหนุ่ย",
	job_ref: "unresolved",
	received_at: "2026-09-28T05:10:00Z"
}];
var DEMO_BACKFILL = [{
	backfill_id: "demo-hb-1",
	status: "needs_review",
	source: "historical_upload",
	received_at: "2025-11-02"
}];
function fetchReviewQueue(limit, signal) {
	return fetchList(`/v1/admin/payments/review-queue?limit=${limit}`, DEMO_QUEUE, signal);
}
function fetchHistoricalBackfill(signal) {
	return fetchList(`/v1/admin/payments/historical-backfill?limit=100`, DEMO_BACKFILL, signal);
}
/**
* Evidence preview through the credential-bound endpoint only. Returns an
* object URL (image) or null. Never exposes a storage key. Preview: null.
*/
async function fetchEvidenceUrl(proofId, signal) {
	if (isPreviewRuntime()) return null;
	const res = await fetch(`/v1/admin/payments/evidence?proof_id=${encodeURIComponent(proofId)}`, {
		method: "GET",
		credentials: "include",
		cache: "no-store",
		signal: signal ?? null
	});
	if (!res.ok) throw new Error(`evidence_${res.status}`);
	const type = res.headers.get("content-type") ?? "";
	if (type.startsWith("image/") || type === "application/pdf") return URL.createObjectURL(await res.blob());
	const body = await res.json().catch(() => null);
	const data = body?.["data"] ?? body ?? {};
	const url = data["preview_url"] ?? data["url"];
	return typeof url === "string" && (url.startsWith("/") || url.startsWith("https://")) ? url : null;
}
/** Backend-returned failure; `code` is only what the Worker returned. */
var ReviewError = class extends Error {
	code;
	status;
	constructor(code, status) {
		super(code ?? `http_${status}`);
		this.name = "ReviewError";
		this.code = code;
		this.status = status;
	}
};
function fetchReviewQueueWithContext(signal) {
	return fetchList(`/v1/admin/payments/review-queue?limit=100&include_context=1`, DEMO_QUEUE, signal);
}
async function submitPaymentReview(input) {
	if (isPreviewRuntime()) throw new ReviewError("preview_write_blocked", 0);
	let res;
	try {
		res = await fetch("/v1/admin/payments/review", {
			method: "POST",
			credentials: "include",
			cache: "no-store",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				"Idempotency-Key": input.idempotency_key
			},
			body: JSON.stringify(input)
		});
	} catch {
		throw new ReviewError("backend_unavailable", 0);
	}
	const body = await res.json().catch(() => null);
	const str = (v) => typeof v === "string" && v ? v : null;
	const data = body?.["data"] ?? body ?? {};
	if (!res.ok || body?.["ok"] === false) {
		const err = body?.["error"];
		throw new ReviewError(str(body?.["code"]) ?? (err && typeof err === "object" ? str(err["code"]) : str(err)) ?? (res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : null), res.status);
	}
	return {
		ok: true,
		status: str(data["status"]) ?? str(data["decision"]),
		message: str(data["message"]) ?? str(body?.["message"]),
		receipt: str(data["receipt_id"]) ?? str(data["review_id"]) ?? str(data["receipt"])
	};
}
/**
* Manual evidence uses the existing routed studio admin transport and the
* credential-bound owner session. The Worker privately extracts/stores pending
* evidence only. Browser never decides payment state. Missing receipts fail closed.
*/
var SLIP_INTAKE_PATH = "/studio/api/payments/slip-intake";
async function submitSlipIntake(file, source, note) {
	if (isPreviewRuntime()) return {
		ok: false,
		reason: "preview",
		code: null
	};
	const fd = new FormData();
	fd.append("file", file);
	fd.append("source_channel", source);
	if (note.trim()) fd.append("note", note.trim().slice(0, 300));
	let res;
	try {
		res = await fetch(SLIP_INTAKE_PATH, {
			method: "POST",
			credentials: "include",
			cache: "no-store",
			body: fd
		});
	} catch {
		return {
			ok: false,
			reason: "network",
			code: null
		};
	}
	const body = await res.json().catch(() => null);
	const code = typeof body?.["error"] === "string" && /^[a-z0-9_]{1,64}$/.test(body["error"]) ? body["error"] : null;
	if (res.status === 404 || res.status === 405) return {
		ok: false,
		reason: "not_enabled",
		code
	};
	if (res.status === 401 || res.status === 403) return {
		ok: false,
		reason: "unauthorized",
		code
	};
	if (!res.ok || body?.["ok"] !== true) return {
		ok: false,
		reason: "rejected",
		code
	};
	const data = body?.["data"] ?? body ?? {};
	const id = data["proof_id"];
	if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) return {
		ok: false,
		reason: "rejected",
		code: "upload_receipt_missing"
	};
	const defaultPath = `/internal/admin/payments?proof_id=${encodeURIComponent(id)}`;
	const path = data["review_path"];
	const reviewPath = typeof path === "string" && /^\/internal\/admin\/payments(?:\/historical-backfill)?\?proof_id=[A-Za-z0-9_-]{1,120}$/.test(path) && path.endsWith(`proof_id=${id}`) ? path : defaultPath;
	return {
		ok: true,
		proofId: id,
		duplicate: data["duplicate"] === true,
		reviewPath
	};
}
/** Thai label for where a slip came from. Unknown values pass through. */
function slipSourceLabel(v) {
	if (!v) return null;
	const s = v.toLowerCase();
	if (s.includes("cdm") || s.includes("paper")) return "กระดาษ CDM";
	if (s.includes("line")) return "LINE";
	if (s.includes("upload") || s.includes("manual")) return "อัปโหลด";
	return v;
}
//#endregion
export { fetchReviewQueueWithContext as a, submitSlipIntake as c, fetchReviewQueue as i, fetchEvidenceUrl as n, slipSourceLabel as o, fetchHistoricalBackfill as r, submitPaymentReview as s, ReviewError as t };
