import { _ as lazyRouteComponent, v as createFileRoute } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as validateJobsSearch } from "./jobs-DEY8sWDt.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.jobs.all-CnRkNwIp.js
var $$splitComponentImporter = () => import("./internal.admin.jobs.all-lmuQBYsh.mjs");
var Route = createFileRoute("/internal/admin/jobs/all")({
	validateSearch: validateJobsSearch,
	head: () => ({ meta: [
		{ title: "All Jobs — MMD OS" },
		{
			name: "description",
			content: "รายการและเคสงานจากระบบหลังบ้าน MMD"
		},
		{
			property: "og:title",
			content: "All Jobs — MMD OS"
		},
		{
			property: "og:description",
			content: "รายการและเคสงานจากระบบหลังบ้าน MMD"
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
