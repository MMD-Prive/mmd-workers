import { c as writesBlockedRuntime, s as isPreviewRuntime } from "./client-DnJZI2KL.mjs";
import { w as useHydrated } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/provider-CvQy8AcV.js
/**
* Canonical Airtable record id guard (`rec...`).
* Identity authority is the Airtable record id — never a name, alias,
* LINE display name, R2 key, path or filename.
*/
function isCanonicalRecordId(id) {
	return typeof id === "string" && /^rec[A-Za-z0-9]{6,}$/.test(id.trim());
}
/**
* A canonical item is selectable only with a canonical Models record id, and
* unless the backend explicitly disabled it.
*/
function modelSelectable(m) {
	return isCanonicalRecordId(m.model_id) && m.selectable !== false && !m.disabled_reason;
}
function modelName(m) {
	return m.model_name || m.display_name;
}
var EMPTY_PRIVATE_ACCESS = {
	folder: null,
	orientation: null,
	job_type: null,
	service_options: [],
	settlement: null,
	model_payout_thb: null
};
var JobGrantError = class extends Error {
	detail;
	constructor(detail) {
		super(detail.message ?? detail.code);
		this.name = "JobGrantError";
		this.detail = detail;
	}
};
/** Read the backend-declared source kind; unknown/absent → null (no badge). */
function readSourceKind(raw) {
	for (const k of [
		"source_kind",
		"source_type",
		"model_source"
	]) {
		const v = raw[k];
		if (typeof v === "string") {
			const t = v.trim().toLowerCase();
			if (t === "direct" || t === "partner") return t;
		}
	}
	if (raw["is_partner"] === true || raw["partner"] === true) return "partner";
	if (raw["is_partner"] === false) return "direct";
	return null;
}
/** Case-insensitive substring/prefix match over display, working name and lookup key. */
function modelMatches(m, q) {
	const needle = q.trim().toLowerCase();
	if (!needle) return true;
	return [
		m.display_name,
		m.model_name,
		m.working_name,
		m.model_lookup_key,
		m.code
	].filter((v) => typeof v === "string" && v.length > 0).some((v) => v.toLowerCase().includes(needle));
}
function sortAlpha(models) {
	return [...models].sort((a, b) => a.display_name.localeCompare(b.display_name, "th"));
}
/**
* Merge backend-declared Partner attribution from the ordinary
* GET /v1/admin/models/search into the canonical drive-selected model.
* Only an exact model_id match from a response with source_lookup_ok === true
* counts; anything else stays unknown (never inferred Direct). Identity fields
* are never touched.
*/
function mergeAttribution(model, result) {
	const unknown = {
		...model,
		source_kind: null,
		partner_id: null,
		partner_name: null,
		partner_record_id: null,
		private_work_capabilities: []
	};
	if (!result || !/^rec[A-Za-z0-9]{6,}$/.test(model.model_id)) return unknown;
	const hit = result.find((r) => r.model_id === model.model_id);
	if (!hit) return unknown;
	const withPhotos = {
		...unknown,
		private_work_capabilities: hit.private_work_capabilities ?? [],
		selectable: hit.selectable ?? true,
		disabled_reason: hit.disabled_reason ?? null,
		profile_image_url: hit.profile_image_url ?? model.profile_image_url ?? null,
		profile_photos: hit.profile_photos?.length ? hit.profile_photos : model.profile_photos ?? []
	};
	if (result.source_lookup_ok !== true || hit.source_kind !== "direct" && hit.source_kind !== "partner") return withPhotos;
	if (hit.source_kind === "direct") return {
		...withPhotos,
		source_kind: "direct"
	};
	return {
		...withPhotos,
		source_kind: "partner",
		partner_id: hit.partner_id ?? null,
		partner_name: hit.partner_name ?? null,
		partner_record_id: hit.partner_record_id ?? null
	};
}
function sameAttribution(a, b) {
	return (a.source_kind ?? null) === (b.source_kind ?? null) && (a.partner_id ?? null) === (b.partner_id ?? null) && (a.partner_name ?? null) === (b.partner_name ?? null) && (a.partner_record_id ?? null) === (b.partner_record_id ?? null) && (a.profile_image_url ?? null) === (b.profile_image_url ?? null) && JSON.stringify(a.profile_photos ?? []) === JSON.stringify(b.profile_photos ?? []) && JSON.stringify(a.private_work_capabilities ?? []) === JSON.stringify(b.private_work_capabilities ?? []) && a.selectable === b.selectable && a.disabled_reason === b.disabled_reason;
}
var PRIVATE_SEARCH_FOLDERS = [
	"standard",
	"premium",
	"exclusive"
];
var PRIVATE_SERVICE_OPTIONS = [
	"mk",
	"burn",
	"live",
	"group"
];
/** Search scope is an operator selection, never a client's package code. */
function modelSearchScope(isPrivate, access) {
	if (!isPrivate) return {
		bookingVisibility: "public",
		customerLane: null,
		selectedAccessFolder: null,
		privateWork: null,
		serviceOptions: []
	};
	if (!access.folder || !PRIVATE_SEARCH_FOLDERS.includes(access.folder) || !access.orientation || !["straight", "gay"].includes(access.orientation) || !access.job_type || !["pn", "vip"].includes(access.job_type)) return null;
	return {
		bookingVisibility: "private",
		customerLane: access.orientation,
		selectedAccessFolder: access.folder,
		privateWork: access.job_type,
		serviceOptions: []
	};
}
function privateModelScopeChanged(current, patch) {
	return patch.folder !== void 0 && patch.folder !== current.folder || patch.orientation !== void 0 && patch.orientation !== current.orientation || patch.job_type !== void 0 && patch.job_type !== current.job_type;
}
/** Keep scope on Back/Next; only a changed booking scope invalidates the model. */
function updatePrivateModelSelection(current, patch) {
	const changed = privateModelScopeChanged(current.access, patch);
	return {
		access: {
			...current.access,
			...patch
		},
		model: changed ? null : current.model,
		step: changed ? 4 : current.step
	};
}
/** Read only the exact backend-declared capabilities for the selected model. */
function privateModelReady(model, requested) {
	return Boolean(model && requested && model.private_work_capabilities?.includes(requested));
}
var money = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
var round2 = (n) => Math.round(n * 100) / 100;
/**
* Discount math. Gross = client base + selected option client rates.
* Promotion splits 50/50 (model half floored to satang); customer_request is
* fully absorbed by MMD. Partner-managed jobs are forced to customer_request.
*/
function computeDiscount(gross, discount, opts = {}) {
	if (!discount || discount.value === null || discount.value === void 0 || Number.isNaN(discount.value)) return {
		active: false,
		missing: []
	};
	const missing = [];
	const mode = opts.partnerManaged ? "customer_request" : discount.mode;
	const value = discount.value;
	if (!Number.isFinite(value) || value <= 0) missing.push("ส่วนลดต้องมากกว่า 0");
	if (discount.type === "percent" && value > 100) missing.push("ส่วนลด % ต้องไม่เกิน 100");
	const reason = discount.reason?.trim() ?? "";
	if (mode === "promotion" && !reason) missing.push("กรอกอ้างอิงโปรโมชั่น");
	if (reason.length > 200) missing.push("อ้างอิงโปรโมชั่นยาวเกิน 200 ตัวอักษร");
	if (gross === null) return {
		active: true,
		missing,
		mode,
		discount: null
	};
	const amount = discount.type === "percent" ? Math.round(gross * value) / 100 : round2(value);
	if (!(amount > 0) || amount >= gross) missing.push("ส่วนลดต้องน้อยกว่ายอดลูกค้ารวม");
	const modelShare = mode === "promotion" ? Math.floor(amount * 100 / 2) / 100 : 0;
	const mmdShare = round2(amount - modelShare);
	return {
		active: true,
		missing,
		mode,
		discount: {
			mode,
			type: discount.type,
			value,
			amount_thb: amount,
			mmd_share_thb: mmdShare,
			model_share_thb: modelShare,
			...mode === "promotion" && reason ? { reason } : {}
		}
	};
}
/** Explicit quotes only. Unselected options never enter the submitted totals. */
function servicePricing(base, access, opts = {}) {
	const pm = opts.partnerManaged === true;
	const options = PRIVATE_SERVICE_OPTIONS.filter((option) => access?.service_options?.includes(option));
	const addons = options.map((option) => ({
		option,
		client_amount_thb: access?.service_rates?.[option]?.client_amount_thb ?? null,
		model_payout_thb: access?.service_rates?.[option]?.model_payout_thb ?? null
	}));
	const missing = [];
	if (!money(base) || base <= 0) missing.push("ราคาตั้งต้นจากลูกค้าต้องมากกว่า 0");
	const needsModelBase = !pm && (access?.settlement === "direct" || options.length > 0);
	if (needsModelBase && (!money(access?.model_payout_thb) || access.model_payout_thb <= 0)) missing.push("กรอกยอดจ่ายน้องๆและนายแบบตั้งต้นมากกว่า 0");
	for (const addon of addons) {
		if (!money(addon.client_amount_thb)) missing.push(`กรอกเรทลูกค้า ${addon.option.toUpperCase()} (0 ได้ถ้าตกลงไว้)`);
		if (!pm && !money(addon.model_payout_thb)) missing.push(`กรอกเรทน้องๆและนายแบบ ${addon.option.toUpperCase()} (0 ได้ถ้าตกลงไว้)`);
	}
	const clientGross = money(base) && addons.every((a) => money(a.client_amount_thb)) ? Math.round((base + addons.reduce((sum, a) => sum + a.client_amount_thb, 0)) * 100) / 100 : null;
	const modelGross = needsModelBase && money(access?.model_payout_thb) && addons.every((a) => money(a.model_payout_thb)) ? Math.round((access.model_payout_thb + addons.reduce((sum, a) => sum + a.model_payout_thb, 0)) * 100) / 100 : null;
	const disc = computeDiscount(clientGross, access?.discount, { partnerManaged: pm });
	missing.push(...disc.missing);
	const d = disc.active && disc.missing.length === 0 ? disc.discount : null;
	const clientTotal = clientGross !== null && d ? round2(clientGross - d.amount_thb) : clientGross;
	const modelTotal = modelGross !== null && d ? round2(modelGross - d.model_share_thb) : modelGross;
	if (clientTotal !== null && !money(clientTotal)) missing.push("ยอดลูกค้ารวมไม่ถูกต้อง");
	if (modelTotal !== null && !money(modelTotal)) missing.push("ยอดน้องๆและนายแบบรวมไม่ถูกต้อง");
	return {
		missing,
		clientGross,
		modelGross,
		clientTotal,
		modelTotal,
		discount: d,
		addons,
		modelBaseActive: needsModelBase,
		snapshot: access && missing.length === 0 ? {
			version: 1,
			currency: "THB",
			settlement_mode: access.settlement,
			client_base_amount_thb: base,
			model_base_payout_thb: needsModelBase ? access.model_payout_thb : null,
			addons: pm ? addons.map((a) => ({
				...a,
				model_payout_thb: null
			})) : addons,
			...d ? {
				client_gross_amount_thb: clientGross,
				...needsModelBase && modelGross !== null ? { model_gross_payout_thb: modelGross } : {},
				discount: d
			} : {},
			client_total_amount_thb: clientTotal,
			model_total_payout_thb: needsModelBase ? modelTotal : null
		} : null
	};
}
var EMPTY_PARTNER = {
	channel: "direct",
	name: "",
	record_id: null,
	type: null,
	combined_rate_thb: null,
	follower_tier: null,
	confirmed_percent: null,
	share_percent: null,
	revenue_thb: null,
	agreed_costs_thb: null
};
var BRIDGE_TIERS = [
	{
		id: "lt10k",
		label: "<10K",
		percent: 5
	},
	{
		id: "10-49k",
		label: "10–49K",
		percent: 6
	},
	{
		id: "50-99k",
		label: "50–99K",
		percent: 7
	},
	{
		id: "100-299k",
		label: "100–299K",
		percent: 8
	},
	{
		id: "300-499k",
		label: "300–499K",
		percent: 9
	},
	{
		id: "500k+",
		label: "500K+",
		percent: 10
	}
];
var PARTNER_TYPE_LABEL = {
	bridge: "Bridge",
	co_partner: "Co-Partner",
	profit_share: "Profit Share"
};
/** Co-Partner = partner-managed settlement; Worker discards model payout aliases. */
function isPartnerManaged(p) {
	return p?.channel === "partner" && p.type === "co_partner";
}
var isRec = (v) => typeof v === "string" && /^rec[A-Za-z0-9]{6,}$/.test(v);
/** Step 03 choice is explicit; Partner needs a real backend partner record. */
function sourceChoiceReady(p) {
	return p?.source_choice === "direct" || p?.source_choice === "partner" && isRec(p.record_id);
}
/** Choosing a (different) partner keeps only identity; another partner's agreement is never carried over. */
function selectPartner(current, p) {
	return {
		...current.record_id === p.partner_record_id ? current : EMPTY_PARTNER,
		channel: "partner",
		source_choice: "partner",
		name: p.partner_name,
		record_id: p.partner_record_id,
		auto_from_model: false
	};
}
var DIRECT_CHOICE = {
	...EMPTY_PARTNER,
	source_choice: "direct"
};
/** Backend linkage URL only: https://www.mmdbkk.com/partner/dashboard?session_id=… — anything else is hidden. */
function safePartnerDashboardUrl(v) {
	if (typeof v !== "string") return null;
	try {
		const u = new URL(v);
		if (u.protocol !== "https:" || !["www.mmdbkk.com", "mmdbkk.com"].includes(u.hostname)) return null;
		if (u.pathname !== "/partner/dashboard" || !u.searchParams.get("session_id")) return null;
		return u.toString();
	} catch {
		return null;
	}
}
function partnerMissing(p) {
	if (!p || p.channel !== "partner") return [];
	const m = [];
	if (!isRec(p.record_id)) m.push("Partner: ต้องเลือก Partner จากรายการ");
	if (!p.name.trim()) m.push("Partner: ต้องระบุชื่อ partner");
	if (!p.type) m.push("Partner: ต้องเลือกประเภท partner");
	if (p.type === "co_partner" && !(typeof p.combined_rate_thb === "number" && p.combined_rate_thb > 0)) m.push("Partner: ต้องกรอกเรทรวม Co-Partner มากกว่า 0");
	if (p.type === "profit_share" && !(typeof p.share_percent === "number" && p.share_percent > 0 && p.share_percent <= 100)) m.push("Partner: ต้องกรอก Partner Share % (1–100)");
	return m;
}
/** Body fragments for the existing contract. Direct → nothing. */
function partnerBodyFields(p) {
	if (!p || p.channel !== "partner" || !p.type || !p.name.trim()) return {
		attribution: null,
		relationship: null
	};
	const attribution = {
		partner_name: p.name.trim(),
		partner_type: p.type
	};
	if (isRec(p.record_id)) attribution["partner_record_id"] = p.record_id;
	return {
		attribution,
		relationship: isPartnerManaged(p) ? {
			settlement_method: "partner_managed",
			settlement_owner: "modeling_partner",
			partner_quoted_rate_thb: p.combined_rate_thb
		} : null
	};
}
function modelPartnerLink(model, active) {
	if (model.source_kind === "direct") return { state: "direct" };
	if (model.source_kind !== "partner") return { state: "unknown" };
	const rec = isRec(model.partner_record_id) ? model.partner_record_id : null;
	return {
		state: "partner",
		name: model.partner_name?.trim() || null,
		record_id: rec,
		active: rec && active ? active.find((p) => p.partner_record_id === rec) ?? null : null
	};
}
function linkBadge(link) {
	if (link.state === "direct") return {
		label: "Direct · รับงานตรง",
		warn: false
	};
	if (link.state === "unknown") return {
		label: "ต้องยืนยัน · ระบบยังไม่ระบุ Direct/Partner",
		warn: true
	};
	const name = link.active?.partner_name ?? link.name;
	return name ? {
		label: `Partner · ${name}`,
		warn: false
	} : {
		label: "Partner · ต้องยืนยันชื่อพาร์ตเนอร์",
		warn: true
	};
}
/**
* Blocking conflict between the backend-declared linkage and Per's choice.
* `activeLoaded` = the active partner lookup succeeded.
*/
function partnerConflict(link, draft, activeLoaded) {
	const choice = draft.source_choice ?? null;
	if (link.state === "direct" && choice === "partner") return "ระบบระบุว่าน้องคนนี้รับงานตรง แต่เลือกผ่านพาร์ตเนอร์ไว้ · กรุณาเลือกให้ตรงกันหรือยืนยันกับระบบก่อน";
	if (link.state !== "partner") return null;
	const name = link.active?.partner_name ?? link.name ?? "พาร์ตเนอร์";
	if (link.record_id && activeLoaded && !link.active) return `พาร์ตเนอร์ของน้องคนนี้ (${name}) ไม่อยู่ในรายชื่อที่ใช้งานอยู่ · ต้องตรวจข้อมูลก่อน`;
	if (choice === "direct") return `ระบบระบุว่าน้องคนนี้อยู่กับ ${name} แต่เลือกรับงานตรงไว้ · กรุณาเลือกให้ตรงกัน`;
	if (choice === "partner" && link.record_id && isRec(draft.record_id) && draft.record_id !== link.record_id) return `ระบบระบุว่าน้องคนนี้อยู่กับ ${name} แต่เลือก ${draft.name || "พาร์ตเนอร์อื่น"} ไว้ · กรุณาเลือกให้ตรงกัน`;
	return null;
}
/** Preselect the backend-linked active Partner only when Per has not chosen yet. */
function preselectFromModel(draft, link) {
	if (draft.source_choice) return draft;
	if (link.state !== "partner" || !link.active) return draft;
	return {
		...selectPartner(draft, link.active),
		auto_from_model: true
	};
}
/** Adopt the backend-linked Partner explicitly (resolve a mismatch). */
function adoptModelPartner(draft, link) {
	if (link.state !== "partner" || !link.active) return null;
	return {
		...selectPartner(draft, link.active),
		auto_from_model: true
	};
}
/** Changing model keeps Per's explicit choice; only a block auto-filled from the previous model is cleared. */
function partnerOnModelChange(draft) {
	if (!draft || draft.auto_from_model) return {
		...EMPTY_PARTNER,
		source_choice: null
	};
	return draft;
}
/** Deterministic end time = start_time + duration_minutes (HH:MM, 24h). */
function computeEndTime(start, durationMinutes) {
	if (!start || !durationMinutes) return "";
	const [h, m] = start.split(":").map((n) => Number(n));
	if (Number.isNaN(h) || Number.isNaN(m)) return "";
	const total = h * 60 + m + durationMinutes;
	return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
/**
* Canonical MMD deposit rule (fixed, not operator-selectable):
* 30% of the final service amount, rounded UP to the next 500 THB step,
* capped at the full amount. Backend remains authoritative.
*/
function computeDepositBreakdown(amount) {
	if (!amount || amount <= 0) return null;
	const deposit = Math.min(amount, Math.ceil(amount * .3 / 500) * 500);
	return {
		deposit,
		balance: amount - deposit
	};
}
/** Canonical Create Job durations (minutes). 360 is the maximum. */
var DURATION_OPTIONS = [
	{
		minutes: 90,
		label: "1 ชั่วโมง 30 นาที"
	},
	{
		minutes: 120,
		label: "2 ชั่วโมง"
	},
	{
		minutes: 150,
		label: "2 ชั่วโมง 30 นาที"
	},
	{
		minutes: 180,
		label: "3 ชั่วโมง"
	},
	{
		minutes: 240,
		label: "4 ชั่วโมง"
	},
	{
		minutes: 270,
		label: "4 ชั่วโมง 30 นาที"
	},
	{
		minutes: 300,
		label: "5 ชั่วโมง"
	},
	{
		minutes: 360,
		label: "6 ชั่วโมง"
	}
];
/** Empty is allowed; when filled it must be a valid https URL. */
function isValidMapUrl(v) {
	const s = (v ?? "").trim();
	if (!s) return true;
	try {
		return new URL(s).protocol === "https:";
	} catch {
		return false;
	}
}
function clean(o) {
	return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== void 0 && v !== null && v !== ""));
}
function buildJobBody({ client, work, model, details, privateAccess }, intent = "create") {
	const visibility = work.lane === "private" ? "private" : "public";
	const isPrivate = visibility === "private";
	const pa = isPrivate ? privateAccess : void 0;
	const name = modelName(model);
	const clientName = client.client_name || client.canonical_name || client.remembered_name || "";
	const endTime = computeEndTime(details.time, details.duration_minutes);
	const jobType = pa?.job_type ?? work.code;
	const partnerManaged = isPartnerManaged(details.partner);
	const partner = partnerBodyFields(details.partner);
	const pricing = servicePricing(details.amount_thb, pa, { partnerManaged });
	if (intent === "create" && pricing.missing.length) throw new Error(pricing.missing.join(" · "));
	const travelFee = details.travel_fee_thb ?? 0;
	const modelTravelFee = details.model_travel_fee_thb ?? 0;
	const amount = pricing.clientTotal === null ? null : Math.round((pricing.clientTotal + travelFee) * 100) / 100;
	const privatePayout = pa?.settlement === "direct" ? pricing.modelTotal : null;
	const publicPayout = !isPrivate ? details.model_base_payout_thb : null;
	const basePayout = !partnerManaged ? isPrivate ? privatePayout : publicPayout : null;
	const payout = basePayout && basePayout > 0 ? Math.round((basePayout + modelTravelFee) * 100) / 100 : null;
	const dep = computeDepositBreakdown(amount);
	const depositFields = dep ? {
		payment_type: "deposit",
		payment_stage: "deposit",
		payment_original_type: "deposit_confirmed",
		deposit_percent: 30,
		deposit_amount_thb: dep.deposit,
		balance_amount_thb: dep.balance,
		service_amount_thb: amount
	} : {};
	return clean({
		job_date: details.date,
		start_time: details.time,
		end_time: endTime,
		google_map_url: details.google_map_url?.trim(),
		amount_thb: amount,
		travel_fee_thb: travelFee,
		model_travel_fee_thb: modelTravelFee,
		...depositFields,
		...payout ? {
			pay_model_thb: payout,
			model_payout_thb: payout,
			model_payout: clean({ amount_thb: payout })
		} : {},
		...pa ? { private_access: clean({
			selected_private_folder: pa.folder,
			selected_orientation: pa.orientation,
			settlement_mode: partnerManaged ? void 0 : pa.settlement
		}) } : {},
		original_amount_thb: pricing.discount ? Math.round(((pricing.clientGross ?? 0) + travelFee) * 100) / 100 : amount,
		...intent === "draft" ? { pricing_draft: {
			version: 1,
			currency: "THB",
			client_base_amount_thb: details.amount_thb,
			private_access: pa ?? null
		} } : pricing.snapshot ? { service_pricing: {
			...pricing.snapshot,
			travel_fee_thb: travelFee,
			model_travel_fee_thb: modelTravelFee,
			model_total_payout_thb: pricing.snapshot.model_total_payout_thb === null ? null : Math.round((pricing.snapshot.model_total_payout_thb + modelTravelFee) * 100) / 100
		} } : {},
		...details.partner?.source_choice ? { model_source_choice: details.partner.source_choice } : {},
		...partner.attribution && details.partner?.source_choice !== "direct" ? { partner_attribution: partner.attribution } : {},
		client_name: clientName,
		model_name: name,
		job_type: jobType,
		client_lineage: clean({
			client_id: client.client_id,
			client_name: clientName,
			canonical_name: client.canonical_name,
			remembered_name: client.remembered_name,
			member_id: client.member_id,
			member_email: client.member_email,
			line_user_id: client.line_user_id,
			customer_telegram_status: client.customer_telegram_status
		}),
		line_identity: clean({ line_user_id: client.line_user_id }),
		model: clean({
			model_id: model.model_id,
			model_name: name,
			model_lookup_key: model.model_lookup_key,
			telegram_username: model.telegram_username,
			telegram_status: model.telegram_status,
			visibility: model.visibility,
			folder: model.folder
		}),
		work: clean({
			job_visibility: visibility,
			job_lane: work.lane,
			work_type: work.code,
			job_type: jobType,
			...pa ? { service_options: pa.service_options ?? [] } : {},
			model_folder: pa?.folder ?? model.folder,
			selected_model_folder: pa?.folder ?? model.folder
		}),
		job_details: clean({
			job_date: details.date,
			start_time: details.time,
			end_time: computeEndTime(details.time, details.duration_minutes),
			duration_minutes: details.duration_minutes,
			location_name: details.location,
			google_map_url: details.google_map_url?.trim(),
			meeting_point: [details.meeting_choice === "lobby" ? "รอที่ล็อบบี้" : details.meeting_choice === "meet_client" ? "ไปพบลูกค้า" + (details.meeting_details?.trim() ? ": " + details.meeting_details.trim() : "") : details.meeting_point, details.room_number?.trim() ? "เลขห้อง/บ้านเลขที่: " + details.room_number.trim() : ""].filter(Boolean).join(" · "),
			brief: details.brief,
			reference_code: details.reference_code,
			...pricing.discount ? { discount: pricing.discount } : {},
			travel_fee_thb: travelFee,
			model_travel_fee_thb: modelTravelFee,
			...partner.relationship ? { partner_relationship: partner.relationship } : {}
		}),
		payment: clean({
			amount_thb: amount,
			...depositFields,
			...payout ? {
				model_payout_thb: payout,
				settlement_mode: "direct"
			} : {},
			travel_fee_thb: travelFee,
			model_travel_fee_thb: modelTravelFee,
			payment_method: "promptpay"
		}),
		notes: clean({ operation_note: details.operator_note })
	});
}
/** Normalize the Worker `{ok:true, session_id, ...}` shape to the UI shape. */
function normalizeJobResponse(raw) {
	const ok = raw["ok"] !== false;
	const sessionId = raw["session_id"] ?? raw["session_ref"] ?? null;
	const status = ok ? sessionId ? "created" : "pending" : "rejected";
	const num = (k) => typeof raw[k] === "number" && Number.isFinite(raw[k]) ? raw[k] : null;
	const payUrlRaw = raw["customer_payment_url"];
	const customerPaymentUrl = typeof payUrlRaw === "string" && /^https:\/\/.+/.test(payUrlRaw.trim()) ? payUrlRaw.trim() : null;
	const notificationRaw = raw["notification_status"];
	const notificationStatus = notificationRaw === "sent" || notificationRaw === "failed" || notificationRaw === "not_configured" ? notificationRaw : null;
	const warnings = Array.isArray(raw["warnings"]) ? raw["warnings"].filter((w) => typeof w === "string") : [];
	return {
		status: raw["status"] ?? status,
		session_ref: sessionId,
		payment_ref: raw["payment_ref"] ?? null,
		customer_confirmation_url: null,
		model_confirmation_url: null,
		operational_status: typeof raw["operational_status"] === "string" ? raw["operational_status"] : null,
		pending_client: raw["pending_client"] === true,
		confirmations_held: raw["confirmations_held"] === true,
		customer_payment_url: raw["pending_client"] === true || raw["confirmations_held"] === true || [
			"pending_client_link",
			"pending_model_link",
			"pending_identity_link"
		].includes(String(raw["operational_status"])) ? null : customerPaymentUrl,
		amount_due_thb: num("amount_due_thb"),
		payment_type: raw["payment_type"] ?? null,
		deposit_amount_thb: num("deposit_amount_thb"),
		balance_amount_thb: num("balance_amount_thb"),
		payment_dispatch_state: raw["payment_dispatch_state"] ?? null,
		notification_status: notificationStatus,
		message: raw["message"] ?? raw["error"] ?? null,
		warnings,
		linkage: raw["linkage"] ?? null,
		reconfirm: raw["reconfirm"] ?? null
	};
}
/** Normalize a backend model item to the UI ModelOption shape. */
function normalizeModel(raw) {
	const s = (k) => raw[k] ?? null;
	const name = s("model_name") ?? s("display_name") ?? s("name") ?? s("model_id") ?? "";
	return {
		model_id: s("model_id") ?? s("id") ?? name,
		display_name: name,
		model_name: s("model_name") ?? name,
		model_lookup_key: s("model_lookup_key"),
		profile_image_url: s("profile_image_url"),
		profile_photos: Array.isArray(raw["profile_photos"]) ? raw["profile_photos"].filter((url) => typeof url === "string") : [],
		code: s("model_lookup_key") ?? s("code"),
		lane: s("lane") ?? s("customer_lane"),
		visibility: s("visibility") ?? s("booking_visibility") ?? "",
		availability_note: s("availability_note"),
		telegram_username: s("telegram_username"),
		telegram_status: s("telegram_status"),
		folder: s("folder") ?? s("access_folder") ?? s("selected_access_folder"),
		private_review_status: s("private_review_status"),
		private_work_capabilities: Array.isArray(raw["private_work_capabilities"]) ? raw["private_work_capabilities"].filter((v) => v === "pn" || v === "vip") : [],
		requires_per_approval: raw["requires_per_approval"] === true,
		selectable: raw["selectable"] === false ? false : true,
		disabled_reason: s("disabled_reason") ?? s("blocked_reason"),
		rate_display: s("rate_display"),
		source: s("source") ?? "airtable",
		source_kind: readSourceKind(raw),
		working_name: s("working_name"),
		partner_id: s("partner_id"),
		partner_name: s("partner_name"),
		partner_record_id: s("partner_record_id"),
		drive_folder_id: s("drive_folder_id"),
		drive_folder_url: s("drive_folder_url"),
		folder_path: s("folder_path"),
		folder_name: s("folder_name"),
		materialized: raw["materialized"] === true
	};
}
var PENDING_KEY = "mmd.createJob.pending.v1";
var REF_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
var ApiHttpError = class extends Error {
	status;
	body;
	constructor(message, status, body) {
		super(message);
		this.name = "ApiHttpError";
		this.status = status;
		this.body = body;
	}
};
function safeRef(v) {
	return typeof v === "string" && REF_RE.test(v) ? v : null;
}
function refsFrom(src) {
	const refs = {
		session_ref: null,
		payment_ref: null
	};
	const scan = (value, depth) => {
		if (!value || typeof value !== "object" || depth > 3) return;
		const d = value;
		refs.session_ref ??= safeRef(d["session_id"]) ?? safeRef(d["session_ref"]);
		refs.payment_ref ??= safeRef(d["payment_ref"]) ?? safeRef(d["payment_id"]);
		scan(d["data"], depth + 1);
		scan(d["error"], depth + 1);
	};
	scan(src, 0);
	return refs;
}
/** Only these exact 409 codes are returned by the pre-create Worker policy guard. */
function privateWorkRejection(e) {
	if (!(e instanceof ApiHttpError) || e.status !== 409 || e.body?.["ok"] !== false) return null;
	if (hasRefs(refsFrom(e.body))) return null;
	const error = e.body["error"];
	const code = error && typeof error === "object" ? error["code"] : e.body["error_code"];
	if (code === "private_model_service_level_unclassified") return "ยังไม่ได้สร้างงาน: น้องๆและนายแบบคนนี้ยังไม่มีข้อมูล PN/VIP ที่ยืนยันได้ กรุณาตรวจข้อมูลผู้รับงาน หรือเลือกคนอื่น";
	if (code === "private_model_work_not_allowed") return "ยังไม่ได้สร้างงาน: น้องๆและนายแบบคนนี้ไม่ได้รับอนุมัติให้รับประเภทงานที่เลือก กรุณาตรวจ PN/VIP หรือเลือกคนอื่น";
	return null;
}
var hasRefs = (r) => Boolean(r.session_ref || r.payment_ref);
/** Statuses where the Worker definitely rejected before writing. */
var DEFINITE_STATUS = /* @__PURE__ */ new Set([
	400,
	401,
	403,
	404,
	405,
	422,
	429
]);
function classifyCreateError(e) {
	const none = {
		session_ref: null,
		payment_ref: null
	};
	if (e instanceof JobGrantError) return {
		kind: "definite",
		refs: none
	};
	if (e instanceof ApiHttpError) {
		const refs = refsFrom(e.body);
		if (hasRefs(refs)) return {
			kind: "uncertain",
			refs
		};
		if (privateWorkRejection(e)) return {
			kind: "definite",
			refs
		};
		return {
			kind: DEFINITE_STATUS.has(e.status) ? "definite" : "uncertain",
			refs
		};
	}
	return {
		kind: "uncertain",
		refs: none
	};
}
function classifyCreateResponse(res) {
	if (!res || typeof res !== "object") return "uncertain";
	if (res.status === "created" && safeRef(res.session_ref)) return "created";
	const refs = {
		session_ref: safeRef(res.session_ref),
		payment_ref: safeRef(res.payment_ref)
	};
	if (res.status === "rejected" && !hasRefs(refs)) return "definite";
	return "uncertain";
}
function readPending(storage) {
	if (!storage) return null;
	try {
		const raw = storage.getItem(PENDING_KEY);
		if (!raw) return null;
		const v = JSON.parse(raw);
		return {
			v: 1,
			state: v["state"] === "in_flight" ? "in_flight" : "uncertain",
			started_at: typeof v["started_at"] === "number" ? v["started_at"] : 0,
			session_ref: safeRef(v["session_ref"]),
			payment_ref: safeRef(v["payment_ref"])
		};
	} catch {
		return {
			v: 1,
			state: "uncertain",
			started_at: 0,
			session_ref: null,
			payment_ref: null
		};
	}
}
function writePending(storage, m) {
	if (!storage) return;
	try {
		const safe = {
			v: 1,
			state: m.state,
			started_at: m.started_at,
			session_ref: safeRef(m.session_ref),
			payment_ref: safeRef(m.payment_ref)
		};
		storage.setItem(PENDING_KEY, JSON.stringify(safe));
	} catch {}
}
function clearPending(storage) {
	try {
		storage?.removeItem(PENDING_KEY);
	} catch {}
}
/** Lock to restore after reload. Any marker = uncertain (recovered). */
function lockFromStorage(storage) {
	const m = readPending(storage);
	if (!m) return { kind: "none" };
	return {
		kind: "uncertain",
		recovered: true,
		session_ref: m.session_ref,
		payment_ref: m.payment_ref
	};
}
function createMutationGuard() {
	let busy = false;
	return {
		tryAcquire() {
			if (busy) return false;
			busy = true;
			return true;
		},
		release() {
			busy = false;
		},
		get busy() {
			return busy;
		}
	};
}
/**
* Single create attempt. Never retries. Caller must treat `uncertain` as a
* hard lock until explicit operator recovery.
*/
async function runGuardedCreate(opts) {
	if (opts.lock.kind !== "none") return { kind: "locked" };
	if (!opts.guard.tryAcquire()) return { kind: "busy" };
	const storage = opts.persistMarker ? opts.storage : null;
	writePending(storage, {
		v: 1,
		state: "in_flight",
		started_at: (opts.now ?? Date.now)(),
		session_ref: null,
		payment_ref: null
	});
	try {
		let res;
		try {
			res = await opts.send();
		} catch (error) {
			const c = classifyCreateError(error);
			if (c.kind === "definite") {
				clearPending(storage);
				return {
					kind: "rejected",
					res: null,
					error,
					lock: { kind: "none" }
				};
			}
			writePending(storage, {
				v: 1,
				state: "uncertain",
				started_at: (opts.now ?? Date.now)(),
				...c.refs
			});
			return {
				kind: "uncertain",
				res: null,
				error,
				lock: {
					kind: "uncertain",
					recovered: false,
					...c.refs
				}
			};
		}
		const kind = classifyCreateResponse(res);
		const refs = {
			session_ref: safeRef(res?.session_ref),
			payment_ref: safeRef(res?.payment_ref)
		};
		if (kind === "created") {
			clearPending(storage);
			return {
				kind: "created",
				res,
				lock: {
					kind: "created",
					...refs
				}
			};
		}
		if (kind === "definite") {
			clearPending(storage);
			return {
				kind: "rejected",
				res,
				error: null,
				lock: { kind: "none" }
			};
		}
		writePending(storage, {
			v: 1,
			state: "uncertain",
			started_at: (opts.now ?? Date.now)(),
			...refs
		});
		return {
			kind: "uncertain",
			res: res ?? null,
			error: null,
			lock: {
				kind: "uncertain",
				recovered: false,
				...refs
			}
		};
	} finally {
		opts.guard.release();
	}
}
/**
* SAME-ORIGIN ONLY. No Worker origin is ever hard-coded or configured in the
* frontend: the Cloudflare routing layer behind mmdbkk.com resolves relative
* `/v1/admin/...` paths to the authoritative MMD Workers.
*/
async function call$2(path, init = {}, signal) {
	const res = await fetch(path, {
		...init,
		signal: signal ?? null,
		credentials: "include",
		cache: "no-store",
		headers: {
			"content-type": "application/json",
			...init.headers ?? {}
		}
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		const errorBody = safeJson(detail);
		throwIfGrantError(errorBody);
		if (isMissingAuthoritativeMemberForCreate(path, errorBody)) throw new ApiHttpError("AUTHORITATIVE_MEMBER_NOT_FOUND · ยังไม่สร้างงาน: ระบบไม่พบ Member หรือสิทธิ์สมาชิกที่เชื่อมกับลูกค้านี้ กรุณาตรวจ linkage กับทีมหลังบ้าน หรือให้เจ้าของพิจารณาสิทธิ์เฉพาะงาน ระบบจะไม่ให้สิทธิ์หรือส่งซ้ำอัตโนมัติ", res.status, errorBody);
		throw new ApiHttpError(`${path} failed (${res.status})${detail ? `: ${detail.slice(0, 400)}` : ""}`, res.status, errorBody);
	}
	const json = await res.json();
	throwIfGrantError(json);
	return json;
}
function safeJson(text) {
	try {
		const v = JSON.parse(text);
		return v && typeof v === "object" && !Array.isArray(v) ? v : null;
	} catch {
		return null;
	}
}
function recordValue(value) {
	return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
/** Read only explicit backend error codes from supported response envelopes. */
function responseErrorCodes(body) {
	const codes = /* @__PURE__ */ new Set();
	let current = body;
	for (let depth = 0; depth < 4; depth += 1) {
		const record = recordValue(current);
		if (!record) {
			if (typeof current === "string") codes.add(current);
			break;
		}
		if (typeof record["code"] === "string") codes.add(record["code"]);
		const error = recordValue(record["error"]);
		if (error) {
			if (typeof error["code"] === "string") codes.add(error["code"]);
			current = error;
			continue;
		}
		if (typeof record["error"] === "string") codes.add(record["error"]);
		const data = recordValue(record["data"]);
		if (data) {
			current = data;
			continue;
		}
		break;
	}
	return codes;
}
function isMissingAuthoritativeMemberForCreate(path, body) {
	return path === "/v1/admin/job/create" && responseErrorCodes(body).has("AUTHORITATIVE_MEMBER_NOT_FOUND");
}
function isMissingMemberCreateError(error) {
	return error instanceof ApiHttpError && isMissingAuthoritativeMemberForCreate("/v1/admin/job/create", error.body);
}
var GRANT_CODES = /* @__PURE__ */ new Set(["OWNER_JOB_GRANT_MISMATCH", "OWNER_JOB_GRANT_LOOKUP_INCONSISTENT"]);
/** Backend-owned owner-grant rejection. Never retried, never reinterpreted. */
function throwIfGrantError(body) {
	if (!body) return;
	const src = body["data"] ?? body;
	const err = src["error"] ?? src;
	const code = typeof src["code"] === "string" && src["code"] || typeof err["code"] === "string" && err["code"] || typeof src["error"] === "string" && src["error"] || "";
	if (!GRANT_CODES.has(code)) return;
	throw new JobGrantError({
		code,
		message: err["message"] ?? src["message"] ?? null,
		mismatched_fields: err["mismatched_fields"] ?? src["mismatched_fields"] ?? [],
		expected: err["expected"] ?? src["expected"] ?? err["expected_values"] ?? null
	});
}
/** First NON-EMPTY array among known keys, so an empty alias never hides real results. */
function firstList(src, keys) {
	const arrays = keys.map((k) => src?.[k]).filter((v) => Array.isArray(v));
	return arrays.find((a) => a.length > 0) ?? arrays[0] ?? [];
}
/** Backend currently returns `records`; older frontends used `results`. */
function normalizeClientList(data) {
	return firstList(data?.["data"] ?? data, [
		"records",
		"results",
		"items"
	]);
}
function listMeta(data) {
	const src = data?.["data"] ?? data;
	return {
		degraded_sources: src?.["degraded_sources"] ?? [],
		no_canonical_match: src?.["no_canonical_match"] === true
	};
}
var liveApi = {
	lineageLookup: (query, signal) => call$2("/v1/admin/clients/lineage-lookup", {
		method: "POST",
		body: JSON.stringify({ query })
	}, signal).then((data) => {
		const results = normalizeClientList(data);
		const meta = listMeta(data);
		return {
			results,
			degraded_sources: meta.degraded_sources,
			no_canonical_match: meta.no_canonical_match || results.length === 0
		};
	}),
	clientPhotos: (clientId, signal) => call$2("/v1/admin/clients/profile-photo/sync", {
		method: "POST",
		body: JSON.stringify({ client_id: clientId })
	}, signal).then((data) => Array.isArray(data.profile_photos) ? data.profile_photos : []),
	recentClients: (signal) => call$2("/v1/admin/clients/recent", { method: "GET" }, signal).then((data) => ({
		results: normalizeClientList(data),
		degraded_sources: listMeta(data).degraded_sources
	})),
	/**
	* GET /v1/admin/models/search
	* Backend returns eligible canonical models under `items` (legacy shapes
	* `models` / `records` are still tolerated).
	*/
	models: (args, signal) => {
		const p = new URLSearchParams();
		p.set("client_id", args.clientId);
		if (args.memberId) p.set("member_id", args.memberId);
		p.set("work_type", args.workType);
		if (args.bookingVisibility) p.set("booking_visibility", args.bookingVisibility);
		if (args.customerLane) p.set("customer_lane", args.customerLane);
		if (args.selectedAccessFolder) p.set("selected_access_folder", args.selectedAccessFolder);
		if (args.privateWork) p.set("private_work", args.privateWork);
		if (args.q) p.set("q", args.q);
		return call$2(`/v1/admin/models/search?${p.toString()}`, { method: "GET" }, signal).then((data) => {
			const src = data?.["data"] ?? data;
			const list = firstList(src, [
				"items",
				"models",
				"records"
			]).map(normalizeModel);
			const ok = src?.["source_lookup_ok"] ?? data?.["source_lookup_ok"];
			if (typeof ok === "boolean") list.source_lookup_ok = ok;
			return list;
		});
	},
	driveModels: (q, signal) => {
		return call$2(`/v1/admin/models/search?${new URLSearchParams({
			discovery: "drive",
			q: q.trim()
		}).toString()}`, { method: "GET" }, signal).then((data) => {
			return firstList(data?.["data"] ?? data, ["items"]).map(normalizeModel).filter((m) => Boolean(m.drive_folder_id));
		});
	},
	driveSelect: (driveFolderId) => call$2("/v1/admin/models/drive-select", {
		method: "POST",
		body: JSON.stringify({ drive_folder_id: driveFolderId })
	}).then((data) => {
		const src = data?.["data"] ?? data;
		const raw = src?.["item"];
		if (src?.["ok"] === false || !raw) throw new Error("drive-select: backend returned no canonical model");
		const m = normalizeModel(raw);
		if (!/^rec[A-Za-z0-9]{6,}$/.test(m.model_id) || m.materialized !== true || m.drive_folder_id !== driveFolderId) throw new Error("drive-select: canonical Models record not confirmed — needs review");
		return m;
	}),
	/** GET /v1/admin/models/resolve-source — Airtable Models first, then R2. */
	resolveModelSource: ({ q, sourceOwner = "lonelysomething", categoryPath }, signal) => {
		const p = new URLSearchParams();
		p.set("q", q);
		p.set("source_owner", sourceOwner);
		if (categoryPath) p.set("category_path", categoryPath);
		return call$2(`/v1/admin/models/resolve-source?${p.toString()}`, { method: "GET" }, signal).then((data) => {
			return data?.["data"] ?? data;
		});
	},
	/** POST /v1/admin/models/stage-from-source — pre-canonical Models draft. */
	stageModelFromSource: (payload) => call$2("/v1/admin/models/stage-from-source", {
		method: "POST",
		body: JSON.stringify({
			model_name: payload.model_name,
			q: payload.model_name,
			source_owner: payload.source_owner ?? "lonelysomething",
			...payload.category_path ? { category_path: payload.category_path } : {},
			...payload.matched_prefix ? { matched_prefix: payload.matched_prefix } : {}
		})
	}).then((data) => {
		return data?.["data"] ?? data;
	}),
	ownerGrant: (payload) => call$2("/v1/admin/job/owner-grant", {
		method: "POST",
		body: JSON.stringify({
			...buildJobBody(payload),
			owner_grant_reason_code: "AUTHORITATIVE_MEMBER_NOT_FOUND"
		})
	}).then((response) => {
		if (response.ok !== true || response.grant_status !== "pending") throw new Error("ระบบยังไม่ยืนยันสิทธิ์เฉพาะงาน กรุณาตรวจกับทีมหลังบ้าน");
		return response;
	}),
	createSession: (payload) => call$2("/v1/admin/job/create", {
		method: "POST",
		body: JSON.stringify(buildJobBody(payload))
	}).then(normalizeJobResponse)
};
async function call$1(path, init = {}, signal) {
	const res = await fetch(path, {
		...init,
		signal: signal ?? null,
		credentials: "include",
		cache: "no-store",
		headers: {
			"content-type": "application/json",
			...init.headers ?? {}
		}
	});
	if (!res.ok) throw new Error(`${path} failed (${res.status})`);
	return await res.json();
}
/** Backends wrap payloads inconsistently: unwrap `data`, then list keys. */
function unwrap$1(payload) {
	const root = payload ?? {};
	const data = root["data"];
	return (data && typeof data === "object" ? data : root) ?? {};
}
function list$1(payload) {
	if (Array.isArray(payload)) return payload;
	const src = unwrap$1(payload);
	for (const key of [
		"items",
		"models",
		"records",
		"results",
		"sets",
		"rules",
		"runs"
	]) {
		const v = src[key];
		if (Array.isArray(v)) return v;
	}
	return [];
}
var BASE$1 = "/v1/admin/kenji";
var liveKenjiApi = {
	overview: (signal) => call$1(`${BASE$1}/overview`, { method: "GET" }, signal).then((d) => unwrap$1(d)),
	models: (signal) => call$1(`${BASE$1}/models`, { method: "GET" }, signal).then((d) => list$1(d)),
	createModelDraft: (modelId) => call$1(`${BASE$1}/models/draft`, {
		method: "POST",
		body: JSON.stringify({ model_id: modelId })
	}),
	knowledge: (signal) => call$1(`${BASE$1}/knowledge`, { method: "GET" }, signal).then((d) => list$1(d)),
	access: (signal) => call$1(`${BASE$1}/access`, { method: "GET" }, signal).then((d) => list$1(d)),
	routing: (signal) => call$1(`${BASE$1}/routing`, { method: "GET" }, signal).then((d) => list$1(d)),
	qa: (signal) => call$1(`${BASE$1}/qa`, { method: "GET" }, signal).then((d) => {
		return {
			...unwrap$1(d),
			runs: list$1(d)
		};
	}),
	runQa: (revision) => call$1(`${BASE$1}/qa/run`, {
		method: "POST",
		body: JSON.stringify({ revision: revision ?? null })
	}),
	publishState: (signal) => call$1(`${BASE$1}/publish`, { method: "GET" }, signal).then((d) => unwrap$1(d)),
	publish: (revision) => call$1(`${BASE$1}/publish`, {
		method: "POST",
		body: JSON.stringify({ revision: revision ?? null })
	})
};
var BASE = "/v1/admin/protocols";
function newIdempotencyKey() {
	return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
async function call(path, init = {}, signal) {
	const res = await fetch(path, {
		...init,
		signal: signal ?? null,
		credentials: "include",
		cache: "no-store",
		headers: {
			"content-type": "application/json",
			...init.headers ?? {}
		}
	});
	const text = await res.text().catch(() => "");
	let body = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = null;
	}
	if (!res.ok) {
		const src = body ?? {};
		const msg = src["error"] ?? src["message"] ?? (res.status === 401 ? "Sign in required — your admin session has expired." : `Request failed (${res.status}).`);
		throw new Error(msg);
	}
	return body ?? {};
}
function unwrap(payload) {
	const root = payload ?? {};
	const data = root["data"];
	const inner = data && typeof data === "object" ? data : {};
	return {
		...root,
		...inner
	};
}
function list(payload, keys) {
	if (Array.isArray(payload)) return payload;
	const src = unwrap(payload);
	for (const k of keys) {
		const v = src[k];
		if (Array.isArray(v)) return v;
	}
	return [];
}
/** Server-owned mutation envelope: idempotency key on every write. */
function mutate(path, body = {}) {
	const idem = newIdempotencyKey();
	return call(path, {
		method: "POST",
		headers: {
			"Idempotency-Key": idem,
			"X-Request-Id": idem
		},
		body: JSON.stringify({
			...body,
			request_id: idem
		})
	}).then((raw) => unwrap(raw));
}
var liveProtocolApi = {
	list: (signal) => call(BASE, { method: "GET" }, signal).then((raw) => {
		const src = unwrap(raw);
		return {
			items: list(raw, [
				"items",
				"protocols",
				"records",
				"results"
			]),
			authority: src["authority"] ?? null,
			source_of_truth: src["source_of_truth"] ?? null,
			counts: src["counts"] ?? null,
			warnings: src["warnings"] ?? []
		};
	}),
	detail: (key, signal) => call(`${BASE}/${encodeURIComponent(key)}`, { method: "GET" }, signal).then((raw) => {
		const src = unwrap(raw);
		const protocol = src["protocol"] ?? src["item"] ?? { key };
		return {
			protocol: {
				...protocol,
				key: protocol.key ?? key
			},
			draft_text: src["draft_text"] ?? null,
			published_text: src["published_text"] ?? null,
			qa: src["qa"] ?? null,
			audit: list(src["audit"] ?? raw, [
				"audit",
				"items",
				"records"
			]),
			authority: src["authority"] ?? null,
			source_of_truth: src["source_of_truth"] ?? null,
			cache_status: src["cache_status"] ?? null,
			warnings: src["warnings"] ?? []
		};
	}),
	audit: (key, signal) => call(`${BASE}/${encodeURIComponent(key)}/audit`, { method: "GET" }, signal).then((raw) => list(raw, [
		"items",
		"audit",
		"records",
		"results"
	])),
	draft: (key) => mutate(`${BASE}/${encodeURIComponent(key)}/draft`),
	review: (key) => mutate(`${BASE}/${encodeURIComponent(key)}/review`),
	runQa: (key) => mutate(`${BASE}/${encodeURIComponent(key)}/qa/run`),
	publish: (key, expectedVersion) => mutate(`${BASE}/${encodeURIComponent(key)}/publish`, { expected_version: expectedVersion })
};
var SEED = [
	{
		key: "membership",
		label: "Membership Protocol",
		summary: "Who counts as a member, which tier they hold, how renewal and expiry are handled.",
		source_of_truth: "Membership backend · my_mmd_entitlement_resolver_v1",
		consumers: [
			"My MMD",
			"Kenji",
			"Membership Access"
		],
		risk_level: "high"
	},
	{
		key: "payments",
		label: "Payments Protocol",
		summary: "Deposit to confirm a booking, remaining balance on arrival, and how account details are disclosed.",
		source_of_truth: "Payments backend",
		consumers: [
			"My MMD",
			"Kenji",
			"Create Session"
		],
		risk_level: "high"
	},
	{
		key: "booking-cancellation",
		label: "Booking & Cancellation Protocol",
		summary: "Lead times for booking, how changes are accepted, and how cancellation or no-show is handled.",
		source_of_truth: "Booking backend",
		consumers: [
			"Create Session",
			"Kenji",
			"LINE"
		],
		risk_level: "medium"
	},
	{
		key: "session-rules",
		label: "Session Rules",
		summary: "Conduct expectations, duration, extension handling and operator responsibilities on site.",
		source_of_truth: "Operations",
		consumers: ["Create Session", "MMS Operations"],
		risk_level: "medium"
	},
	{
		key: "model-access",
		label: "Model Access Rules",
		summary: "What may be disclosed for public versus private lanes. Eligibility itself is decided by the backend.",
		source_of_truth: "Model access backend",
		consumers: [
			"Create Session",
			"Kenji",
			"Studio"
		],
		risk_level: "high"
	},
	{
		key: "kenji-routing",
		label: "Kenji Routing Rules",
		summary: "Which protocol sets Kenji may quote, to whom, and in which language.",
		source_of_truth: "Kenji backend",
		consumers: ["Kenji", "Kenji Preview"],
		risk_level: "medium"
	},
	{
		key: "line-liff",
		label: "LINE / LIFF Protocol",
		summary: "Member-facing LINE and LIFF messaging wording and permitted actions.",
		source_of_truth: "LINE integration",
		consumers: ["LINE", "My MMD"],
		risk_level: "low"
	},
	{
		key: "privacy-consent",
		label: "Privacy & Consent",
		summary: "Which identifiers are operator-only, how consent is captured, and what may never be shown to members.",
		source_of_truth: "Privacy policy owner",
		consumers: ["All modules"],
		risk_level: "high"
	},
	{
		key: "mms-operations",
		label: "MMS Operations",
		summary: "Internal day-to-day operations runbook rules for the team.",
		source_of_truth: "Operations",
		consumers: ["MMS Operations"],
		risk_level: "low"
	}
].map((d) => ({
	...d,
	status: "draft",
	draft_version: 1,
	published_version: 0,
	owner: "MMD Operations",
	can_draft: true,
	can_review: true,
	can_run_qa: true,
	can_publish: false,
	publish_blocked_reason: "QA has not passed for this draft."
}));
var PREVIEW_WRITE_BLOCKED = "Preview only — protocol writes are disabled here. Use the internal admin site to draft, review, run QA or publish.";
function blocked() {
	return Promise.reject(/* @__PURE__ */ new Error(PREVIEW_WRITE_BLOCKED));
}
var mockProtocolApi = {
	list: () => Promise.resolve({
		items: SEED,
		authority: "preview",
		source_of_truth: "Airtable canonical base (not read in preview)",
		warnings: []
	}),
	detail: (key) => {
		const protocol = SEED.find((p) => p.key === key);
		if (!protocol) return Promise.reject(/* @__PURE__ */ new Error("Unknown protocol."));
		return Promise.resolve({
			protocol,
			draft_text: "",
			published_text: null,
			qa: null,
			audit: [],
			authority: "preview",
			source_of_truth: "Airtable canonical base (not read in preview)",
			warnings: []
		});
	},
	audit: () => Promise.resolve([]),
	draft: blocked,
	review: blocked,
	runQa: blocked,
	publish: blocked
};
var delay$1 = (ms) => new Promise((r) => setTimeout(r, ms));
var MODELS = [{
	id: "kenji-core",
	name: "Kenji Core",
	provider: "workers-ai",
	revision: "r48",
	state: "live",
	is_default: true,
	updated_at: "2026-08-28"
}, {
	id: "kenji-concierge",
	name: "Kenji Concierge",
	provider: "workers-ai",
	revision: "r12-draft",
	state: "draft",
	updated_at: "2026-09-03",
	note: "Draft edits stay unpublished until Publish"
}];
var KNOWLEDGE = [{
	id: "ks-member-canon",
	name: "Member canon",
	revision: "r31",
	owner: "Per",
	state: "live",
	document_count: 84,
	updated_at: "2026-08-30"
}, {
	id: "ks-session-ops",
	name: "Session operations",
	revision: "r09-draft",
	owner: "Desk",
	state: "review",
	document_count: 27,
	updated_at: "2026-09-04"
}];
var ACCESS = [{
	id: "acc-member",
	surface: "Member Kenji AI 2.0",
	audience: "Members",
	lane: "member",
	allowed: true,
	resolver: "my_mmd_entitlement_resolver_v1"
}, {
	id: "acc-admin-preview",
	surface: "Admin preview",
	audience: "Operators",
	lane: "admin",
	allowed: true,
	resolver: "admin_session"
}];
var ROUTING = [{
	id: "rt-1",
	intent: "membership_status",
	lane: "member",
	knowledge_set: "Member canon",
	model: "Kenji Core",
	priority: 1,
	state: "live"
}, {
	id: "rt-2",
	intent: "booking_help",
	lane: "member",
	knowledge_set: "Session operations",
	model: "Kenji Concierge",
	priority: 2,
	state: "draft"
}];
var QA = {
	draft_revision: "r49-draft",
	can_run: true,
	preview_url: "/member/kenji-ai-20?mode=admin-preview",
	runs: [{
		id: "qa-118",
		revision: "r49-draft",
		status: "passed",
		started_at: "2026-09-04 11:20",
		finished_at: "2026-09-04 11:24",
		passed: 42,
		failed: 0,
		summary: "All grounded-answer checks passed"
	}, {
		id: "qa-117",
		revision: "r49-draft",
		status: "failed",
		started_at: "2026-09-03 16:02",
		finished_at: "2026-09-03 16:07",
		passed: 39,
		failed: 3,
		summary: "3 entitlement answers not grounded"
	}]
};
var PUBLISH = {
	draft_revision: "r49-draft",
	live_revision: "r48",
	can_publish: true,
	qa_status: "passed",
	last_publish_at: "2026-08-28 09:41",
	last_publish_by: "per@mmd"
};
var mockKenjiApi = {
	async overview() {
		await delay$1(220);
		return {
			live_revision: "r48",
			draft_revision: "r49-draft",
			state: "qa_passed",
			open_review_items: 2,
			last_publish_at: PUBLISH.last_publish_at ?? null,
			last_publish_by: PUBLISH.last_publish_by ?? null,
			last_audit_entry: "2026-09-04 11:24 · QA passed on r49-draft",
			qa_status: "passed"
		};
	},
	async models() {
		await delay$1(200);
		return MODELS;
	},
	async createModelDraft() {
		await delay$1(500);
		return {
			status: "rejected",
			message: "Demo provider — no draft was created."
		};
	},
	async knowledge() {
		await delay$1(200);
		return KNOWLEDGE;
	},
	async access() {
		await delay$1(180);
		return ACCESS;
	},
	async routing() {
		await delay$1(180);
		return ROUTING;
	},
	async qa() {
		await delay$1(220);
		return QA;
	},
	async runQa() {
		await delay$1(600);
		return {
			status: "rejected",
			message: "Demo provider — no QA run was started."
		};
	},
	async publishState() {
		await delay$1(200);
		return PUBLISH;
	},
	async publish() {
		await delay$1(600);
		return {
			status: "rejected",
			message: "Demo provider — nothing was published."
		};
	}
};
var WORK_TYPE_OPTIONS = [{
	code: "PUB",
	label: "น้องๆและนายแบบทั่วไป",
	description: "งานทั่วไป",
	lane: "public",
	selectable: true
}, {
	code: "PRV",
	label: "น้องๆและนายแบบส่วนตัว",
	description: "งานส่วนตัว",
	lane: "private",
	selectable: true
}];
function findWorkType(code) {
	return WORK_TYPE_OPTIONS.find((w) => w.code === code);
}
var DEMO_CLIENTS = [
	{
		client_id: "recCL000412Nuey",
		remembered_name: "คุณหนุ่ย",
		canonical_name: "Nattapong Sirichai",
		client_name: "Nattapong S.",
		aliases: [
			"หนุ่ย",
			"คุณหนุ่ย",
			"Nuey"
		],
		matched_on: "per_alias",
		matched_value: "คุณหนุ่ย",
		member_id: "MMD-2019-0087",
		member_email: "n.sirichai@example.com",
		username: "nuey_s",
		phone: "+66 8x-xxx-4412",
		line_display_name: "N.",
		line_user_id: "U9f2…c41",
		telegram_username: "@nuey_s",
		customer_telegram_status: "linked",
		tier: "Privé Gold",
		membership_status: "Active",
		package_code: "PRV-G12",
		purchased_history: "14 sessions since 2019",
		confidence: .97,
		lineage_source: "line_ofc_staging → per_manual_rename → canonical_client",
		identity_status: "verified"
	},
	{
		client_id: "recCL001077Chai",
		remembered_name: null,
		canonical_name: "Somchai Weerapong",
		client_name: "Somchai W.",
		aliases: ["Chai"],
		matched_on: "line_display_name",
		matched_value: "Chai • หนุ่ย's friend",
		member_id: "MMD-2022-0413",
		member_email: "chai.w@example.com",
		phone: "+66 9x-xxx-8890",
		line_display_name: "Chai",
		line_user_id: "U31a…7bd",
		tier: "Privé Silver",
		membership_status: "Active",
		confidence: .51,
		lineage_source: "line_index",
		identity_status: "pending_reconcile",
		warnings: ["Identity lineage pending reconcile — verify before use."]
	},
	{
		client_id: "CL-PUB-3391",
		canonical_name: "Unlinked public entry",
		client_name: "หนุ่ย (public form)",
		matched_on: "historical_alias",
		matched_value: "หนุ่ย",
		confidence: .33,
		lineage_source: "public_intake_form",
		identity_status: "needs_review",
		manual_public_only: true,
		pre_session_candidate: true,
		warnings: ["Public-only candidate — no canonical member record linked."]
	},
	{
		client_id: "recCL000903Wichai",
		remembered_name: "เฮียตี๋",
		canonical_name: "Wichai Tanthapanich",
		client_name: "Wichai T.",
		aliases: ["ตี๋", "เฮียตี๋"],
		matched_on: "per_alias",
		matched_value: "เฮียตี๋",
		member_id: "MMD-2020-0155",
		member_email: "w.tan@example.com",
		phone: "+66 8x-xxx-2211",
		tier: "Privé Black",
		membership_status: "Active",
		package_code: "PRV-B06",
		purchased_history: "31 sessions since 2020",
		confidence: .95,
		lineage_source: "per_manual_rename → canonical_client",
		identity_status: "verified"
	}
];
var DEMO_MODELS = [
	{
		model_id: "recMD118Ami",
		display_name: "Ami",
		model_name: "Ami",
		source_kind: "direct",
		model_lookup_key: "A118",
		code: "A118",
		lane: "public",
		visibility: "public",
		selectable: true,
		source: "airtable",
		rate_display: "Snapshot from backend",
		availability_note: "Bangkok · today"
	},
	{
		model_id: "recMD204Rin",
		display_name: "Rin",
		model_name: "Rin",
		source_kind: "direct",
		model_lookup_key: "R204",
		code: "R204",
		lane: "public",
		visibility: "public",
		selectable: true,
		source: "airtable",
		availability_note: "Bangkok · evening"
	},
	{
		model_id: "recMD777Sora",
		private_work_capabilities: ["pn"],
		display_name: "Premium · Sora",
		model_name: "Sora",
		source_kind: "direct",
		model_lookup_key: "S777",
		code: "S777",
		lane: "private",
		visibility: "private",
		telegram_status: "linked",
		folder: "PRIVATE/A",
		selectable: true,
		source: "airtable",
		rate_display: "Backend snapshot",
		availability_note: "Premium tier — eligibility decided by backend"
	},
	{
		model_id: "recMD311Kaya",
		private_work_capabilities: ["pn", "vip"],
		display_name: "Kaya",
		model_name: "Kaya",
		source_kind: "direct",
		model_lookup_key: "K311",
		code: "K311",
		lane: "private",
		visibility: "private",
		selectable: true,
		source: "airtable",
		availability_note: "By request"
	},
	{
		model_id: "recMD402Noon",
		display_name: "Noon",
		model_name: "Noon",
		source_kind: "direct",
		code: "N402",
		lane: "private",
		visibility: "private",
		selectable: false,
		source: "airtable",
		disabled_reason: "Not selectable for this client/lane per backend"
	},
	{
		model_id: "recMD515BrewTN",
		display_name: "Brew TN",
		model_name: "Brew TN",
		working_name: "Brew",
		model_lookup_key: "BREW-515",
		source_kind: "partner",
		partner_id: "PT-KENDO",
		partner_name: "Kendo (ตัวอย่าง)",
		partner_record_id: "recDEMOpartner01",
		lane: "public",
		visibility: "public",
		selectable: true,
		source: "airtable",
		availability_note: "Partner · Bangkok"
	},
	{
		model_id: "recMD516Jane",
		display_name: "Jane",
		model_name: "Jane",
		model_lookup_key: "J516",
		source_kind: "direct",
		lane: "private",
		visibility: "private",
		selectable: true,
		source: "airtable"
	},
	{
		model_id: "recMD517Pim",
		display_name: "Pim",
		model_name: "Pim",
		model_lookup_key: "P517",
		source_kind: null,
		lane: "public",
		visibility: "public",
		selectable: true,
		source: "airtable",
		availability_note: "Referral lookup failed"
	},
	(
	/** Proves the R2 → Models draft → canonical migration path is create-ready. */
	{
		model_id: "recMD908Mira",
		display_name: "Mira",
		model_name: "Mira",
		source_kind: "direct",
		model_lookup_key: "MIRA-908",
		code: "MIRA-908",
		lane: "private",
		visibility: "private",
		telegram_status: "linked",
		folder: "PRIVATE/B",
		selectable: true,
		source: "r2_migrated",
		availability_note: "Migrated from source library · canonical in Models"
	})
];
/**
* Demo-only staged models. `แพรว` starts as an R2-only match: staging creates a
* review-blocked Models draft, so it stays non-selectable — exactly the real
* fail-closed behaviour.
*/
var stagedDemoModels = [];
var delay = (ms) => new Promise((r) => setTimeout(r, ms));
function score(c, q) {
	return [
		c.remembered_name,
		c.canonical_name,
		c.client_name,
		...c.aliases ?? [],
		c.member_id,
		c.member_email,
		c.username,
		c.phone,
		c.line_display_name,
		c.line_user_id,
		c.telegram_username,
		c.client_id
	].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase());
}
var mockApi = {
	async lineageLookup(query) {
		await delay(420);
		if (query.trim().toLowerCase() === "error") throw new Error("Lookup service unavailable");
		const results = DEMO_CLIENTS.filter((c) => score(c, query.trim()));
		return {
			results,
			degraded_sources: query.includes("line") ? ["line_display_index"] : [],
			no_canonical_match: results.every((r) => r.manual_public_only) || results.length === 0
		};
	},
	async clientPhotos(clientId) {
		return DEMO_CLIENTS.find((client) => client.client_id === clientId)?.profile_photos ?? [];
	},
	async recentClients() {
		await delay(260);
		return { results: [DEMO_CLIENTS[0], DEMO_CLIENTS[3]] };
	},
	async models({ workType, q }) {
		await delay(260);
		const lane = WORK_TYPE_OPTIONS.find((w) => w.code === workType)?.lane;
		const inLane = [...DEMO_MODELS, ...stagedDemoModels].filter((m) => (lane === "public" || lane === "event" ? m.lane === "public" : true) && modelMatches(m, q ?? ""));
		const list = sortAlpha(inLane);
		list.source_lookup_ok = !inLane.some((m) => m.source_kind === null);
		return list;
	},
	async driveModels(q) {
		await delay(220);
		return sortAlpha(DEMO_MODELS.filter((m) => modelMatches(m, q))).map((m) => ({
			...m,
			model_id: "",
			source: "drive",
			source_kind: null,
			materialized: false,
			status: "Drive",
			drive_folder_id: `drv_${m.model_id}`,
			folder_name: m.display_name,
			folder_path: `Demo / ${m.lane ?? "models"}`,
			partner_id: null,
			partner_name: null,
			partner_record_id: null
		}));
	},
	async driveSelect(driveFolderId) {
		await delay(300);
		const m = DEMO_MODELS.find((d) => `drv_${d.model_id}` === driveFolderId);
		if (!m) throw new Error("drive-select: not found");
		return {
			...m,
			source: "drive",
			materialized: true,
			drive_folder_id: driveFolderId,
			source_kind: null,
			partner_id: null,
			partner_name: null,
			partner_record_id: null
		};
	},
	async resolveModelSource({ q }) {
		await delay(420);
		const name = q.trim();
		if (!name) return {
			found: false,
			message: "No query."
		};
		if (/แพรว|praew/i.test(name)) return {
			found: true,
			source: "r2",
			matched_name: "Praew",
			matched_prefix_redacted: "•••/private/•••",
			category_path: "private/library-b",
			object_count: 148,
			message: "Found in source library only — not canonical in Models yet."
		};
		return {
			found: false,
			source: "r2",
			message: "No source-library match for this name."
		};
	},
	async stageModelFromSource({ model_name }) {
		await delay(700);
		if (!stagedDemoModels.some((m) => m.model_name === "Praew")) stagedDemoModels.push({
			model_id: "MD-DRAFT-PRAEW",
			display_name: "Praew",
			model_name: "Praew",
			lane: "private",
			visibility: "private",
			selectable: false,
			requires_per_approval: true,
			private_review_status: "Needs Review",
			source: "r2_migrated",
			disabled_reason: "Needs Review — awaiting Per approval in Models"
		});
		return {
			ok: true,
			model_id: "MD-DRAFT-PRAEW",
			model_name: model_name || "Praew",
			requires_per_approval: true,
			private_review_status: "Needs Review",
			message: "Demo provider — a pre-canonical draft was NOT written."
		};
	},
	async ownerGrant() {
		throw new Error("ตัวอย่างไม่สามารถอนุมัติสิทธิ์เฉพาะงานได้");
	},
	async createSession() {
		await delay(900);
		return {
			status: "created",
			session_ref: "DEMO-SESSION-PREVIEW",
			payment_ref: "DEMO-PAY-PREVIEW",
			message: "Demo provider — no authoritative session was created.",
			linkage: {
				status: "review_required",
				client_linked: true,
				model_linked: true,
				session_linked: false,
				job_linked: false,
				client_source: "LINE OFC → Clients",
				model_provenance: "R2 → Models",
				message: "Relational linking not deployed — backend has not confirmed persistence."
			}
		};
	}
};
/**
* The demo provider is used only when the app is not served from an
* MMD-controlled origin (i.e. the Lovable preview). On a live origin every call
* is a relative same-origin request that the Cloudflare routing layer behind
* mmdbkk.com resolves to the authoritative MMD Workers.
*/
function isPreviewOrigin() {
	return isPreviewRuntime();
}
var usingDemoData = () => isPreviewOrigin() && true;
/** Preview must never issue a production write. */
var writesBlockedInPreview = () => writesBlockedRuntime();
var PreviewWriteBlockedError = class extends Error {
	constructor() {
		super("Preview only — production writes are disabled (DEMO DATA · NOT AUTHORITATIVE).");
		this.name = "PreviewWriteBlockedError";
	}
};
/**
* On any live (non-preview) origin every call — including the authoritative
* writes POST /v1/admin/job/create and /v1/admin/models/stage-from-source — goes to the real Worker.
* In the Lovable preview the demo provider answers instead, so the preview can
* never perform a production write. It is clearly non-authoritative.
*/
var api = new Proxy({}, { get(_t, prop) {
	return (usingDemoData() ? mockApi : liveApi)[prop];
} });
/**
* Kenji reads use the preview snapshot; Kenji WRITES (QA run, model draft,
* publish) are refused in preview and only ever hit the Worker on a live
* MMD-controlled origin.
*/
var KENJI_WRITES = /* @__PURE__ */ new Set([
	"runQa",
	"publish",
	"createModelDraft"
]);
var kenjiApi = new Proxy({}, { get(_t, prop) {
	if (writesBlockedInPreview() && KENJI_WRITES.has(prop)) return () => Promise.reject(new PreviewWriteBlockedError());
	return (usingDemoData() ? mockKenjiApi : liveKenjiApi)[prop];
} });
/**
* Protocol Center is backed by the live Airtable-authoritative Worker API.
* Reads use the demo snapshot only in the Lovable preview; every WRITE is
* refused in preview (the mock rejects) so the preview can never mutate
* production. On the real internal admin origin all calls hit the Worker.
*/
var protocolApi = new Proxy({}, { get(_t, prop) {
	return (usingDemoData() ? mockProtocolApi : liveProtocolApi)[prop];
} });
/** Hydration-safe demo flag for render: false during SSR and first client render. */
function useDemoMode() {
	return useHydrated() && usingDemoData();
}
//#endregion
export { modelSearchScope as A, safePartnerDashboardUrl as B, isPartnerManaged as C, lockFromStorage as D, linkBadge as E, preselectFromModel as F, sourceChoiceReady as G, sameAttribution as H, privateModelReady as I, usingDemoData as J, updatePrivateModelSelection as K, privateWorkRejection as L, partnerConflict as M, partnerMissing as N, mergeAttribution as O, partnerOnModelChange as P, protocolApi as R, isMissingMemberCreateError as S, kenjiApi as T, selectPartner as U, safeRef as V, servicePricing as W, writesBlockedInPreview as Y, computeDepositBreakdown as _, EMPTY_PARTNER as a, findWorkType as b, PARTNER_TYPE_LABEL as c, PreviewWriteBlockedError as d, WORK_TYPE_OPTIONS as f, clearPending as g, buildJobBody as h, DURATION_OPTIONS as i, modelSelectable as j, modelPartnerLink as k, PRIVATE_SEARCH_FOLDERS as l, api as m, BRIDGE_TIERS as n, EMPTY_PRIVATE_ACCESS as o, adoptModelPartner as p, useDemoMode as q, DIRECT_CHOICE as r, JobGrantError as s, ApiHttpError as t, PRIVATE_SERVICE_OPTIONS as u, computeEndTime as v, isValidMapUrl as w, isCanonicalRecordId as x, createMutationGuard as y, runGuardedCreate as z };
