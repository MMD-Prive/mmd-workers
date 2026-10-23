import { _ as lazyRouteComponent, v as createFileRoute } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.jobs.create-job-DcBppxqP.js
var $$splitComponentImporter = () => import("./internal.admin.jobs.create-job-Cw4qarTr.mjs");
var Route = createFileRoute("/internal/admin/jobs/create-job")({
	validateSearch: (s) => ({
		...s["mode"] === "broadcast" ? { mode: "broadcast" } : {},
		...s["mode"] === "broadcast" && s["view"] === "list" ? { view: "list" } : {},
		...typeof s["client_id"] === "string" ? { client_id: s["client_id"] } : {}
	}),
	head: () => ({ meta: [
		{ title: "Create Job — MMD Control Room" },
		{
			name: "description",
			content: "Five-step MMD operator workflow for guarded client, work, model, details and job creation."
		},
		{
			property: "og:title",
			content: "Create Job — MMD Control Room"
		},
		{
			property: "og:description",
			content: "Guarded MMD Control Room workflow for creating jobs."
		},
		{
			property: "og:type",
			content: "website"
		},
		{
			name: "twitter:card",
			content: "summary"
		},
		{
			name: "robots",
			content: "noindex, nofollow"
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
//#endregion
export { Route as t };
