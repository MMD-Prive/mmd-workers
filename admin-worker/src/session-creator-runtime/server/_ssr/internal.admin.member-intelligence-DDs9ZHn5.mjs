import { _ as lazyRouteComponent, v as createFileRoute } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.member-intelligence-DDs9ZHn5.js
var $$splitComponentImporter = () => import("./internal.admin.member-intelligence-D7OeIf_a.mjs");
var Route = createFileRoute("/internal/admin/member-intelligence")({
	validateSearch: (s) => ({
		q: typeof s["q"] === "string" ? s["q"].slice(0, 160) : "",
		client_id: typeof s["client_id"] === "string" && /^rec[A-Za-z0-9]{6,}$/.test(s["client_id"]) ? s["client_id"] : ""
	}),
	head: () => ({ meta: [
		{ title: "Member Intelligence — MMD CONTROL ROOM" },
		{
			name: "description",
			content: "Understand a customer at a glance: identity, relationship, current state, what needs attention and the next best action."
		},
		{
			property: "og:title",
			content: "Member Intelligence — MMD CONTROL ROOM"
		},
		{
			property: "og:description",
			content: "Operator read-only customer intelligence from canonical MMD sources."
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
