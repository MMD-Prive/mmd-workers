/**
 * Curated *candidate* protected-page inventory, based on Webflow pages and
 * canonical worker routes reviewed on 2026-11-08.
 *
 * This is not an authorization declaration, not a guarantee that every route
 * requires login, and not an exhaustive route-discovery mechanism. A preview
 * adapter must be built and approved for each real interactive screen.
 *
 * Never put live signed URLs, ?t tokens, private files, or personal data here.
 */
export const GROUPS = Object.freeze([
  {
    id: "admin",
    title: "Internal · Owner & Operations",
    accent: "gold",
    access: "Admin session",
    routes: [
      ["admin-login", "/internal/admin/login", "เข้าสู่ระบบผู้ดูแล"],
      ["control-room", "/internal/admin/control-room", "MMD Control Room"],
      ["admin-dashboard", "/internal/admin/dashboard", "ภาพรวมการดำเนินงาน"],
      ["create-job", "/internal/admin/jobs/create-job", "สร้างงาน"],
      ["all-jobs", "/internal/admin/jobs/all", "รายการงานทั้งหมด"],
      ["customer-data", "/internal/admin/customer-data", "Customer 360"],
      ["admin-calendar", "/internal/admin/calendar", "ปฏิทินงาน"],
      ["admin-payments", "/internal/admin/payments", "Money Control"],
      ["historical-backfill", "/internal/admin/payments/historical-backfill", "หลักฐานการชำระย้อนหลัง"],
      ["member-intelligence", "/internal/admin/member-intelligence", "ข้อมูลสมาชิก"],
      ["membership-access", "/internal/admin/membership-access", "สิทธิ์สมาชิก"],
      ["admin-kenji", "/internal/admin/kenji", "Kenji Control"],
      ["kenji-knowledge", "/internal/admin/kenji-knowledge", "Kenji Knowledge · Legacy"],
      ["mmd-review", "/internal/admin/mmd-review", "MMD Review"],
      ["admin-applications", "/internal/admin/applications", "ใบสมัคร"],
      ["admin-studio", "/internal/admin/studio", "Studio"],
      ["studio-upload", "/internal/admin/studio/upload", "Studio · Upload"],
      ["studio-review", "/internal/admin/studio/review", "Studio · Review"],
      ["studio-model-preview", "/internal/admin/studio/model-preview", "Studio · Model Preview"],
      ["studio-care-back", "/internal/admin/studio/care-back", "Studio · Care Back"],
      ["shop-products", "/internal/admin/shop/products", "Shop · Products"],
      ["shop-inventory", "/internal/admin/shop/inventory", "Shop · Inventory"],
      ["shop-orders", "/internal/admin/shop/orders", "Shop · Orders"],
      ["owner-setup", "/internal/admin/owner/setup", "Owner Setup"],
      ["access-invite", "/internal/admin/access/invite", "Invite"],
      ["mms-admin", "/internal/admin/mms", "MMS Admin"],
      ["premium-cleanup", "/internal/admin/premium-group-cleanup/preview", "Premium Group Review"],
      ["admin-client-intake", "/internal/admin/kenji-client-intake", "Kenji Client Intake · Legacy"],
      ["create-session-compat", "/internal/admin/jobs/create-session", "Create Session · Compatibility"],
      ["admin-console-legacy", "/internal/admin/console", "Admin Console · Legacy"]
    ]
  },
  {
    id: "member",
    title: "MY MMD · Member",
    accent: "red",
    access: "Member / LIFF session",
    routes: [
      ["member-login", "/member/login", "เข้าสู่ระบบสมาชิก"],
      ["my-mmd", "/member/my-mmd", "MY MMD"],
      ["member-dashboard", "/member/dashboard", "Member Dashboard"],
      ["member-profile", "/member/profile", "ข้อมูลส่วนตัว"],
      ["member-private", "/member/private", "Private"],
      ["member-requests", "/member/requests", "รายการคำขอ"],
      ["member-renewal", "/member/renewal", "ต่ออายุสมาชิก"],
      ["member-payments", "/member/payments", "การชำระเงิน"],
      ["member-kenji", "/member/kenji", "Kenji Member Concierge"],
      ["member-kenji-ai", "/member/kenji-ai-20", "Kenji AI 2.0"],
      ["member-experiences", "/member/experiences-guide", "Private Experiences"],
      ["member-updates", "/member/mmd-updates", "Updates"],
      ["member-promotion", "/member/promotion", "สิทธิพิเศษ"],
      ["member-preview-access", "/member/preview-access", "Preview Access"],
      ["member-sigil", "/member/sigil", "SĪGIL Member"]
    ]
  },
  {
    id: "model",
    title: "MY MODEL · Model Console",
    accent: "gold",
    access: "Model session / signed job",
    routes: [
      ["model-login", "/sigil/model/login", "เข้าสู่ระบบนายแบบ"],
      ["model-dashboard", "/sigil/model/dashboard", "MY MODEL Dashboard"],
      ["model-console", "/sigil/model/console", "MY MODEL Console"],
      ["model-client-brief", "/sigil/model/client-brief", "Client Brief"],
      ["model-wish", "/sigil/model/wish", "Model Wish"],
      ["job-model", "/sigil/confirm/job-model", "Job Model Confirmation"],
      ["model-confirmation", "/sigil/confirm/model-confirmation", "Model Confirmation"]
    ]
  },
  {
    id: "partner",
    title: "SĪGIL · Partner",
    accent: "gold",
    access: "Partner LINE / recognized token",
    routes: [
      ["partner-line-login", "/sigil/model/dashboard/partner-login", "Partner LINE Login"],
      ["partner-login-legacy", "/partner/login", "Partner Access · Compatibility"],
      ["partner-dashboard", "/partner/dashboard", "MY Partner Board"],
      ["partner-status", "/partner/status", "Partner Status"],
      ["partner-selection", "/partner/model-selection", "Partner Model Selection"],
      ["partner-service-guide", "/partner/model/service-guide", "Partner Service Guide"]
    ]
  },
  {
    id: "confirmation",
    title: "SĪGIL · Confirm & Payment",
    accent: "gold",
    access: "Signed, role-scoped confirmation token",
    routes: [
      ["job-confirmation", "/sigil/confirm/job-confirmation", "Customer Job Confirmation"],
      ["payment-confirmation", "/sigil/confirm/payment-confirmation", "Payment Confirmation"],
      ["sigil-payment", "/sigil/pay/payment", "Payment"],
      ["sigil-membership-payment", "/sigil/pay/membership", "Membership Payment"],
      ["sigil-renewal", "/sigil/pay/renewal", "Membership Renewal Payment"],
      ["sigil-blackcard-payment", "/sigil/pay/blackcard", "Black Card Payment"],
      ["sigil-course-payment", "/sigil/pay/course", "Course Payment"]
    ]
  },
  {
    id: "mms",
    title: "MMS · Customer & Therapist",
    accent: "green",
    access: "MMS / therapist identity",
    routes: [
      ["my-mms", "/male-massage/my-mms", "My MMS"],
      ["therapist-login", "/male-massage/therapists/login", "MY Therapist Login"],
      ["therapist-me", "/male-massage/therapists/me", "MY Therapist"],
      ["mms-partner-verify", "/male-massage/partner/verify", "MMS Partner Verify"],
      ["mms-member-booking", "/male-massage/member/mms-booking", "MMS Booking"]
    ]
  }
]);

export const ROUTES = Object.freeze(GROUPS.flatMap(group =>
  group.routes.map(([id, path, title]) => Object.freeze({
    id, path, title, group: group.id, groupTitle: group.title,
    access: group.access, accent: group.accent,
    preview: "illustrative_only"
  }))
));

const BY_ID = new Map(ROUTES.map(route => [route.id, route]));
export function findReviewRoute(id) {
  return typeof id === "string" ? BY_ID.get(id) || null : null;
}
