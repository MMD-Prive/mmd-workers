import { _ as lazyRouteComponent, v as createFileRoute } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.customer-data-CWeMksG_.js
var $$splitComponentImporter = () => import("./internal.admin.customer-data-DO3TY183.mjs");
var Route = createFileRoute("/internal/admin/customer-data")({
	validateSearch: (s) => ({ q: typeof s["q"] === "string" ? s["q"] : "" }),
	head: () => ({ meta: [
		{ title: "ลูกค้า — MMD OS" },
		{
			name: "description",
			content: "Client 360: remembered name first, verified identity, history, payment and access."
		},
		{
			property: "og:title",
			content: "ลูกค้า — MMD OS"
		},
		{
			property: "og:description",
			content: "MMD OS client room."
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
