import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { o as cn } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { b as Link, w as useHydrated } from "../_libs/@tanstack/react-router+[...].mjs";
import { V as safeRef, Y as writesBlockedInPreview, d as PreviewWriteBlockedError, t as ApiHttpError, y as createMutationGuard } from "./provider-CvQy8AcV.mjs";
import { C as LoaderCircle, I as Earth, K as ChevronDown, L as Copy, P as ExternalLink, Q as Ban, W as ChevronUp, _ as Pencil, a as TriangleAlert, b as Megaphone, c as Sparkles, d as ShieldCheck, et as ArrowUpRight, g as Plus, m as RefreshCw, nt as ArrowLeft, p as Search, q as Check, s as Square, tt as ArrowRight, w as List, x as Lock } from "../_libs/lucide-react.mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { t as Button } from "./button-C7XS-FYH.mjs";
import { t as Input } from "./input-Dk5AGV7h.mjs";
import { t as Label$1 } from "../_libs/radix-ui__react-label.mjs";
import { a as SelectItemIndicator, c as SelectPortal, d as SelectSeparator$1, f as SelectTrigger$1, i as SelectItem$1, l as SelectScrollDownButton$1, m as SelectViewport, n as SelectContent$1, o as SelectItemText, p as SelectValue$1, r as SelectIcon, s as SelectLabel$1, t as Select$1, u as SelectScrollUpButton$1 } from "../_libs/@radix-ui/react-select+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/BroadcastListPage-BWcEFh9g.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var labelVariants = cva("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70");
var Label = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label$1, {
	ref,
	className: cn(labelVariants(), className),
	...props
}));
Label.displayName = Label$1.displayName;
var Select = Select$1;
var SelectValue = SelectValue$1;
var SelectTrigger = import_react.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectTrigger$1, {
	ref,
	className: cn("flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background cursor-pointer data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1", className),
	...props,
	children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectIcon, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "h-4 w-4 opacity-50" })
	})]
}));
SelectTrigger.displayName = SelectTrigger$1.displayName;
var SelectScrollUpButton = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectScrollUpButton$1, {
	ref,
	className: cn("flex cursor-default items-center justify-center py-1", className),
	...props,
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronUp, { className: "h-4 w-4" })
}));
SelectScrollUpButton.displayName = SelectScrollUpButton$1.displayName;
var SelectScrollDownButton = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectScrollDownButton$1, {
	ref,
	className: cn("flex cursor-default items-center justify-center py-1", className),
	...props,
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "h-4 w-4" })
}));
SelectScrollDownButton.displayName = SelectScrollDownButton$1.displayName;
var SelectContent = import_react.forwardRef(({ className, children, position = "popper", ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectPortal, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent$1, {
	ref,
	className: cn("relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-select-content-transform-origin)", position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", className),
	position,
	...props,
	children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectScrollUpButton, {}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectViewport, {
			className: cn("p-1", position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"),
			children
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectScrollDownButton, {})
	]
}) }));
SelectContent.displayName = SelectContent$1.displayName;
var SelectLabel = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectLabel$1, {
	ref,
	className: cn("px-2 py-1.5 text-sm font-semibold", className),
	...props
}));
SelectLabel.displayName = SelectLabel$1.displayName;
var SelectItem = import_react.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectItem$1, {
	ref,
	className: cn("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className),
	...props,
	children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "absolute right-2 flex h-3.5 w-3.5 items-center justify-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItemIndicator, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-4 w-4" }) })
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItemText, { children })]
}));
SelectItem.displayName = SelectItem$1.displayName;
var SelectSeparator = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectSeparator$1, {
	ref,
	className: cn("-mx-1 my-1 h-px bg-muted", className),
	...props
}));
SelectSeparator.displayName = SelectSeparator$1.displayName;
/**
* Model Job Board owner publish — POST /v1/admin/job-board/publish.
* Same-origin, credentialed, no-store. Worker is Job Board / identity /
* business authority. Preview never issues this write.
*/
var CUSTOMER_GENDER_LABELS = {
	unspecified: "ไม่ระบุ",
	male: "ชาย",
	female: "หญิง",
	couple: "คู่ ชาย-หญิง",
	mixed: "หลายเพศ"
};
var BOARD_TEXT_MAX = 1e3;
/** Exact limits from mmd-workers admin-worker/src/job-board-owner-publish.js. */
var JOB_BOARD_LIMITS = {
	board_text: 1e3,
	title: 160,
	category: 80,
	duration: 80,
	area: 120,
	compensation: 120,
	safe_customer_description: 500,
	required_appearance_profile: 600,
	owner_note: 1200
};
var SHORT_LINK_RE = /^https:\/\/(?:www\.)?mmdbkk\.com\/j\/[A-F0-9]{12}$/;
var SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var CAMPAIGN_RE = /^[A-Za-z0-9._:-]{1,128}$/;
var SOURCE_RE = /^[A-Za-z0-9._-]{1,80}$/;
/** Returns the job id in `next` ("" for the list), or null when invalid. */
function parseNext(raw) {
	if (raw.includes("#") || raw.includes("?")) return null;
	try {
		const u = new URL(raw);
		if (u.protocol !== "https:" || u.hostname !== "sigil.mmdbkk.com" || u.port || u.username || u.password) return null;
		if (u.search || u.hash) return null;
		if (u.pathname === "/public/api/jobs") return "";
		const m = /^\/public\/api\/jobs\/([^/]+)$/.exec(u.pathname);
		return m && SAFE_ID_RE.test(m[1]) ? m[1] : null;
	} catch {
		return null;
	}
}
/**
* Broadcast links must enter backend-owned LIFF gating: either the canonical
* LIFF Login V2 entry built by mmd-workers shared/model-job-board-links.mjs
* (intent, return_to, optional source/job_id/campaign_id/next) or a backend
* short link. Never the board API itself, lookalike hosts, credentials or fragments.
*/
function isCanonicalBroadcastUrl(raw) {
	if (typeof raw !== "string" || raw !== raw.trim()) return false;
	if (SHORT_LINK_RE.test(raw)) return true;
	if (raw.includes("#")) return false;
	try {
		const u = new URL(raw);
		if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return false;
		if (u.origin !== "https://www.mmdbkk.com" || u.pathname !== "/sigil/model/login") return false;
		const keys = [...u.searchParams.keys()];
		const allowed = /* @__PURE__ */ new Set([
			"intent",
			"return_to",
			"next",
			"source",
			"job_id",
			"campaign_id"
		]);
		if (keys.some((k) => !allowed.has(k)) || new Set(keys).size !== keys.length) return false;
		if (u.searchParams.get("intent") !== "job_board") return false;
		if (u.searchParams.get("return_to") !== "public_job_board") return false;
		const source = u.searchParams.get("source");
		if (source !== null && !SOURCE_RE.test(source)) return false;
		const jobId = u.searchParams.get("job_id");
		if (jobId !== null && !SAFE_ID_RE.test(jobId)) return false;
		const campaign = u.searchParams.get("campaign_id");
		if (campaign !== null && !CAMPAIGN_RE.test(campaign)) return false;
		const next = u.searchParams.get("next");
		if (next !== null) {
			const nextId = parseNext(next);
			if (nextId === null) return false;
			if (jobId !== null && nextId !== "" && nextId !== jobId) return false;
		}
		return true;
	} catch {
		return false;
	}
}
async function publishToJobBoard(body) {
	if (writesBlockedInPreview()) throw new PreviewWriteBlockedError();
	const res = await fetch("/v1/admin/job-board/publish", {
		method: "POST",
		credentials: "include",
		cache: "no-store",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	});
	const text = await res.text().catch(() => "");
	let json = {};
	try {
		json = JSON.parse(text);
	} catch {}
	if (!res.ok || json["ok"] !== true) {
		const err = json["error"];
		const code = typeof err === "string" ? err : err?.["code"] ?? `HTTP ${res.status}`;
		throw new ApiHttpError(`ลงกระดานไม่สำเร็จ (${String(code)})`, res.status, json);
	}
	const valid = isCanonicalBroadcastUrl(json["broadcast_url"]);
	return {
		ok: true,
		job_id: typeof json["job_id"] === "string" ? json["job_id"] : null,
		broadcast_url: valid ? json["broadcast_url"] : null,
		broadcast_valid: valid
	};
}
/**
* Broadcast Work keyed publish + recovery (UI bookkeeping only — never authority).
*
* Contract prepared in MMD-Prive/mmd-workers (not yet deployed):
*   POST /v1/admin/job-board/publish            header Idempotency-Key
*   GET  /v1/admin/jobs/broadcast/status?idempotency_key=…
*   GET  /v1/admin/jobs/broadcast?limit&cursor   (bounded R2 key order)
*   GET  /v1/admin/jobs/broadcast/{job_id}
*
* The shared localStorage marker holds ONLY {v,key,status,job_id,broadcast_url,at}.
* No draft, customer data or owner note is ever persisted. Marker creation and
* updates run inside a Web Lock so two tabs cannot race a fresh key; without
* Web Locks or working storage, publishing fails closed. The backend only
* dedupes the SAME key — identical content sent with another key/device is
* not deduplicated.
*/
var OP_KEY = "mmd.broadcast.op.v2";
var OP_LOCK = "mmd.broadcast.op";
var LEGACY_KEY = "mmd.broadcast.pending.v1";
var IDEM_RE = /^[A-Za-z0-9_-]{16,128}$/;
var isIdemKey = (k) => typeof k === "string" && IDEM_RE.test(k);
function newIdemKey() {
	const k = globalThis.crypto?.randomUUID?.();
	if (!isIdemKey(k)) throw new Error("no_secure_random");
	return k;
}
/** null = no marker; "corrupt" = something is there but unreadable → stay locked. */
function readOp(storage) {
	if (!storage) return null;
	let raw;
	try {
		raw = storage.getItem(OP_KEY);
	} catch {
		return "corrupt";
	}
	if (!raw) return null;
	try {
		const v = JSON.parse(raw);
		if (v["v"] !== 2 || !isIdemKey(v["key"])) return "corrupt";
		const st = v["status"];
		const status = st === "published" || st === "retry_ready" || st === "in_flight" ? st : "uncertain";
		const url = isCanonicalBroadcastUrl(v["broadcast_url"]) ? v["broadcast_url"] : null;
		return {
			v: 2,
			key: v["key"],
			status: status === "published" && !url ? "uncertain" : status,
			job_id: safeRef(v["job_id"]),
			broadcast_url: url,
			at: typeof v["at"] === "number" ? v["at"] : 0
		};
	} catch {
		return "corrupt";
	}
}
function writeOp(storage, m) {
	const safe = {
		v: 2,
		key: m.key,
		status: m.status,
		job_id: safeRef(m.job_id),
		broadcast_url: isCanonicalBroadcastUrl(m.broadcast_url) ? m.broadcast_url : null,
		at: m.at
	};
	try {
		storage.setItem(OP_KEY, JSON.stringify(safe));
		const back = readOp(storage);
		return back !== null && back !== "corrupt" && back.key === m.key && back.status === safe.status;
	} catch {
		return false;
	}
}
/** Shared (cross-tab) legacy blocker: job_id only, written under OP_LOCK. */
var LEGACY_SHARED_KEY = "mmd.broadcast.legacy.v1";
function parseLegacy(raw) {
	try {
		return { job_id: safeRef(JSON.parse(raw)["job_id"]) };
	} catch {
		return { job_id: null };
	}
}
/** Legacy (pre-key) marker: locked, job_id lookup only. Read failure fails closed. */
function readLegacy(storage) {
	if (!storage) return "unreadable";
	try {
		const raw = storage.getItem(LEGACY_KEY);
		return raw ? parseLegacy(raw) : null;
	} catch {
		return "unreadable";
	}
}
function readLegacyShared(storage) {
	if (!storage) return "unreadable";
	try {
		const raw = storage.getItem(LEGACY_SHARED_KEY);
		return raw ? parseLegacy(raw) : null;
	} catch {
		return "unreadable";
	}
}
/**
* Promote a per-tab legacy marker into the shared blocker (under the Web Lock)
* so new tabs/reloads stay locked. Never removes evidence. Returns the
* effective state; any failure is "unreadable" (locked).
*/
async function adoptLegacy(tab, shared, lockFn) {
	const t = readLegacy(tab);
	const sh = readLegacyShared(shared);
	if (t === "unreadable" || sh === "unreadable") return "unreadable";
	if (!t) return sh;
	if (sh && (sh.job_id || !t.job_id)) return sh;
	if (!shared || !lockFn) return "unreadable";
	try {
		return await lockFn(OP_LOCK, async () => {
			const cur = readLegacyShared(shared);
			if (cur === "unreadable") return "unreadable";
			if (cur && (cur.job_id || !t.job_id)) return cur;
			try {
				shared.setItem(LEGACY_SHARED_KEY, JSON.stringify({
					v: 1,
					job_id: t.job_id
				}));
			} catch {
				return "unreadable";
			}
			return t;
		});
	} catch {
		return "unreadable";
	}
}
/**
* Release the legacy blocker ONLY after an owner detail read proved the exact
* job exists with a canonical link. A 404 never reaches here.
*/
async function releaseLegacyAfterFound(tab, shared, lockFn, proof) {
	if (!proof || !proof.broadcast_url || !safeRef(proof.job_id) || !shared || !lockFn) return false;
	try {
		return await lockFn(OP_LOCK, async () => {
			const sh = readLegacyShared(shared);
			const t = readLegacy(tab);
			if (sh === "unreadable" || t === "unreadable") return false;
			if ((sh?.job_id ?? t?.job_id ?? null) !== proof.job_id) return false;
			try {
				shared.removeItem(LEGACY_SHARED_KEY);
				tab?.removeItem(LEGACY_KEY);
			} catch {
				return false;
			}
			return true;
		});
	} catch {
		return false;
	}
}
function browserLockFn() {
	const locks = typeof navigator !== "undefined" ? navigator.locks : void 0;
	if (!locks || typeof locks.request !== "function") return null;
	return (name, cb) => locks.request(name, { mode: "exclusive" }, cb);
}
/**
* Atomically (per origin, via Web Lock) adopt an existing operation or create
* a new key. Only a `retry_ready` marker (set after a backend retry_safe:true
* read) may be re-sent, and always with its ORIGINAL key.
*/
async function beginOperation(opts) {
	const { storage, lockFn } = opts;
	if (!storage || !lockFn) return { kind: "unavailable" };
	try {
		return await lockFn(OP_LOCK, async () => {
			if (readLegacyShared(storage) !== null) return { kind: "legacy" };
			const cur = readOp(storage);
			const at = (opts.now ?? Date.now)();
			if (cur === "corrupt") return {
				kind: "adopted",
				marker: "corrupt"
			};
			if (cur) {
				if (cur.status !== "retry_ready") return {
					kind: "adopted",
					marker: cur
				};
				const m = {
					...cur,
					status: "in_flight",
					at
				};
				return writeOp(storage, m) ? {
					kind: "retry",
					marker: m,
					fresh: false
				} : { kind: "unavailable" };
			}
			let key;
			try {
				key = (opts.newKey ?? newIdemKey)();
			} catch {
				return { kind: "unavailable" };
			}
			if (!isIdemKey(key)) return { kind: "unavailable" };
			const m = {
				v: 2,
				key,
				status: "in_flight",
				job_id: null,
				broadcast_url: null,
				at
			};
			if (!writeOp(storage, m)) {
				try {
					storage.removeItem(OP_KEY);
				} catch {}
				return { kind: "unavailable" };
			}
			return {
				kind: "started",
				marker: m,
				fresh: true
			};
		});
	} catch {
		return { kind: "unavailable" };
	}
}
/** Update only when the stored key is still ours; never replaces a key. */
async function updateOp(storage, lockFn, key, patch) {
	if (!storage || !lockFn) return null;
	try {
		return await lockFn(OP_LOCK, async () => {
			const cur = readOp(storage);
			if (!cur || cur === "corrupt" || cur.key !== key) return null;
			return writeOp(storage, {
				...cur,
				...patch,
				job_id: patch.job_id ?? cur.job_id,
				at: Date.now()
			}) ? readOp(storage) : null;
		});
	} catch {
		return null;
	}
}
/** Clears only our own marker, and only from an allowed status. */
async function clearOp(storage, lockFn, key, allowed) {
	if (!storage || !lockFn) return false;
	try {
		return await lockFn(OP_LOCK, async () => {
			const cur = readOp(storage);
			if (!cur || cur === "corrupt" || cur.key !== key || !allowed.includes(cur.status)) return false;
			storage.removeItem(OP_KEY);
			return storage.getItem(OP_KEY) === null;
		});
	} catch {
		return false;
	}
}
async function call(url, init) {
	const res = await fetch(url, {
		credentials: "include",
		cache: "no-store",
		...init
	});
	const text = await res.text().catch(() => "");
	let json = null;
	try {
		const v = JSON.parse(text);
		json = v && typeof v === "object" && !Array.isArray(v) ? v : null;
	} catch {}
	return {
		status: res.status,
		json
	};
}
var PreviewBlocked = class extends Error {
	constructor() {
		super("preview");
		this.name = "PreviewBlocked";
	}
};
function sendKeyedPublish(key, body) {
	if (writesBlockedInPreview()) return Promise.reject(new PreviewBlocked());
	if (!isIdemKey(key)) return Promise.reject(/* @__PURE__ */ new Error("bad_key"));
	return call("/v1/admin/job-board/publish", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"Idempotency-Key": key
		},
		body: JSON.stringify(body)
	});
}
/** Reads are also skipped in preview: there is no Worker and no real data there. */
function readPublishStatus(key) {
	if (writesBlockedInPreview()) return Promise.reject(new PreviewBlocked());
	return call(`/v1/admin/jobs/broadcast/status?idempotency_key=${encodeURIComponent(key)}`, { method: "GET" });
}
var jobIdOf = (j) => {
	if (!j) return null;
	const job = j["job"];
	return safeRef(j["job_id"]) ?? (job && typeof job === "object" ? safeRef(job["id"]) : null);
};
var linkOf = (j) => {
	if (!j) return null;
	const job = j["job"];
	for (const v of [j["broadcast_url"], job && typeof job === "object" ? job["broadcast_url"] : void 0]) if (isCanonicalBroadcastUrl(v)) return v;
	return null;
};
var errCode = (j) => {
	const e = j?.["error"];
	if (typeof e === "string") return e;
	const c = e?.["code"];
	return typeof c === "string" ? c : null;
};
var DEFINITE = /* @__PURE__ */ new Set([
	400,
	401,
	403,
	422,
	429
]);
function classifyPublish(r) {
	if (!r) return {
		kind: "uncertain",
		job_id: null,
		reason: "network"
	};
	const j = r.json;
	if (r.status === 409 && errCode(j) === "idempotency_payload_mismatch") return { kind: "mismatch" };
	if (r.status >= 200 && r.status < 300) {
		const id = jobIdOf(j);
		const url = linkOf(j);
		if (j?.["ok"] === true && j["state"] === "published" && id && url) return {
			kind: "published",
			job_id: id,
			broadcast_url: url
		};
		return {
			kind: "uncertain",
			job_id: id,
			reason: "malformed"
		};
	}
	const id = jobIdOf(j);
	if (id) return {
		kind: "uncertain",
		job_id: id,
		reason: "explicit"
	};
	if (j?.["outcome"] === "uncertain") return {
		kind: "uncertain",
		job_id: null,
		reason: "explicit"
	};
	if (j && (DEFINITE.has(r.status) || j["outcome"] === "rejected" && r.status >= 400 && r.status < 500)) return {
		kind: "rejected",
		status: r.status,
		code: errCode(j)
	};
	return {
		kind: "uncertain",
		job_id: null,
		reason: r.status >= 500 ? "server" : "malformed"
	};
}
/** Only an exact, well-formed 200 can change state; anything else stays locked. */
function classifyStatus(r) {
	if (!r || r.status !== 200 || !r.json || r.json["ok"] !== true) return {
		kind: "read_failed",
		status: r?.status ?? null
	};
	const j = r.json;
	if (j["state"] === "published" && j["retry_safe"] === false) {
		const id = jobIdOf(j);
		const url = linkOf(j);
		return id && url ? {
			kind: "published",
			job_id: id,
			broadcast_url: url
		} : {
			kind: "read_failed",
			status: 200
		};
	}
	if (j["state"] === "not_found" && j["retry_safe"] === true) return { kind: "not_found" };
	if (j["state"] === "pending" && j["retry_safe"] === true) return {
		kind: "pending",
		job_id: jobIdOf(j)
	};
	return {
		kind: "read_failed",
		status: 200
	};
}
/** Bounded status reads: re-read while pending, at most `attempts` times. */
async function checkPublishStatus(opts) {
	const read = opts.read ?? readPublishStatus;
	const attempts = Math.max(1, Math.min(opts.attempts ?? 3, 5));
	const wait = opts.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
	let last = {
		kind: "read_failed",
		status: null
	};
	for (let i = 0; i < attempts; i++) {
		try {
			last = classifyStatus(await read(opts.key));
		} catch {
			return {
				kind: "read_failed",
				status: null
			};
		}
		if (last.kind !== "pending") return last;
		if (i < attempts - 1) await wait(1500);
	}
	return last;
}
async function preflightPublish(key, read = readPublishStatus, fresh = true) {
	let st;
	try {
		st = classifyStatus(await read(key));
	} catch {
		return { kind: "not_ready" };
	}
	if (st.kind === "read_failed") return { kind: "not_ready" };
	if (st.kind === "published") return st;
	if (st.kind === "not_found") return { kind: "send" };
	return fresh ? {
		kind: "pending",
		job_id: st.job_id
	} : { kind: "send" };
}
/** After a failed status/preflight read: only a never-sent fresh key may be cleared. */
var failedReadAction = (fresh) => fresh ? "clear" : "uncertain";
/**
* Read-only owner view of Broadcast listings (prepared mmd-workers contract,
* not yet deployed). Bounded R2 key order — NOT chronological, NOT global
* search. No edit/delete/close. Preview never fetches and never shows fixtures.
*/
var str = (v) => typeof v === "string" && v.trim() ? v : null;
var scalars = (o) => o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o).filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean").map(([key, value]) => ({
	key,
	value
})) : [];
function normalizeOwnerJob(raw) {
	if (!raw || typeof raw !== "object") return null;
	const j = raw;
	const id = safeRef(j["id"]);
	if (!id) return null;
	const pub = j["public"] && typeof j["public"] === "object" ? j["public"] : {};
	const w = j["world"] ?? pub["world"];
	const prot = j["protected"] && typeof j["protected"] === "object" ? j["protected"] : null;
	return {
		id,
		status: str(j["status"]),
		created_at: str(j["created_at"]),
		updated_at: str(j["updated_at"]),
		world: w === "public" || w === "private" ? w : null,
		title: str(pub["title"]),
		broadcast_url: isCanonicalBroadcastUrl(j["broadcast_url"]) ? j["broadcast_url"] : null,
		public: scalars(pub),
		protected: prot ? {
			source_brief: str(prot["source_brief"]),
			deeper_interest_detail: str(prot["deeper_interest_detail"]),
			owner_note: str(prot["owner_note"])
		} : null
	};
}
var ReadError = class extends Error {
	status;
	code;
	constructor(status, code) {
		super(code ?? `HTTP ${status ?? "network"}`);
		this.status = status;
		this.code = code;
		this.name = "ReadError";
	}
};
async function get(url) {
	if (writesBlockedInPreview()) throw new PreviewBlocked();
	let res;
	try {
		res = await fetch(url, {
			credentials: "include",
			cache: "no-store"
		});
	} catch {
		throw new ReadError(null, null);
	}
	const text = await res.text().catch(() => "");
	try {
		const v = JSON.parse(text);
		return {
			status: res.status,
			json: v && typeof v === "object" ? v : null
		};
	} catch {
		return {
			status: res.status,
			json: null
		};
	}
}
function parseListPage(r) {
	const j = r.json;
	if (r.status !== 200 || !j || j["ok"] !== true || !Array.isArray(j["jobs"])) throw new ReadError(r.status, typeof j?.["error"] === "string" ? j["error"] : null);
	const nc = j["next_cursor"];
	if (!(nc === null || typeof nc === "string" && nc.trim().length > 0 && nc.length <= 1024)) throw new ReadError(200, "malformed_cursor");
	const jobs = j["jobs"].map(normalizeOwnerJob);
	if (jobs.some((x) => x === null)) throw new ReadError(200, "malformed_row");
	return {
		jobs,
		next_cursor: nc
	};
}
async function listBroadcastJobs(cursor, limit = 20) {
	return parseListPage(await get(`/v1/admin/jobs/broadcast?${`limit=${Math.max(1, Math.min(50, Math.floor(limit)))}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`}`));
}
/** 404 job_not_found = real absence (null). Other failures throw — never "absent". */
function parseDetail(r) {
	const j = r.json;
	if (r.status === 404 && j && j["error"] === "job_not_found") return null;
	if (r.status !== 200 || !j || j["ok"] !== true) throw new ReadError(r.status, typeof j?.["error"] === "string" ? j["error"] : null);
	const job = normalizeOwnerJob(j["job"]);
	if (!job) throw new ReadError(200, "malformed");
	return job;
}
async function getBroadcastJob(id) {
	const sid = safeRef(id);
	if (!sid) throw new ReadError(null, "bad_id");
	return parseDetail(await get(`/v1/admin/jobs/broadcast/${encodeURIComponent(sid)}`));
}
/** Filters ONLY the already-loaded page(s) by scalar fields. */
function filterLoaded(jobs, q) {
	const n = q.trim().toLowerCase();
	if (!n) return jobs;
	return jobs.filter((j) => [
		j.id,
		j.title,
		j.status,
		j.world,
		...j.public.map((p) => String(p.value))
	].some((v) => typeof v === "string" && v.toLowerCase().includes(n)));
}
var LEAVE_MSG = "ข้อมูลที่กรอกไว้ในหน้านี้จะหายไป ต้องการเปลี่ยนหน้าหรือไม่?";
/** Sibling modes of /internal/admin/jobs/create-job. Same tab; confirms only when the current draft has data. */
function ModeSwitch({ active, dirty }) {
	function guard(e) {
		if (dirty && !window.confirm(LEAVE_MSG)) e.preventDefault();
	}
	const base = "inline-flex min-h-10 items-center rounded px-3 text-[13px]";
	const on = "bg-gold-muted font-semibold text-foreground";
	const off = "text-muted-foreground hover:text-foreground";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "inline-flex max-w-full flex-wrap rounded-md border border-border bg-surface p-0.5",
		role: "group",
		"aria-label": "รูปแบบการสร้างงาน",
		children: [active === "job" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			"aria-current": "page",
			className: cn(base, on),
			children: "สร้างงานแบบเลือกน้องๆและนายแบบ"
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: "/internal/admin/jobs/create-job",
			search: {},
			onClick: guard,
			className: cn(base, off),
			children: "สร้างงานแบบเลือกน้องๆและนายแบบ"
		}), active === "broadcast" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			"aria-current": "page",
			className: cn(base, on),
			children: "ลงประกาศหาคนรับงาน"
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: "/internal/admin/jobs/create-job",
			search: { mode: "broadcast" },
			onClick: guard,
			className: cn(base, off),
			children: "ลงประกาศหาคนรับงาน"
		})]
	});
}
var Textarea = import_react.forwardRef(({ className, ...props }, ref) => {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
		className: cn("flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", className),
		ref,
		...props
	});
});
Textarea.displayName = "Textarea";
function BroadcastAiDraft({ world, maxLength, onUse }) {
	const [brief, setBrief] = (0, import_react.useState)("");
	const [draft, setDraft] = (0, import_react.useState)("");
	const [reasoning, setReasoning] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [complete, setComplete] = (0, import_react.useState)(false);
	const [message, setMessage] = (0, import_react.useState)(null);
	const active = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => () => active.current?.abort(), []);
	async function generate() {
		if (active.current) return;
		const controller = new AbortController();
		active.current = controller;
		setBusy(true);
		setComplete(false);
		setDraft("");
		setReasoning("");
		setMessage(null);
		try {
			const response = await fetch("/api/broadcast-draft", {
				method: "POST",
				credentials: "include",
				cache: "no-store",
				signal: controller.signal,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					brief,
					world
				})
			});
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.message ?? "ยังใช้ AI ไม่ได้ กรุณาลองใหม่ภายหลัง");
			}
			if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson")) throw new Error("ระบบตอบกลับไม่ถูกต้อง ยังไม่มีร่างที่ยืนยันว่าครบ");
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "", text = "", done = false;
			const consume = (line) => {
				if (!line.trim()) return;
				const event = JSON.parse(line);
				if (event.type === "error") throw new Error(event.message);
				if (event.type === "text" && typeof event.text === "string") {
					text += event.text;
					setDraft(text);
				}
				if (event.type === "reasoning" && typeof event.text === "string") setReasoning((value) => value + event.text);
				if (event.type === "done") done = true;
			};
			while (true) {
				const chunk = await reader.read();
				if (chunk.done) break;
				buffer += decoder.decode(chunk.value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) consume(line);
			}
			consume(buffer + decoder.decode());
			if (!done || !text.trim()) throw new Error("ยังไม่มีร่างที่ครบถ้วน กรุณาตรวจข้อความก่อนเริ่มร่างใหม่");
			setComplete(true);
		} catch (error) {
			setMessage(controller.signal.aborted ? "หยุดร่างแล้ว ข้อความที่ได้รับยังไม่ครบ" : error instanceof Error ? error.message : "ร่างไม่สำเร็จ");
		} finally {
			active.current = null;
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "broadcast-ai-heading",
		className: "space-y-3 border-y border-border py-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
				id: "broadcast-ai-heading",
				className: "flex items-center gap-2 text-[15px] font-semibold",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, {
					className: "size-4 text-gold",
					"aria-hidden": true
				}), "ร่างประกาศด้วย AI"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
					htmlFor: "broadcast-ai-brief",
					children: "บรีฟสำหรับร่างประกาศ"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
					id: "broadcast-ai-brief",
					rows: 4,
					maxLength: 6e3,
					value: brief,
					disabled: busy,
					onChange: (e) => setBrief(e.target.value),
					placeholder: "รายละเอียดที่เปิดเผยได้ สิ่งที่ต้องการ และน้ำเสียงของประกาศ"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] leading-normal text-muted-foreground",
				children: "ไม่ใส่ชื่อลูกค้า ข้อมูลติดต่อ หรือบันทึกส่วนตัว · การร่างใช้เครดิต Lovable AI"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					type: "button",
					disabled: busy || brief.trim().length < 10,
					onClick: generate,
					children: [busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
						className: "animate-spin",
						"aria-hidden": true
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { "aria-hidden": true }), "ร่างข้อความ"]
				}), busy && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					type: "button",
					variant: "outline",
					onClick: () => active.current?.abort(),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, { "aria-hidden": true }), "หยุดร่าง"]
				})]
			}),
			busy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "text-[13px] text-muted-foreground",
				children: "กำลังร่างประกาศ…"
			}),
			reasoning && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "text-[13px] text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: "สรุปจาก AI" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 whitespace-pre-wrap break-words",
					children: reasoning
				})]
			}),
			draft && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
						htmlFor: "broadcast-ai-result",
						children: "ร่างข้อความ — ตรวจทานก่อนใช้"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
						id: "broadcast-ai-result",
						rows: 7,
						value: draft,
						disabled: busy,
						onChange: (e) => {
							setDraft(e.target.value);
							setMessage(null);
						}
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							disabled: busy || !complete || !draft.trim() || draft.length > maxLength,
							onClick: () => {
								onUse(draft.trim());
								setMessage("นำร่างไปใส่รายละเอียดงานแล้ว ยังไม่ได้เผยแพร่หรือส่งเข้ากลุ่ม");
							},
							children: "ใช้ร่างนี้ในรายละเอียดงาน"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							type: "button",
							variant: "outline",
							disabled: busy,
							onClick: async () => {
								try {
									await navigator.clipboard.writeText(draft);
									setMessage("คัดลอกข้อความแล้ว");
								} catch {
									setMessage("คัดลอกไม่สำเร็จ เลือกข้อความจากช่องร่างแล้วคัดลอกเองได้");
								}
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { "aria-hidden": true }), "คัดลอก"]
						})]
					}),
					draft.length > maxLength && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-[13px] text-warn",
						children: [
							"ย่อร่างให้ไม่เกิน ",
							maxLength,
							" ตัวอักษรก่อนนำไปใช้"
						]
					})
				]
			}),
			message && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				className: "break-words text-[13px] leading-normal text-foreground",
				children: message
			})
		]
	});
}
/**
* Standalone Broadcast Work draft (recruitment listing only — never a
* Session, Payment, model assignment or paid state). Pure helpers so the
* privacy/payload/guard rules are testable without the page.
*/
function emptyBroadcastDraft() {
	return {
		world: null,
		title: "",
		date: "",
		time: "",
		duration: "",
		area: "",
		compensation: "",
		customer_count: "",
		customer_gender: null,
		board_text: "",
		safe_customer_description: "",
		required_appearance_profile: "",
		budget: null,
		owner_note: ""
	};
}
/**
* Switching worlds keeps nothing world-dependent: disclosure consent and every
* customer/detail field are cleared so private data cannot leak into public.
*/
function switchWorld(d, world) {
	if (d.world === world) return d;
	return {
		...emptyBroadcastDraft(),
		world
	};
}
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function validDate(s) {
	if (!DATE_RE.test(s)) return false;
	const d = /* @__PURE__ */ new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
/** "Today" in Asia/Bangkok as YYYY-MM-DD, independent of browser timezone. */
function bangkokToday(now = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Bangkok",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).format(now);
}
function broadcastMissing(d, today = /* @__PURE__ */ new Date()) {
	const m = [];
	if (!d.world) m.push("เลือกประเภทงาน: งานเปิดเผย หรือ งานส่วนตัว");
	if (!d.board_text.trim()) m.push("ใส่รายละเอียดงาน");
	const over = (k, label, v) => {
		if (v.length > JOB_BOARD_LIMITS[k]) m.push(`${label} ยาวเกิน ${JOB_BOARD_LIMITS[k]} ตัวอักษร`);
	};
	over("board_text", "รายละเอียดงาน", d.board_text);
	over("title", "ชื่องาน", d.title);
	over("duration", "ระยะเวลา", d.duration);
	over("area", "พื้นที่", d.area);
	over("compensation", "ค่าตอบแทน", d.compensation);
	over("safe_customer_description", "ข้อมูลลูกค้าที่ไม่ระบุตัวตน", d.safe_customer_description);
	over("required_appearance_profile", "ลักษณะน้องๆและนายแบบที่ต้องการ", d.required_appearance_profile);
	over("owner_note", "บันทึกส่วนตัว", d.owner_note);
	if (d.date && !validDate(d.date)) m.push("วันที่ไม่ถูกต้อง");
	if (d.date && validDate(d.date) && d.date < bangkokToday(today)) m.push("วันที่ผ่านมาแล้ว");
	if (d.time && !TIME_RE.test(d.time)) m.push("เวลาไม่ถูกต้อง");
	if (d.time && !d.date) m.push("กรุณาเลือกวันที่ด้วย เมื่อระบุเวลาเริ่มงาน");
	if (d.customer_count && !/^[1-9]\d{0,2}$/.test(d.customer_count.trim())) m.push("กรอกจำนวนลูกค้าเป็นจำนวนเต็ม ตั้งแต่ 1 คนขึ้นไป");
	if (!d.customer_gender) m.push("เลือกเพศลูกค้า หากไม่ต้องการบอก ให้เลือก “ไม่ระบุ”");
	if (d.world === "private" && !d.budget) m.push("เลือกว่าจะให้น้องๆและนายแบบเห็นค่าตอบแทนหลังเข้าสู่ระบบหรือไม่");
	return m;
}
function buildBroadcastPayload(d) {
	if (!d.world || !d.customer_gender) throw new Error("draft incomplete");
	const opt = (v) => v.trim() ? v.trim() : void 0;
	const p = {
		board_text: d.board_text.trim(),
		world: d.world,
		customer_gender: d.customer_gender,
		budget_disclosure_approved: d.world === "private" ? d.budget === "show" : true
	};
	const set = (k, v) => {
		if (v !== void 0) p[k] = v;
	};
	set("title", opt(d.title));
	set("job_date", opt(d.date));
	set("start_time", opt(d.time));
	set("duration", opt(d.duration));
	set("area", opt(d.area));
	set("compensation", opt(d.compensation));
	if (d.customer_count.trim()) p.customer_count = Number(d.customer_count.trim());
	set("safe_customer_description", opt(d.safe_customer_description));
	set("required_appearance_profile", opt(d.required_appearance_profile));
	set("owner_note", opt(d.owner_note));
	return p;
}
/** What a model sees before login. Owner note never appears. */
function modelTeaser(d) {
	if (d.world === "private") return {
		locked: true,
		title: "งาน Private",
		label: "งานส่วนตัว · เข้าสู่ระบบและมีสิทธิ์จึงดูรายละเอียดได้",
		rows: [],
		body: null
	};
	const title = d.title.trim() || null;
	const rows = [];
	const add = (label, v) => v.trim() && rows.push({
		label,
		value: v.trim()
	});
	add("วันที่", d.date);
	add("เวลา", d.time);
	add("ระยะเวลา", d.duration);
	add("พื้นที่", d.area);
	add("ค่าตอบแทน", d.compensation);
	add("ลักษณะน้องๆและนายแบบที่ต้องการ", d.required_appearance_profile);
	add("เกี่ยวกับลูกค้า", d.safe_customer_description);
	return {
		locked: false,
		title,
		label: "งานเปิดเผย · Public",
		rows,
		body: d.board_text.trim() || null
	};
}
function BroadcastGroup({ number, title, hint, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "border-t border-border py-3 sm:py-3 first:border-t-0 first:pt-0",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-3 flex items-start gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "pt-1 font-mono text-xs text-gold",
				children: number
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "text-[13px] font-semibold leading-normal text-foreground",
				children: title
			}), hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[13px] leading-normal text-muted-foreground",
				children: hint
			})] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "space-y-3",
			children
		})]
	});
}
function BroadcastTeaser({ draft }) {
	const teaser = modelTeaser(draft);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-label": "ประกาศที่น้องๆและนายแบบจะเห็น",
		className: "min-w-0",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-3 flex items-center justify-between gap-3 text-[13px] text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "ประกาศที่น้องๆและนายแบบจะเห็น" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUpRight, {
					className: "h-4 w-4",
					"aria-hidden": true
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "overflow-hidden rounded-lg border border-border bg-surface",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between border-b border-border px-3 py-3 sm:px-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs font-medium text-gold",
						children: "MMD PRIVÉ"
					}), teaser.locked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, {
						className: "h-4 w-4 text-gold",
						"aria-hidden": true
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Earth, {
						className: "h-4 w-4 text-gold",
						"aria-hidden": true
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "px-3 py-3 sm:px-4 sm:py-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[12px] font-medium leading-normal text-gold",
							children: teaser.label
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "mt-3 text-[16px] font-semibold leading-normal",
							children: teaser.title || "งานเปิดเผย · Public"
						}),
						teaser.locked ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "my-3 flex h-14 w-14 items-center justify-center rounded-full bg-gold-muted",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, {
								className: "h-6 w-6 text-gold",
								"aria-hidden": true
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] leading-normal text-muted-foreground",
							children: "ซ่อนรายละเอียดงานจนกว่าน้องๆและนายแบบจะเข้าสู่ระบบและมีสิทธิ์ดู"
						})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [teaser.body && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 whitespace-pre-wrap text-[13px] leading-normal text-foreground",
							children: teaser.body
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", {
							className: "mt-3 divide-y divide-border",
							children: teaser.rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-[100px_minmax(0,1fr)] gap-3 py-3 text-[13px]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
									className: "text-muted-foreground",
									children: r.label
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
									className: "whitespace-pre-wrap break-words",
									children: r.value
								})]
							}, r.label))
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 border-t border-border pt-3 text-[13px] text-gold",
							children: ["เข้าสู่ระบบเพื่อดูรายละเอียดงาน ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								"aria-hidden": true,
								children: "↗"
							})]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-3 flex items-start gap-2 text-xs leading-normal text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, {
					className: "mt-0.5 h-4 w-4 shrink-0",
					"aria-hidden": true
				}), teaser.locked ? "น้องๆและนายแบบยังไม่เห็นชื่องานหรือรายละเอียด จนกว่าจะเข้าสู่ระบบและมีสิทธิ์ดู" : "บันทึกส่วนตัวไม่แสดงให้น้องๆและนายแบบเห็น"]
			})
		]
	});
}
function BroadcastOwnerSummary({ draft: d }) {
	const rows = [
		["ประเภทงาน", d.world === "private" ? "งานส่วนตัว · Private" : d.world === "public" ? "งานเปิดเผย · Public" : "—"],
		["ชื่องาน", d.title || "—"],
		["วัน / เวลา", [d.date, d.time].filter(Boolean).join(" · ") || "—"],
		["ระยะเวลา", d.duration || "—"],
		["พื้นที่", d.area || "—"],
		["ค่าตอบแทน", d.compensation || "—"],
		["ลูกค้า", `${d.customer_gender ? CUSTOMER_GENDER_LABELS[d.customer_gender] : "—"}${d.customer_count ? ` · ${d.customer_count} คน` : ""}`],
		...d.world === "private" ? [["ค่าตอบแทนหลังเข้าสู่ระบบ", d.budget === "show" ? "แสดง" : d.budget === "hidden" ? "ซ่อน" : "ยังไม่เลือก"]] : []
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-label": "รายละเอียดสำหรับคุณ",
		className: "min-w-0",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs font-medium text-gold",
				children: "ตรวจรายละเอียดก่อนลง"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-2 text-[16px] font-semibold leading-normal",
				children: "รายละเอียดสำหรับคุณ"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", {
				className: "mt-3 divide-y divide-border",
				children: rows.map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-[128px_minmax(0,1fr)] gap-3 py-3 text-[13px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
						className: "text-muted-foreground",
						children: k
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
						className: "whitespace-pre-wrap break-words",
						children: v
					})]
				}, k))
			}),
			[
				["รายละเอียดงาน", d.board_text],
				["ลักษณะน้องๆและนายแบบที่ต้องการ", d.required_appearance_profile],
				["ข้อมูลลูกค้าที่ไม่ระบุตัวตน", d.safe_customer_description]
			].map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-border py-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[13px] text-muted-foreground",
					children: k
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 whitespace-pre-wrap text-[13px] leading-normal",
					children: v || "—"
				})]
			}, k)),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-border py-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
					className: "flex items-center gap-2 text-[13px] text-gold",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, {
						className: "h-3.5 w-3.5",
						"aria-hidden": true
					}), "บันทึกส่วนตัว · น้องๆและนายแบบไม่เห็น"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 whitespace-pre-wrap text-[13px] leading-normal",
					children: d.owner_note || "—"
				})]
			})
		]
	});
}
var GENDERS = [
	"unspecified",
	"male",
	"female",
	"couple",
	"mixed"
];
var STAGES = [
	"เลือกประเภทงาน",
	"กรอกรายละเอียด",
	"ตรวจประกาศ"
];
function shared() {
	try {
		if (typeof window === "undefined") return null;
		const s = window.localStorage;
		const t = "mmd.broadcast.probe";
		s.setItem(t, "1");
		s.removeItem(t);
		return s;
	} catch {
		return null;
	}
}
function tabStore() {
	try {
		return typeof window === "undefined" ? null : window.sessionStorage;
	} catch {
		return null;
	}
}
function BroadcastWorkPage() {
	const preview = !useHydrated() || writesBlockedInPreview();
	const [stage, setStage] = (0, import_react.useState)(1);
	const [d, setD] = (0, import_react.useState)(emptyBroadcastDraft);
	const [op, setOp] = (0, import_react.useState)(null);
	const [legacy, setLegacy] = (0, import_react.useState)(null);
	const legacyId = legacy && legacy !== "unreadable" ? legacy.job_id : null;
	const [legacyFound, setLegacyFound] = (0, import_react.useState)(null);
	const [unsupported, setUnsupported] = (0, import_react.useState)(false);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [checking, setChecking] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [info, setInfo] = (0, import_react.useState)(null);
	const [copied, setCopied] = (0, import_react.useState)(null);
	const guard = (0, import_react.useRef)(createMutationGuard());
	const refresh = (0, import_react.useCallback)(() => {
		const cur = readOp(shared());
		setOp(cur);
		return cur;
	}, []);
	(0, import_react.useEffect)(() => {
		setUnsupported(!shared() || !browserLockFn());
		adoptLegacy(tabStore(), shared(), browserLockFn()).then((lg) => {
			setLegacy(lg);
			if (lg) setStage(3);
		});
		const cur = refresh();
		if (cur && (cur === "corrupt" || cur.status !== "retry_ready")) setStage(3);
		const onStorage = (e) => {
			if (e.key !== "mmd.broadcast.op.v2" && e.key !== "mmd.broadcast.legacy.v1" && e.key !== null) return;
			adoptLegacy(tabStore(), shared(), browserLockFn()).then((lg) => {
				setLegacy(lg);
				if (lg) setStage(3);
			});
			const m = refresh();
			if (m && (m === "corrupt" || m.status !== "retry_ready")) setStage(3);
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, [refresh]);
	const missing = broadcastMissing(d);
	const retryReady = op !== null && op !== "corrupt" && op.status === "retry_ready";
	const locked = Boolean(legacy) || op !== null && !retryReady;
	const set = (p) => !locked && setD((x) => ({
		...x,
		...p
	}));
	function chooseWorld(w) {
		if (locked) return;
		setD((x) => switchWorld(x, w));
		setError(null);
	}
	async function publish() {
		if (preview || unsupported || missing.length || locked || !guard.current.tryAcquire()) return;
		setBusy(true);
		setError(null);
		setInfo(null);
		const storage = shared();
		const lockFn = browserLockFn();
		try {
			const payload = buildBroadcastPayload(d);
			const b = await beginOperation({
				storage,
				lockFn
			});
			if (b.kind === "unavailable") {
				setError("เบราว์เซอร์นี้บันทึกสถานะกันลงซ้ำไม่ได้ จึงยังไม่ส่งประกาศ ลองเปิดด้วย Chrome หรือ Safari รุ่นใหม่ และไม่ใช้โหมดไม่ระบุตัวตน");
				return;
			}
			if (b.kind === "legacy") {
				setLegacy(await adoptLegacy(tabStore(), shared(), lockFn));
				setStage(3);
				return;
			}
			if (b.kind === "adopted") {
				setOp(b.marker);
				setStage(3);
				setInfo("มีการลงประกาศที่ยังไม่รู้ผลจากอีกแท็บหรือก่อนรีเฟรช หน้านี้ใช้รายการเดิมแทนการส่งใหม่");
				return;
			}
			const key = b.marker.key;
			setOp(b.marker);
			const pre = await preflightPublish(key, void 0, b.fresh);
			if (pre.kind === "not_ready") {
				if (failedReadAction(b.fresh) === "clear") {
					await clearOp(storage, lockFn, key, ["in_flight"]);
					refresh();
				} else {
					setOp(await updateOp(storage, lockFn, key, { status: "uncertain" }) ?? readOp(storage));
					setStage(3);
				}
				setError("ระบบตรวจผลการลงประกาศยังไม่พร้อม จึงยังไม่ส่งประกาศ เพื่อไม่ให้ลงซ้ำ ลองใหม่ภายหลัง");
				return;
			}
			if (pre.kind === "published") {
				setOp(await updateOp(storage, lockFn, key, {
					status: "published",
					job_id: pre.job_id,
					broadcast_url: pre.broadcast_url
				}) ?? readOp(storage));
				return;
			}
			if (pre.kind === "pending") {
				setOp(await updateOp(storage, lockFn, key, {
					status: "uncertain",
					job_id: pre.job_id
				}) ?? readOp(storage));
				setStage(3);
				setError("ระบบแจ้งว่ามีคำขอนี้ค้างอยู่แล้ว จึงยังไม่ส่งซ้ำ กด “ตรวจผลการลงประกาศ”");
				return;
			}
			let outcome;
			try {
				outcome = classifyPublish(await sendKeyedPublish(key, payload));
			} catch {
				outcome = classifyPublish(null);
			}
			if (outcome.kind === "published") setOp(await updateOp(storage, lockFn, key, {
				status: "published",
				job_id: outcome.job_id,
				broadcast_url: outcome.broadcast_url
			}) ?? readOp(storage));
			else if (outcome.kind === "rejected") {
				if (b.fresh) await clearOp(storage, lockFn, key, ["in_flight"]);
				else await updateOp(storage, lockFn, key, { status: "retry_ready" });
				refresh();
				setError(rejectedMessage(outcome));
			} else if (outcome.kind === "mismatch") {
				setOp(await updateOp(storage, lockFn, key, { status: "uncertain" }) ?? readOp(storage));
				setStage(3);
				setError("รายละเอียดไม่ตรงกับคำขอลงประกาศเดิม ระบบจึงไม่รับ และยังเก็บคำขอเดิมไว้ กด “ตรวจผลการลงประกาศ” อีกครั้ง");
			} else {
				setOp(await updateOp(storage, lockFn, key, {
					status: "uncertain",
					job_id: outcome.job_id
				}) ?? readOp(storage));
				setStage(3);
				setError("ยังไม่รู้ผลว่าลงประกาศสำเร็จหรือไม่ อาจลงไปแล้ว หน้านี้ล็อกไว้เพื่อไม่ให้ลงซ้ำ กด “ตรวจผลการลงประกาศ”");
			}
		} finally {
			guard.current.release();
			setBusy(false);
		}
	}
	async function checkResult() {
		if (checking || preview) return;
		setChecking(true);
		setError(null);
		setInfo(null);
		try {
			if (legacy) {
				if (!legacyId) {
					setError(legacy === "unreadable" ? "อ่านสถานะกันลงซ้ำในเบราว์เซอร์นี้ไม่ได้ จึงยังล็อกไว้ เปอร์ต้องตรวจรายการประกาศและการตั้งค่าเบราว์เซอร์เอง" : "รายการเดิมไม่มีเลขประกาศ ระบบตรวจผลให้ไม่ได้ จึงยังล็อกไว้ เปอร์ต้องตรวจรายการประกาศเอง");
					return;
				}
				try {
					const job = await getBroadcastJob(legacyId);
					if (job && job.id === legacyId && job.broadcast_url) {
						setLegacyFound(job.broadcast_url);
						setInfo("พบประกาศนี้แล้ว ใช้ลิงก์ด้านล่างได้ หรือกดเริ่มประกาศใหม่");
					} else if (job) setInfo("พบประกาศนี้ แต่ระบบไม่ได้ส่งลิงก์ที่ใช้ได้กลับมา หน้านี้ยังล็อกไว้");
					else setInfo("ไม่พบประกาศเลขนี้ หน้านี้ยังล็อกไว้ เพราะรายการเก่าไม่มีรหัสคำขอให้ตรวจซ้ำได้");
				} catch {
					setError("ตรวจผลไม่สำเร็จ หน้านี้ยังล็อกไว้ ลองใหม่อีกครั้ง");
				}
				return;
			}
			if (!op || op === "corrupt") {
				if (op === "corrupt") setError("ข้อมูลสถานะเดิมอ่านไม่ได้ จึงตรวจผลไม่ได้และยังล็อกไว้");
				return;
			}
			const key = op.key;
			const st = await checkPublishStatus({ key });
			const storage = shared();
			const lockFn = browserLockFn();
			if (st.kind === "published") {
				setOp(await updateOp(storage, lockFn, key, {
					status: "published",
					job_id: st.job_id,
					broadcast_url: st.broadcast_url
				}) ?? readOp(storage));
				setInfo("ลงประกาศสำเร็จแล้ว นี่คือลิงก์เดิมของประกาศนี้");
			} else if (st.kind === "not_found" || st.kind === "pending") {
				const m = await updateOp(storage, lockFn, key, {
					status: "retry_ready",
					job_id: st.kind === "pending" ? st.job_id : null
				});
				if (!m) {
					setError("บันทึกสถานะไม่สำเร็จ หน้านี้ยังล็อกไว้");
					return;
				}
				setOp(m);
				setInfo(st.kind === "not_found" ? "ระบบยืนยันว่ายังไม่ได้ลงประกาศ ส่งอีกครั้งได้อย่างปลอดภัย ระบบจะใช้คำขอเดิม ถ้ารีเฟรชไปแล้ว ให้กรอกรายละเอียดใหม่" : "ระบบยังจองคำขอเดิมไว้และยังทำไม่เสร็จ ส่งอีกครั้งได้ด้วยคำขอเดิม ถ้ารีเฟรชไปแล้วต้องกรอกให้ตรงกับเดิมทุกช่อง ถ้าไม่ตรง ระบบจะไม่รับและยังล็อกไว้");
			} else {
				if (op.status !== "uncertain") setOp(await updateOp(storage, lockFn, key, { status: "uncertain" }) ?? readOp(storage));
				setStage(3);
				setError("ตรวจผลไม่สำเร็จ ยังไม่รู้ผล หน้านี้ยังล็อกไว้ ลองกดตรวจอีกครั้ง");
			}
		} finally {
			setChecking(false);
		}
	}
	async function startNew() {
		if (!op || op === "corrupt" || op.status !== "published") return;
		if (!await clearOp(shared(), browserLockFn(), op.key, ["published"])) {
			refresh();
			return;
		}
		setOp(null);
		setD(emptyBroadcastDraft());
		setError(null);
		setInfo(null);
		setCopied(null);
		setStage(1);
	}
	const published = op && op !== "corrupt" && op.status === "published" && op.broadcast_url ? op : null;
	async function copy(url) {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			setCopied("คัดลอกลิงก์แล้ว นำไปแชร์ได้เลย");
		} catch {
			setCopied("คัดลอกไม่สำเร็จ กรุณาลองอีกครั้ง");
		}
	}
	const canNext2 = Boolean(d.world);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "แชร์ประกาศ",
		path: "/internal/admin/jobs/create-job",
		appearance: "sigil",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-[1280px] px-3 py-3 sm:px-4 lg:py-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModeSwitch, {
						active: "broadcast",
						dirty: op !== null || JSON.stringify(d) !== JSON.stringify(emptyBroadcastDraft())
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/internal/admin/jobs/create-job",
						search: {
							mode: "broadcast",
							view: "list"
						},
						className: "inline-flex min-h-11 items-center gap-2 hover:text-gold",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(List, {
							className: "h-4 w-4",
							"aria-hidden": true
						}), "ดูประกาศที่ลงแล้ว"]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "pb-3 pt-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-1 text-[13px] font-semibold text-gold",
							children: "MMD PRIVÉ / แชร์ประกาศ"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "text-lg font-semibold leading-normal sm:text-xl",
							children: "ลงประกาศหาคนรับงาน"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-0.5 text-[13px] leading-normal text-muted-foreground",
							children: "เลือกประเภทงาน กรอกรายละเอียด แล้วตรวจประกาศก่อนลง"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
					className: "mb-3 grid grid-cols-3 gap-2 sm:gap-3",
					"aria-label": "ขั้นตอนลงประกาศ",
					children: STAGES.map((s, i) => {
						const n = i + 1;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							type: "button",
							variant: "ghost",
							disabled: locked || n > 1 && !canNext2,
							"aria-current": stage === n ? "step" : void 0,
							onClick: () => setStage(n),
							className: cn("h-auto min-h-11 w-full flex-col items-start justify-start whitespace-normal rounded-none border-t-2 px-0 py-2 text-left hover:bg-transparent sm:flex-row sm:items-center", stage === n ? "border-gold text-foreground" : "border-border text-muted-foreground"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: cn("shrink-0 whitespace-nowrap font-mono text-[12px]", stage === n && "text-gold"),
								children: ["0", n]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[13px] leading-normal",
								children: s
							})]
						}) }, s);
					})
				}),
				preview && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mb-3 flex items-center gap-2 border-l-2 border-gold pl-3 text-[13px] leading-normal text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, {
						className: "h-4 w-4 shrink-0 text-gold",
						"aria-hidden": true
					}), "หน้าตัวอย่าง ยังลงประกาศจริงไม่ได้"]
				}),
				stage === 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "pb-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-[16px] font-semibold leading-normal",
								children: "ต้องการลงประกาศแบบไหน?"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[13px] leading-normal text-muted-foreground",
								children: "เลือกว่าน้องๆและนายแบบจะเห็นรายละเอียดงานเมื่อใด"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid gap-3 sm:grid-cols-2",
							children: ["public", "private"].map((w) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								type: "button",
								variant: "outline",
								onClick: () => chooseWorld(w),
								"aria-pressed": d.world === w,
								className: cn("group flex h-auto min-h-24 flex-col items-start justify-start whitespace-normal rounded-md p-3 text-left shadow-none sm:p-4", d.world === w ? "border-gold bg-gold-muted/40" : "border-border bg-surface hover:border-gold/60 hover:bg-surface-2"),
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "flex w-full items-center justify-between",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "flex h-11 w-12 items-center justify-center text-gold",
											children: w === "private" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, {
												className: "!h-8 !w-8",
												"aria-hidden": true
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Earth, {
												className: "!h-8 !w-8",
												"aria-hidden": true
											})
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: cn("flex h-5 w-5 items-center justify-center rounded-full border", d.world === w ? "border-gold bg-gold text-primary-foreground" : "border-input"),
											children: d.world === w && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {
												className: "!h-3 !w-3",
												"aria-hidden": true
											})
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mt-3 text-[16px] font-semibold leading-normal",
										children: w === "public" ? "งานเปิดเผย · Public" : "งานส่วนตัว · Private"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mt-1 text-[13px] font-normal leading-normal text-muted-foreground",
										children: w === "public" ? "น้องๆและนายแบบดูรายละเอียดงานได้ก่อนเข้าสู่ระบบ" : "ซ่อนรายละเอียดงานจนกว่าน้องๆและนายแบบจะเข้าสู่ระบบและมีสิทธิ์ดู"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mt-3 text-[13px] leading-normal text-gold",
										children: w === "public" ? "ดูรายละเอียดได้ก่อนเข้าสู่ระบบ" : "เข้าสู่ระบบและมีสิทธิ์จึงดูรายละเอียดได้"
									})
								]
							}, w))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 flex flex-col justify-between gap-3 border-t border-border pt-3 sm:flex-row sm:items-center",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "max-w-md text-[13px] leading-normal text-muted-foreground",
								children: "ถ้าเปลี่ยนประเภทงาน ต้องกรอกรายละเอียดใหม่"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								className: "min-h-11 px-6",
								disabled: !canNext2,
								onClick: () => setStage(2),
								children: ["กรอกรายละเอียดงาน", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { "aria-hidden": true })]
							})]
						})
					]
				}),
				stage === 2 && d.world && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid items-start gap-3 lg:gap-4 lg:grid-cols-[minmax(0,1fr)_280px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(BroadcastGroup, {
								number: "01",
								title: "ชื่องานและกำหนดการ",
								hint: "ระบุย่านหรือพื้นที่ ไม่ใส่ที่อยู่ส่วนตัวหรือข้อมูลติดต่อ",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										id: "bw-title",
										label: "ชื่องาน",
										placeholder: "เช่น งานช่วงเย็น ย่านสุขุมวิท",
										max: JOB_BOARD_LIMITS.title,
										value: d.title,
										onChange: (v) => set({ title: v })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "grid gap-3 sm:grid-cols-3",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "space-y-1.5",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
													className: "text-[13px] text-muted-foreground",
													htmlFor: "bw-date",
													children: "วันที่"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													id: "bw-date",
													type: "date",
													className: "h-11 border-border bg-surface",
													value: d.date,
													onChange: (e) => set({ date: e.target.value })
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "space-y-1.5",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
													className: "text-[13px] text-muted-foreground",
													htmlFor: "bw-time",
													children: "เวลาเริ่ม"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													id: "bw-time",
													type: "time",
													className: "h-11 border-border bg-surface",
													value: d.time,
													onChange: (e) => set({ time: e.target.value })
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												id: "bw-dur",
												label: "ระยะเวลา",
												placeholder: "เช่น 2 ชม.",
												max: JOB_BOARD_LIMITS.duration,
												value: d.duration,
												onChange: (v) => set({ duration: v })
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										id: "bw-area",
										label: "ย่านหรือพื้นที่",
										placeholder: "เช่น สุขุมวิท",
										max: JOB_BOARD_LIMITS.area,
										value: d.area,
										onChange: (v) => set({ area: v })
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(BroadcastGroup, {
								number: "02",
								title: "ค่าตอบแทน",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									id: "bw-comp",
									label: "ค่าตอบแทน",
									placeholder: "เช่น ฿8,000",
									max: JOB_BOARD_LIMITS.compensation,
									value: d.compensation,
									onChange: (v) => set({ compensation: v })
								}), d.world === "private" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "space-y-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										className: "text-[13px] leading-normal text-muted-foreground",
										children: "ให้น้องๆและนายแบบเห็นค่าตอบแทนหลังเข้าสู่ระบบหรือไม่?"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "grid gap-3 sm:grid-cols-2",
										children: ["hidden", "show"].map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											type: "button",
											variant: "outline",
											"aria-pressed": d.budget === b,
											onClick: () => set({ budget: b }),
											className: cn("h-auto min-h-11 whitespace-normal px-4 py-3 text-left shadow-none", d.budget === b ? "border-gold bg-gold-muted text-foreground" : "border-border bg-surface text-muted-foreground"),
											children: b === "hidden" ? "ไม่แสดงค่าตอบแทน" : "แสดงค่าตอบแทน"
										}, b))
									})]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(BroadcastGroup, {
								number: "03",
								title: "รายละเอียดและสิ่งที่ต้องการ",
								hint: "ไม่ใส่ชื่อลูกค้า เบอร์โทร บัญชี LINE หรือข้อมูลที่บอกได้ว่าเป็นใคร",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "space-y-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
											className: "text-[13px] leading-normal text-muted-foreground",
											children: "เพศลูกค้า"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "flex flex-wrap gap-2",
											children: GENDERS.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												type: "button",
												variant: "outline",
												"aria-pressed": d.customer_gender === g,
												onClick: () => set({ customer_gender: g }),
												className: cn("min-h-11 shadow-none", d.customer_gender === g ? "border-gold bg-gold-muted text-foreground" : "border-border bg-surface text-muted-foreground"),
												children: CUSTOMER_GENDER_LABELS[g]
											}, g))
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "max-w-xs space-y-1.5",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
												className: "text-[13px] text-muted-foreground",
												htmlFor: "bw-count",
												children: "จำนวนลูกค้า (คน)"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												id: "bw-count",
												inputMode: "numeric",
												className: "h-11 border-border bg-surface",
												value: d.customer_count,
												onChange: (e) => set({ customer_count: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-[13px] leading-normal text-muted-foreground",
												children: "จำนวนลูกค้า ไม่ใช่จำนวนน้องๆและนายแบบ"
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
										id: "bw-brief",
										label: "รายละเอียดงาน (ต้องกรอก)",
										max: JOB_BOARD_LIMITS.board_text,
										rows: 4,
										value: d.board_text,
										onChange: (v) => set({ board_text: v })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BroadcastAiDraft, {
										world: d.world,
										maxLength: JOB_BOARD_LIMITS.board_text,
										onUse: (text) => set({ board_text: text })
									}, d.world),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
										id: "bw-look",
										label: "ลักษณะน้องๆและนายแบบที่ต้องการ",
										max: JOB_BOARD_LIMITS.required_appearance_profile,
										value: d.required_appearance_profile,
										onChange: (v) => set({ required_appearance_profile: v })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
										id: "bw-desc",
										label: "ข้อมูลลูกค้าที่บอกได้โดยไม่ระบุตัวตน",
										max: JOB_BOARD_LIMITS.safe_customer_description,
										value: d.safe_customer_description,
										onChange: (v) => set({ safe_customer_description: v })
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BroadcastGroup, {
								number: "04",
								title: "บันทึกส่วนตัว",
								hint: "เปอร์เท่านั้นที่เห็น น้องๆและนายแบบจะไม่เห็นข้อความนี้",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
									id: "bw-note",
									label: "บันทึกส่วนตัว",
									max: JOB_BOARD_LIMITS.owner_note,
									value: d.owner_note,
									onChange: (v) => set({ owner_note: v })
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-3 border-t border-border pt-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									variant: "ghost",
									className: "min-h-11",
									onClick: () => setStage(1),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { "aria-hidden": true }), "ย้อนกลับ"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									className: "min-h-11 flex-1 sm:flex-none",
									onClick: () => setStage(3),
									children: ["ตรวจประกาศ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { "aria-hidden": true })]
								})]
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
						className: "min-w-0 lg:sticky lg:top-36",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BroadcastTeaser, { draft: d })
					})]
				}),
				stage === 3 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid items-start gap-3 lg:gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BroadcastOwnerSummary, { draft: d }),
							missing.length > 0 && !locked && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "my-3 border-l-2 border-warn pl-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mb-2 text-sm font-medium text-warn",
									children: "กรอกข้อมูลให้ครบก่อนลงประกาศ"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "space-y-1 text-[13px] text-warn",
									children: missing.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["• ", m] }, m))
								})]
							}),
							error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								role: "alert",
								className: "my-3 flex items-start gap-2 text-[13px] leading-normal text-destructive",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
									className: "mt-0.5 h-4 w-4 shrink-0",
									"aria-hidden": true
								}), error]
							}),
							(op === null || retryReady) && !legacy && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 space-y-3 border-t border-border pt-3",
								children: [
									retryReady && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "border-l-2 border-warn pl-3 text-[13px] leading-normal text-muted-foreground",
										children: "ระบบยืนยันแล้วว่าส่งซ้ำได้ ปุ่มนี้จะใช้คำขอลงประกาศเดิม ไม่สร้างคำขอใหม่"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
										className: "min-h-11 w-full whitespace-normal",
										disabled: preview || unsupported || busy || missing.length > 0,
										onClick: publish,
										children: [busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
											className: "animate-spin",
											"aria-hidden": true
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Megaphone, { "aria-hidden": true }), retryReady ? "ส่งคำขอลงประกาศเดิมอีกครั้ง" : "ลงประกาศและรับลิงก์"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-center text-[13px] leading-normal text-muted-foreground",
										children: preview ? "หน้าตัวอย่าง ยังลงประกาศจริงไม่ได้" : unsupported ? "เบราว์เซอร์นี้กันลงซ้ำไม่ได้ จึงปิดการลงประกาศ" : "เมื่อลงประกาศแล้ว เปอร์เลือกแชร์ลิงก์เอง ยังไม่ได้ส่งเข้ากลุ่ม"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
										variant: "ghost",
										className: "min-h-11 w-full",
										onClick: () => setStage(2),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { "aria-hidden": true }), "แก้รายละเอียด"]
									})
								]
							}),
							published && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 space-y-4 border-t border-verified/40 pt-6",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, {
										className: "h-8 w-8 text-verified",
										"aria-hidden": true
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-lg font-medium text-verified",
										children: "ลงประกาศแล้ว คัดลอกลิงก์ไปแชร์ได้เลย"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-sm text-muted-foreground",
										children: "ยังไม่ได้ส่งเข้ากลุ่ม"
									}),
									published.job_id && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "break-words font-mono text-[13px] leading-normal text-muted-foreground",
										children: ["เลขประกาศ: ", published.job_id]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkBox, {
										url: published.broadcast_url,
										onCopy: () => copy(published.broadcast_url),
										copied
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "outline",
										className: "min-h-11 w-full whitespace-normal",
										onClick: startNew,
										children: "ลงประกาศใหม่ (เริ่มกรอกใหม่)"
									})
								]
							}),
							(legacy || op !== null && !published && !retryReady) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								role: "alert",
								className: "mt-3 space-y-4 border-t border-warn/40 pt-6 text-[13px] leading-normal",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
										className: "h-7 w-7 text-warn",
										"aria-hidden": true
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "font-medium text-warn",
										children: "ยังไม่รู้ผลว่าลงประกาศสำเร็จหรือไม่"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-muted-foreground",
										children: legacy ? "รายการนี้มาจากหน้าลงประกาศรุ่นก่อน ไม่มีรหัสคำขอให้ส่งซ้ำ ตรวจได้จากเลขประกาศเท่านั้น และหน้านี้จะยังล็อกไว้" : "ประกาศอาจลงไปแล้ว หน้านี้ล็อกไว้เพื่อไม่ให้ลงซ้ำ กดตรวจผลเพื่อถามระบบด้วยคำขอเดิม"
									}),
									(legacyId ?? (op && op !== "corrupt" ? op.job_id : null)) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "space-y-1.5",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
											className: "text-[13px] text-muted-foreground",
											htmlFor: "bw-ref",
											children: "เลขประกาศ"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											id: "bw-ref",
											readOnly: true,
											className: "h-11 font-mono text-[12px]",
											value: legacyId ?? (op && op !== "corrupt" ? op.job_id : "") ?? "",
											onFocus: (e) => e.currentTarget.select()
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
										className: "min-h-11 w-full whitespace-normal",
										disabled: checking || preview,
										onClick: checkResult,
										children: [checking ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
											className: "animate-spin",
											"aria-hidden": true
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { "aria-hidden": true }), "ตรวจผลการลงประกาศ"]
									}),
									preview && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-muted-foreground",
										children: "หน้าตัวอย่าง ตรวจผลจริงไม่ได้"
									}),
									legacyFound && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkBox, {
										url: legacyFound,
										onCopy: () => copy(legacyFound),
										copied
									}),
									legacyFound && legacyId && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "outline",
										className: "min-h-11 w-full",
										onClick: async () => {
											if (await releaseLegacyAfterFound(tabStore(), shared(), browserLockFn(), {
												job_id: legacyId,
												broadcast_url: legacyFound
											})) {
												setLegacy(null);
												setLegacyFound(null);
												setInfo(null);
												setStage(1);
											} else setError("ปลดล็อกไม่ได้ หน้านี้ยังล็อกไว้");
										},
										children: "เริ่มประกาศใหม่"
									})
								]
							}),
							info && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								"aria-live": "polite",
								className: "my-3 border-l-2 border-gold pl-3 text-[13px] leading-normal text-foreground",
								children: info
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
						className: "min-w-0 lg:sticky lg:top-36",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BroadcastTeaser, { draft: d })
					})]
				})
			]
		})
	});
}
/** Natural Thai for definite rejections (backend said nothing was written). */
function rejectedMessage(o) {
	const tail = "ระบบยืนยันว่ายังไม่ได้ลงประกาศ";
	if (o.status === 401 || o.status === 403) return `${tail} เพราะหมดเวลาเข้าสู่ระบบหรือไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง`;
	if (o.status === 400 || o.status === 422) return `${tail} เพราะข้อมูลบางช่องไม่ผ่านการตรวจ กรุณาแก้รายละเอียดแล้วลองอีกครั้ง`;
	if (o.status === 429) return `${tail} เพราะส่งถี่เกินไป กรุณารอสักครู่แล้วลองอีกครั้ง`;
	return `${tail} กรุณาตรวจข้อมูลแล้วลองอีกครั้ง`;
}
function LinkBox({ url, onCopy, copied }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
				className: "min-h-11 w-full",
				onClick: onCopy,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { "aria-hidden": true }), "คัดลอกลิงก์ประกาศ"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-1.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
						className: "text-[13px] text-muted-foreground",
						htmlFor: "bw-link",
						children: "ลิงก์ประกาศ"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						id: "bw-link",
						readOnly: true,
						className: "h-11 font-mono text-[12px]",
						value: url,
						onFocus: (e) => e.currentTarget.select()
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] leading-normal text-muted-foreground",
						children: "ถ้าคัดลอกด้วยปุ่มไม่ได้ ให้กดที่ช่องนี้แล้วคัดลอกเอง"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
				href: url,
				target: "_blank",
				rel: "noopener noreferrer",
				className: "inline-flex min-h-11 items-center gap-2 text-sm text-gold",
				children: ["เปิดลิงก์ประกาศ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, {
					className: "h-4 w-4",
					"aria-hidden": true
				})]
			}),
			copied && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] leading-normal text-muted-foreground",
				"aria-live": "polite",
				children: copied
			})
		]
	});
}
function Field(p) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-1.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
			htmlFor: p.id,
			className: "text-[13px] text-muted-foreground",
			children: p.label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
			id: p.id,
			className: "h-11 border-border bg-surface",
			maxLength: p.max,
			placeholder: p.placeholder,
			value: p.value,
			onChange: (e) => p.onChange(e.target.value.slice(0, p.max))
		})]
	});
}
function Area(p) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-1.5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
					htmlFor: p.id,
					className: "text-[13px] text-muted-foreground",
					children: p.label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "text-[12px] tabular-nums text-muted-foreground",
					children: [
						p.value.length,
						" / ",
						p.max
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
				id: p.id,
				className: "border-border bg-surface",
				rows: p.rows ?? 2,
				maxLength: p.max,
				value: p.value,
				onChange: (e) => p.onChange(e.target.value.slice(0, p.max))
			}),
			p.hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[12px] text-muted-foreground",
				children: p.hint
			})
		]
	});
}
function readMessage(e) {
	if (e instanceof ReadError && (e.status === 401 || e.status === 403)) return "หมดเวลาเข้าสู่ระบบหรือไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่";
	if (e instanceof ReadError && e.status === 404) return "ระบบยังไม่เปิดหน้ารายการประกาศ";
	return "โหลดรายการประกาศไม่สำเร็จ ลองใหม่อีกครั้ง";
}
var WorldTag = ({ w }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
	className: "inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[12px] text-muted-foreground",
	children: [w === "private" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, {
		className: "h-3 w-3",
		"aria-hidden": true
	}) : w === "public" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Earth, {
		className: "h-3 w-3",
		"aria-hidden": true
	}) : null, w === "private" ? "Private" : w === "public" ? "Public" : "ไม่ระบุประเภท"]
});
/** Read-only owner list. No edit/delete/close. Preview never fetches or shows fixtures. */
function BroadcastListPage({ management = false }) {
	const hydrated = useHydrated();
	const preview = !hydrated || writesBlockedInPreview();
	const [jobs, setJobs] = (0, import_react.useState)([]);
	const [cursor, setCursor] = (0, import_react.useState)(null);
	const [loaded, setLoaded] = (0, import_react.useState)(false);
	const [loading, setLoading] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [q, setQ] = (0, import_react.useState)("");
	const [open, setOpen] = (0, import_react.useState)(null);
	const [status, setStatus] = (0, import_react.useState)("all");
	async function load(next) {
		setLoading(true);
		setError(null);
		try {
			const p = await listBroadcastJobs(next);
			setJobs((x) => next ? [...x, ...p.jobs.filter((j) => !x.some((y) => y.id === j.id))] : p.jobs);
			setCursor(p.next_cursor);
			setLoaded(true);
		} catch (e) {
			setError(readMessage(e));
		} finally {
			setLoading(false);
		}
	}
	(0, import_react.useEffect)(() => {
		if (hydrated && !preview) load(null);
	}, [hydrated, preview]);
	const shown = filterLoaded(jobs, q).filter((job) => status === "all" || job.status === status);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: management ? "จัดการประกาศ" : "ประกาศที่ลงแล้ว",
		path: management ? "/internal/admin/broadcasts" : "/internal/admin/jobs/create-job",
		appearance: "sigil",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-[1280px] px-3 py-3 sm:px-4 lg:py-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/internal/admin/jobs/create-job",
					search: { mode: "broadcast" },
					className: "inline-flex min-h-11 items-center gap-2 text-[13px] text-muted-foreground hover:text-gold",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, {
						className: "h-4 w-4",
						"aria-hidden": true
					}), "กลับไปลงประกาศ"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "pb-3 pt-1",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-1 text-[13px] font-semibold text-gold",
							children: "MMD PRIVÉ / แชร์ประกาศ"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "text-lg font-semibold leading-normal sm:text-xl",
							children: management ? "จัดการประกาศ" : "ประกาศที่ลงแล้ว"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-0.5 text-[13px] leading-normal text-muted-foreground",
							children: "ประกาศที่ลงแล้ว ไม่ใช่หลักฐานว่าส่งเข้ากลุ่ม · ลำดับตามที่ระบบเก็บ ไม่ใช่ตามวันที่"
						})
					]
				}),
				management && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-4 space-y-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/internal/admin/jobs/create-job",
						search: { mode: "broadcast" },
						className: "inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
							className: "size-4",
							"aria-hidden": true
						}), "สร้างประกาศ"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "border-l-2 border-warn pl-3 text-[13px] leading-normal text-muted-foreground",
						children: "ระบบหลังบ้านยังไม่รองรับแก้ไขและยกเลิกประกาศจากหน้านี้ จึงปิดสองคำสั่งไว้เพื่อไม่ให้แสดงผลสำเร็จที่ไม่เกิดขึ้นจริง"
					})]
				}),
				preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "border-l-2 border-gold pl-3 text-[13px] leading-normal text-muted-foreground",
					children: "หน้าตัวอย่าง ไม่มีข้อมูลประกาศจริงให้แสดง"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-3 flex flex-wrap items-end gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "relative min-w-0 flex-1 basis-64",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
									className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
									"aria-hidden": true
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									"aria-label": "ค้นหาในรายการที่โหลดแล้ว",
									placeholder: "ค้นหาในรายการที่โหลดแล้ว",
									className: "h-11 border-border bg-surface pl-9",
									value: q,
									onChange: (e) => setQ(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "w-44 space-y-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									htmlFor: "announcement-status",
									children: "สถานะประกาศ"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: status,
									onValueChange: setStatus,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
										id: "announcement-status",
										className: "h-11 bg-surface",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: [
										["all", "ทุกสถานะ"],
										["published", "ลงประกาศแล้ว"],
										["draft", "ฉบับร่าง"],
										["paused", "พักประกาศ"],
										["closed", "ปิดประกาศ"],
										["expired", "หมดอายุ"]
									].map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: value ?? "all",
										children: label
									}, value)) })]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "outline",
								disabled: loading,
								onClick: () => load(null),
								className: "min-h-11",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { "aria-hidden": true }), "รีเฟรช"]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mb-3 text-[12px] text-muted-foreground",
						children: [
							"ค้นหาเฉพาะ ",
							jobs.length,
							" รายการที่โหลดมาแล้ว ไม่ใช่ทั้งหมดในระบบ"
						]
					}),
					error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						role: "alert",
						className: "mb-3 flex flex-wrap items-center gap-3 text-[13px] text-destructive",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
								className: "h-4 w-4",
								"aria-hidden": true
							}),
							error,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "outline",
								className: "min-h-11",
								onClick: () => load(loaded ? cursor : null),
								children: "ลองใหม่"
							})
						]
					}),
					loaded && jobs.length === 0 && !error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-muted-foreground",
						children: "ยังไม่มีประกาศ"
					}),
					loaded && jobs.length > 0 && shown.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-muted-foreground",
						children: "ไม่พบในรายการที่โหลดแล้ว"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "divide-y divide-border rounded-md border border-border bg-surface",
						children: shown.map((j) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "ghost",
							type: "button",
							"aria-expanded": open === j.id,
							onClick: () => setOpen(open === j.id ? null : j.id),
							className: "flex h-auto min-h-14 w-full flex-wrap justify-start whitespace-normal rounded-none gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-surface-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "min-w-0 flex-1 basis-48 text-[13px] font-semibold text-foreground [overflow-wrap:anywhere]",
									children: j.title ?? (j.world === "private" ? "งาน Private" : "ไม่มีชื่องาน")
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorldTag, { w: j.world }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[12px] text-muted-foreground",
									children: j.status ?? "ไม่ทราบสถานะ"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "w-full font-mono text-[12px] text-muted-foreground [overflow-wrap:anywhere]",
									children: [j.id, j.created_at ? ` · ${j.created_at}` : ""]
								})
							]
						}), open === j.id && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Detail, {
							id: j.id,
							management
						})] }, j.id))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 flex items-center gap-3",
						children: [
							loading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
								className: "h-4 w-4 animate-spin text-muted-foreground",
								"aria-label": "กำลังโหลด"
							}),
							loaded && cursor && !loading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "outline",
								className: "min-h-11",
								onClick: () => load(cursor),
								children: "โหลดเพิ่ม"
							}),
							loaded && !cursor && jobs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[12px] text-muted-foreground",
								children: "โหลดครบทุกหน้าแล้ว"
							})
						]
					})
				] })
			]
		})
	});
}
function Detail({ id, management }) {
	const [state, setState] = (0, import_react.useState)({ kind: "loading" });
	const [copied, setCopied] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		let live = true;
		getBroadcastJob(id).then((job) => live && setState(job ? {
			kind: "ok",
			job
		} : { kind: "absent" })).catch((e) => live && setState({
			kind: "error",
			msg: readMessage(e)
		}));
		return () => {
			live = false;
		};
	}, [id]);
	if (state.kind === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
		className: "px-3 pb-3 text-[13px] text-muted-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
			className: "mr-2 inline h-4 w-4 animate-spin",
			"aria-hidden": true
		}), "กำลังโหลดรายละเอียด"]
	});
	if (state.kind === "absent") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "px-3 pb-3 text-[13px] text-muted-foreground",
		children: "ไม่พบประกาศนี้ในระบบ"
	});
	if (state.kind === "error") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		role: "alert",
		className: "px-3 pb-3 text-[13px] text-destructive",
		children: state.msg
	});
	const j = state.job;
	const Row = ({ k, v }) => v ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-1 sm:grid-cols-[180px_1fr]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
			className: "text-muted-foreground",
			children: k
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
			className: "text-foreground [overflow-wrap:anywhere] whitespace-pre-wrap",
			children: v
		})]
	}) : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4 border-t border-border bg-surface-2 px-3 py-3 text-[13px] lg:grid-cols-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
			className: "space-y-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					k: "สถานะ",
					v: j.status
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					k: "สร้างเมื่อ",
					v: j.created_at
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					k: "แก้ไขล่าสุด",
					v: j.updated_at
				}),
				j.public.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
					k: p.key,
					v: String(p.value)
				}, p.key)),
				j.protected && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						k: "ที่มา (เฉพาะเปอร์)",
						v: j.protected.source_brief
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						k: "รายละเอียดเพิ่มเติม (เฉพาะเปอร์)",
						v: j.protected.deeper_interest_detail
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						k: "บันทึกส่วนตัว (เฉพาะเปอร์)",
						v: j.protected.owner_note
					})
				] })
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: cn("min-w-0"),
			children: [management && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-4 flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "outline",
					disabled: true,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { "aria-hidden": true }), "แก้ไขประกาศ"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "outline",
					disabled: true,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ban, { "aria-hidden": true }), "ยกเลิกประกาศ"]
				})]
			}), j.broadcast_url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkBox, {
				url: j.broadcast_url,
				copied,
				onCopy: async () => {
					try {
						await navigator.clipboard.writeText(j.broadcast_url);
						setCopied("คัดลอกลิงก์แล้ว");
					} catch {
						setCopied("คัดลอกไม่สำเร็จ กรุณาลองอีกครั้ง");
					}
				}
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-muted-foreground",
				children: "ระบบไม่ได้ส่งลิงก์ที่ใช้ได้กลับมา"
			})]
		})]
	});
}
//#endregion
export { Label as a, SelectContent as c, SelectValue as d, Textarea as f, CUSTOMER_GENDER_LABELS as i, SelectItem as l, BroadcastListPage as n, ModeSwitch as o, publishToJobBoard as p, BroadcastWorkPage as r, Select as s, BOARD_TEXT_MAX as t, SelectTrigger as u };
