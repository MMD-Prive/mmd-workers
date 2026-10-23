import { i as apiGet } from "./client-DnJZI2KL.mjs";
import { n as queryOptions } from "../_libs/tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/jobs-DEY8sWDt.js
/** The projection does not specify created vs appointment semantics; do not invent them. */
function jobDateLabels(job) {
	const date = job.date_label?.trim();
	let time = job.time?.trim();
	if (date && time) {
		if (time === date) time = void 0;
		else if (time.startsWith(`${date} · `)) time = time.slice(date.length + 3).trim();
	}
	return [date ? `วันที่ ${date}` : null, time ? `เวลา ${time}` : null].filter((label) => label !== null);
}
function identifier(value, key, max) {
	if (value === void 0) return void 0;
	if (typeof value !== "string" || !value.length || value.length > max || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)) throw new Error(`invalid_${key}`);
	return value;
}
function validateJobsSearch(search) {
	const clientId = identifier(search["client_id"], "client_id", 33);
	if (clientId && !/^rec[A-Za-z0-9]{14,30}$/.test(clientId)) throw new Error("invalid_client_id");
	const rawPage = search["page"];
	const page = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : rawPage;
	const date = search["date"];
	return {
		session_id: identifier(search["session_id"], "session_id", 119),
		job_id: identifier(search["job_id"], "job_id", 139),
		client_id: clientId,
		application_id: identifier(search["application_id"], "application_id", 180),
		date: typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : void 0,
		page: typeof page === "number" && Number.isSafeInteger(page) && page > 0 ? page : 1
	};
}
function jobsPath(search) {
	const params = new URLSearchParams({
		view: "jobs",
		page: String(search.page ?? 1),
		page_size: "20"
	});
	for (const key of [
		"session_id",
		"job_id",
		"client_id",
		"date"
	]) if (search[key]) params.set(key, search[key]);
	return `/v1/admin/dashboard?${params.toString()}`;
}
var JobsScopeError = class extends Error {};
function assertJobsScope(result, search) {
	if (!result || result.ok !== true || !Array.isArray(result.jobs) || result.jobs.length > 50) throw new Error("jobs_unavailable");
	for (const key of [
		"session_id",
		"job_id",
		"client_id"
	]) {
		const selected = search[key];
		if (selected && result.filters?.[key] !== selected) throw new JobsScopeError("jobs_scope_mismatch");
	}
	for (const job of result.jobs) {
		if (!job || typeof job !== "object") throw new Error("jobs_unavailable");
		if (search.session_id && (job.session_id ?? job.id) !== search.session_id || search.job_id && (job.job_id ?? job.id) !== search.job_id || search.client_id && job.client_id !== search.client_id) throw new JobsScopeError("jobs_scope_mismatch");
	}
}
function jobsQueryOptions(search) {
	const validated = validateJobsSearch(search);
	return queryOptions({
		queryKey: [
			"admin-jobs-all",
			validated.client_id,
			validated.session_id,
			validated.job_id,
			validated.application_id,
			validated.date,
			validated.page
		],
		queryFn: async ({ signal }) => {
			const result = await apiGet(jobsPath(validated), signal);
			assertJobsScope(result, validated);
			return result;
		},
		retry: false,
		staleTime: 0,
		gcTime: 0
	});
}
/**
* Decide which case action a job card shows in list vs selected-detail mode.
* In detail mode (?session_id= / ?job_id=), the selected card must not link to
* the identical URL (dead link): it gets a "back to all jobs" link instead.
*/
function caseLinkAction(job, search) {
	const cardJobId = job.job_id ?? job.id;
	const cardSessionId = job.session_id ?? job.id;
	if (!cardJobId && !cardSessionId) return { kind: "none" };
	if (search.session_id ?? search.job_id) {
		if (search.job_id && cardJobId === search.job_id || search.session_id && cardSessionId === search.session_id) return { kind: "back" };
	}
	const href = cardJobId ? `/internal/admin/jobs/all?job_id=${encodeURIComponent(cardJobId)}` : `/internal/admin/jobs/all?session_id=${encodeURIComponent(cardSessionId)}`;
	const scope = {};
	if (search.client_id) scope["client_id"] = search.client_id;
	if (search.application_id) scope["application_id"] = search.application_id;
	return {
		kind: "open",
		href,
		search: scope
	};
}
//#endregion
export { validateJobsSearch as a, jobsQueryOptions as i, caseLinkAction as n, jobDateLabels as r, JobsScopeError as t };
