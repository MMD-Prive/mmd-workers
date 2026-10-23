import { _ as lazyRouteComponent, v as createFileRoute } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.console.clients._clientId-DK3tLUor.js
var TABS = [
	{
		id: "overview",
		label: "ภาพรวม"
	},
	{
		id: "conversation",
		label: "บทสนทนา"
	},
	{
		id: "history",
		label: "ประวัติและงาน"
	},
	{
		id: "payment",
		label: "ชำระเงินและต่ออายุ"
	},
	{
		id: "points",
		label: "แต้มและสมาชิก"
	},
	{
		id: "access",
		label: "สิทธิ์เข้าถึง"
	},
	{
		id: "advanced",
		label: "ขั้นสูง"
	}
];
var $$splitComponentImporter = () => import("./internal.console.clients._clientId-C77rXVft.mjs");
var Route = createFileRoute("/internal/console/clients/$clientId")({
	validateSearch: (search) => {
		const t = search["tab"];
		const found = TABS.find((x) => x.id === t);
		return found ? { tab: found.id } : {};
	},
	head: () => ({ meta: [
		{ title: "Client 360 — MMD OS Per Console" },
		{
			name: "description",
			content: "มุมมองลูกค้าแบบรวม: ตัวตน บทสนทนา ประวัติงาน การชำระเงิน และผลการ reconcile สิทธิ์"
		},
		{
			name: "robots",
			content: "noindex, nofollow"
		},
		{
			property: "og:title",
			content: "Client 360 — MMD OS Per Console"
		},
		{
			property: "og:description",
			content: "มุมมองลูกค้าแบบรวมสำหรับผู้ดูแลภายใน"
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
//#endregion
export { TABS as n, Route as t };
