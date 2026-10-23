import { _ as lazyRouteComponent, v as createFileRoute } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.payments.index-Bz4m3ss-.js
var $$splitComponentImporter = () => import("./internal.admin.payments.index-COAUgIe2.mjs");
/** Only accept a conservative id shape; never used to fetch outside the queue. */
function safeProofId(v) {
	return typeof v === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : void 0;
}
var Route = createFileRoute("/internal/admin/payments/")({
	validateSearch: (s) => {
		const id = safeProofId(s["proof_id"]);
		return id ? { proof_id: id } : {};
	},
	head: () => ({ meta: [
		{ title: "Money Control — MMD OS" },
		{
			name: "description",
			content: "Official Verify desk; decisions go to payments-worker, the Money Truth."
		},
		{
			property: "og:title",
			content: "Money Control — MMD OS"
		},
		{
			property: "og:description",
			content: "Official Verify desk for MMD payment evidence."
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
