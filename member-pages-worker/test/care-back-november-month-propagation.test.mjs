import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRenewalView, renewalViewHtml } from "../src/liff-renewal-view.js";
import { currentPrivateMembershipPromotion } from "../../shared/membership-promotion-policy.mjs";

// Unit isolation at the network/storage boundaries. The production module,
// shared paid-time policy, presentation code and copy are executed unchanged.
const dataModule = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
async function isolatedModule(relative, replacements = {}) {
  const url = new URL(relative, import.meta.url);
  const source = await readFile(url, "utf8");
  const linked = source.replace(/from (["'])([^"']+)\1/g, (_, _quote, specifier) =>
    "from " + JSON.stringify(replacements[specifier] || new URL(specifier, url).href));
  return import(dataModule(linked));
}
const card = await isolatedModule("../src/liff-renewal-card.js", {
  "./member-app-api.js": dataModule("export const readMemberAppSession = async (_request, env) => env.TEST_SESSION; export const rememberMemberPaymentSnapshot = async () => { throw new Error('unexpected write'); };"),
  "./liff-gateway-airtable.js": dataModule("export const getLiffGatewayStore = () => { throw new Error('unexpected storage'); };"),
  "./renewal-offer.js": dataModule("export const resolveCanonicalRenewalOffer = async (env) => env.TEST_OFFER;"),
  "./renewal-session-context.js": dataModule("export const RENEWAL_VERIFIED_SESSION = Symbol.for('test.verified-session'); export const sameRenewalIdentity = () => false;"),
});
const benefits = await isolatedModule("../src/kenji-member-benefits.js", {
  "./care-back-claim-store.js": dataModule("export const getCareBackStore = () => { throw new Error('unexpected storage'); };"),
  "./care-back-phase1-recovery.js": dataModule("export const readCareBackPhase1Recovery = () => { throw new Error('unexpected recovery'); };"),
});
const live = await isolatedModule("../../member-dashboard-chat-worker/src/kenji-line-live-truth.mjs");
const rights = await isolatedModule("../../member-dashboard-chat-worker/src/kenji-line-rights-check.mjs", {
  "./index.js": dataModule("export const getLineOwnerTakeoverState = () => {}; export const requestKenjiRuntimeStatus = () => {};"),
  "./kenji-line-continuity-runtime.mjs": dataModule("export const resolveKenjiLineContinuity = () => {}; export const writeKenjiLineMatrixTurn = () => { throw new Error('unexpected write'); };"),
  "./kenji-line-conversation-history.mjs": dataModule("export const recordDeliveredKenjiLineReply = () => { throw new Error('unexpected write'); };"),
  "./kenji-membership-menu.mjs": dataModule("export const isMembershipMenuCommand = () => false; export const renderMembershipMenu = () => {};"),
  "./kenji-private-interest.mjs": dataModule("export const isPrivateInterestCommand = () => false; export const renderPrivateInterest = () => {};"),
});
const NOVEMBER = "2026-11-01T12:00:00+07:00";
const OCTOBER = "2026-10-31T12:00:00+07:00";
const now = () => new Date(NOVEMBER);
const expiry = "2027-08-31T16:59:59.999Z";
const member = (level = "private_premium", extra = {}) => ({
  level, lifecycle: "active", expire_at: expiry, member_blocked: false, ...extra,
});
const promo = (package_code = "premium", paid_at = NOVEMBER) => currentPrivateMembershipPromotion({
  package_code, paid_at, action: "renewal", existing_member: true, prior_expire_at: expiry,
});
function dom() {
  const elements = new Map();
  const node = () => ({ textContent: "", hidden: false, disabled: false, children: [], addEventListener() {},
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; }, className: "" });
  const get = id => {
    if (id === "rn-logo-image") return null;
    if (!elements.has(id)) elements.set(id, node());
    return elements.get(id);
  };
  const fields = ["premium", "standard"].map(value => ({ ...node(), value, checked: false }));
  return { document: { getElementById: get, querySelectorAll: () => fields, createElement: node }, get };
}
function render(package_code = "premium", extra = {}) {
  const d = dom();
  const ui = createRenewalView({ document: d.document, fetcher() { throw new Error("unexpected fetch"); },
    navigate() { throw new Error("unexpected navigation"); }, showView() {}, checkoutUrl: () => "",
    getBusy: () => false, setBusy() {} });
  ui.render({ ok: true, status: "ready", payment_available: true, package_code, current_package_code: package_code,
    amount_thb: package_code === "premium" ? 2500 : 1000, membership_years: 1, bonus_months: 6, bonus_years: 0, bonus_days: 0,
    history_status: "not_required_for_advance", pricing_policy: "renewal_90_days_20261027",
    price_rule: "active_advance_" + package_code, discount_verified: true, official_verification_required: true,
    entitlement_granted: false, current_expires_at: expiry, renewal_starts_at: expiry,
    new_expires_at: "2029-02-28T16:59:59.999Z", promotion_label: "โปรต่ออายุ: เพิ่ม 6 เดือน", ...extra });
  return d;
}
const truth = (m, promotion, renewal = { status: "review_required" }) => ({
  ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "resolved",
  membership: m, promotion, renewal,
  points: { status: "verified", authority: "canonical_paid_points_source_guard_v1", active_points: 100 },
});

test("November public copy covers all returning cohorts through Nov 30 and hides the internal honor window", () => {
  for (const date of ["2026-11-01T00:00:00+07:00", "2026-11-30T23:59:59.999+07:00"]) {
    const html = renewalViewHtml(new Date(date));
    assert.match(html, /สมาชิกเดิม รับอายุสมาชิกเพิ่ม 6 เดือน/);
    assert.match(html, /หมดอายุไม่เกิน 6 เดือนหรือเกิน 6 เดือน/);
    assert.match(html, /30 พ.ย. 2569/);
    assert.doesNotMatch(html, /31 ต.ค.|Premium เพิ่ม 1 ปี|Standard เพิ่ม 180 วัน|เพิ่มสูงสุดอีก 1 ปี/);
    assert.doesNotMatch(html, /31 ธ.ค.|สิ้นปี|2027-01-01|honored_before/);
    assert.match(html, /สมัครใหม่ 2,999 บาท \/ 2 ปี/);
    assert.match(html, /สมัครใหม่ 1,199 บาท \/ 1 ปี/);
  }
  assert.doesNotMatch(renewalViewHtml(new Date("2026-12-01T00:00:00+07:00")), /<aside class="rn-campaign"/);
});

test("October public copy is retained for historical rendering", () => {
  const html = renewalViewHtml(new Date("2026-10-31T23:59:59.999+07:00"));
  assert.match(html, /31 ต.ค. 2569/);
  assert.match(html, /Standard เพิ่ม 180 วัน · Premium เพิ่ม 1 ปี/);
  assert.doesNotMatch(html, /30 พ.ย. 2569|รับอายุสมาชิกเพิ่ม 6 เดือน/);
});

for (const packageCode of ["premium", "standard"]) {
  test(packageCode + " offer DTO carries six calendar months and the policy-computed expiry", async () => {
    const response = await card.handleLiffRenewalCard(new Request("https://mmdbkk.com/member/api/liff/renewal/offer"), {
      LIFF_RENEWAL_CARD_ENABLED: "true",
      TEST_SESSION: { lineUserId: "U" + "1".repeat(32), memberExists: true, memberProfile: { membership_expires_at: expiry } },
      TEST_OFFER: { status: "ready", package_code: packageCode, amount_thb: packageCode === "premium" ? 2500 : 1000,
        membership_years: 1, membership_start_at: expiry, promotion: promo(packageCode) },
    });
    const result = await response.json();
    assert.equal(result.bonus_months, 6);
    assert.equal(result.bonus_years, 0);
    assert.equal(result.bonus_days, 0);
    assert.equal(result.promotion_label, "โปรต่ออายุ: เพิ่ม 6 เดือน");
    assert.equal(result.new_expires_at, "2029-02-28T16:59:59.999Z");
    assert.equal(result.promotion_ends_before, "2026-12-01T00:00:00+07:00");
    assert.equal(result.entitlement_granted, false);
    assert.equal(result.official_verification_required, true);
  });
  test(packageCode + " verified UI shows base year, month bonus and unchanged amount", t => {
    t.mock.method(Date, "now", () => now().getTime());
    const d = render(packageCode);
    const rows = d.get("renewal-rows").children.map(row => row.children.map(cell => cell.textContent).join(":"));
    assert.ok(rows.includes("ระยะต่ออายุพื้นฐาน:1 ปี"));
    assert.ok(rows.includes("CARE BACK เพิ่ม:6 เดือน"));
    assert.match(d.get("rn-selection").textContent, /1 ปี \+ 6 เดือน/);
    assert.equal(d.get("renewal-amount").textContent, packageCode === "premium" ? "฿2,500" : "฿1,000");
    assert.doesNotMatch(d.get("renewal-promo").textContent, /รวมระยะสมาชิก 2 ปี|180 วัน/);
    assert.equal(d.get("renewal-action").disabled, false);
  });
}

test("a review-only server offer never exposes a personal amount or bonus DTO", async () => {
  const response = await card.handleLiffRenewalCard(new Request("https://mmdbkk.com/member/api/liff/renewal/offer"), {
    LIFF_RENEWAL_CARD_ENABLED: "true",
    TEST_SESSION: { lineUserId: "U" + "1".repeat(32) },
    TEST_OFFER: { status: "review_required", bonus_months: 6, amount_thb: 2500 },
  });
  const result = await response.json();
  assert.equal(result.payment_available, false);
  assert.equal(result.bonus_months, undefined);
  assert.equal(result.amount_thb, undefined);
});

test("the 93-day personal renewal remains blocked despite a six-month promotion field", t => {
  t.mock.method(Date, "now", () => now().getTime());
  const d = render("premium", { history_status: "not_required_for_90_day_renewal",
    price_rule: "expired_within_90_days_premium", current_expires_at: new Date(Date.now() - 93 * 86400000).toISOString() });
  assert.equal(d.get("renewal-action").disabled, true);
  assert.equal(d.get("renewal-amount").textContent, "—");
  assert.equal(d.get("renewal-promo").hidden, true);
  assert.equal(d.get("renewal-rows").children.length, 0);
});

test("historical personal UI still presents the original verified year or day bonus", t => {
  t.mock.method(Date, "now", () => Date.parse(OCTOBER));
  const premium = render("premium", { bonus_months: 0, bonus_years: 1, promotion_label: "โปรต่ออายุ: เพิ่ม 1 ปี" });
  assert.match(premium.get("renewal-promo").textContent, /รวมระยะสมาชิก 2 ปี/);
  const standard = render("standard", { bonus_months: 0, bonus_days: 180, promotion_label: "โปรต่ออายุ: เพิ่ม 180 วัน" });
  assert.match(standard.get("rn-selection").textContent, /1 ปี \+ 180 วัน/);
});

test("legacy embedded renewal rendering carries months without changing the purchased term", async () => {
  const source = await readFile(new URL("../src/liff-member-shell.js", import.meta.url), "utf8");
  const start = source.indexOf("  function renewalDate(");
  const end = source.indexOf("  async function purchaseRenewal(", start);
  assert.ok(start > 0 && end > start);
  const d = dom();
  const renderLegacy = new Function("document", "purchaseRenewal", source.slice(start, end) + "; return renderRenewalCard;")(d.document, () => {});
  renderLegacy({}, { status: "ready", payment_available: true, package_label: "Premium",
    amount_thb: 2500, membership_years: 1, bonus_months: 6, bonus_years: 0, bonus_days: 0 });
  const rows = d.get("renewal-rows").children.map(row => row.children.map(cell => cell.textContent).join(":"));
  assert.ok(rows.includes("ระยะเวลาที่ซื้อ:1 ปี"));
  assert.ok(rows.includes("CARE BACK เพิ่ม:6 เดือน"));
});

for (const level of ["private_premium", "private_standard"]) {
  test(level + " canonical personal projection includes the six-month benefit for active and within-90-day members", () => {
    for (const membership of [member(level), member(level, { lifecycle: "expired", expire_at: "2026-10-01T00:00:00+07:00" })]) {
      const result = benefits.projectKenjiRenewalPromotion(membership, now());
      assert.equal(result.authority, "owner_approved_november_returning_2026_v1");
      assert.equal(result.status, "conditional_eligible");
      assert.equal(result.promotion_months, 6);
      assert.equal(result.bonus_months, 6);
      assert.equal(result.promotion_years, 0);
      assert.equal(result.promotion_days, 0);
      assert.equal(result.base_years, 1);
      assert.equal(result.checkout_status, "review_required");
    }
  });
}

test("expired returning members beyond 90 days retain the policy benefit without a fabricated renewal price or base term", () => {
  for (const expired of ["2026-07-31T12:00:00+07:00", "2026-03-01T00:00:00+07:00", "2024-01-01T00:00:00+07:00"]) {
    const result = benefits.projectKenjiRenewalPromotion(member("private_premium", { lifecycle: "expired", expire_at: expired }), now());
    assert.equal(result.status, "review_required");
    assert.equal(result.promotion_months, 6);
    assert.equal(result.reason, "renewal_expired_over_90_days_review_required");
    assert.equal(result.checkout_status, undefined, "no checkout candidate may override the existing price-review reason");
    assert.equal(result.base_years, undefined);
    assert.equal(result.total_years, undefined);
    assert.equal(result.amount_thb, undefined);
  }
});

test("historical projections retain package-specific bonuses and the old one-year cap", () => {
  for (const [level, years, days] of [["private_premium", 1, 0], ["private_standard", 0, 180]]) {
    const result = benefits.projectKenjiRenewalPromotion(member(level), new Date(OCTOBER));
    assert.equal(result.authority, "owner_approved_october_renewal_2026_v1");
    assert.equal(result.promotion_years, years);
    assert.equal(result.promotion_days, days);
    assert.equal(result.promotion_months, 0);
  }
  const expired = benefits.projectKenjiRenewalPromotion(member("private_premium", { lifecycle: "expired", expire_at: "2024-01-01" }), new Date(OCTOBER));
  assert.equal(expired.status, "not_applicable");
  assert.equal(expired.reason, "expired_one_calendar_year_or_more");
});

test("missing expiry and blocked membership do not acquire a personal benefit", () => {
  const missing = benefits.projectKenjiRenewalPromotion(member("private_premium", { expire_at: "" }), now());
  assert.equal(missing.status, "review_required");
  assert.equal(missing.promotion_months, undefined);
  const blocked = benefits.projectKenjiRenewalPromotion(member("private_premium", { member_blocked: true }), now());
  assert.equal(blocked.status, "not_applicable");
  assert.equal(blocked.promotion_months, undefined);
});

test("rights-check renders the approved monthly projection while retaining payment review", t => {
  t.mock.method(Date, "now", () => now().getTime());
  const m = member();
  const result = rights.renderLineRightsCheck(truth(m, benefits.projectKenjiRenewalPromotion(m, now())));
  assert.match(result.text, /สิทธิ์หลัก 1 ปี \+ CARE BACK เพิ่ม 6 เดือน/);
  assert.match(result.text, /30 พ.ย. 2569/);
  assert.match(result.text, /ให้เปอร์ตรวจยอด/);
  assert.doesNotMatch(result.text, /โปร 1 ปี|180 วัน|31 ต.ค.|31 ธ.ค.|สิ้นปี/);
  assert.equal(result.handoff_required, true);
});

test("rights-check hides unverified personal offers and stale October claims during November", t => {
  t.mock.method(Date, "now", () => now().getTime());
  const expired = member("private_premium", { lifecycle: "expired", expire_at: "2024-01-01" });
  const review = rights.renderLineRightsCheck(truth(expired, benefits.projectKenjiRenewalPromotion(expired, now())));
  assert.doesNotMatch(review.text, /สิทธิ์หลัก 1 ปี|CARE BACK เพิ่ม 6 เดือน|2,500/);
  const old = benefits.projectKenjiRenewalPromotion(member(), new Date(OCTOBER));
  old.ends_before = "2099-01-01";
  assert.doesNotMatch(rights.renderLineRightsCheck(truth(member(), old)).text, /รวม 2 ปี|โปร 1 ปี/);
});

test("rights-check preserves historical October bonus copy when rendered at its original time", t => {
  t.mock.method(Date, "now", () => Date.parse(OCTOBER));
  const m = member();
  const result = rights.renderLineRightsCheck(truth(m, benefits.projectKenjiRenewalPromotion(m, new Date(OCTOBER))));
  assert.match(result.text, /Premium: รวม 2 ปี \(สิทธิ์หลัก 1 ปี \+ โปร 1 ปี\)/);
});

test("verified live-truth renewal text preserves six-month units and the canonical amount", () => {
  const renewal = { status: "ready", package_code: "premium", membership_years: 1,
    amount_thb: 2500, discount_verified: true, promotion: promo() };
  const result = live.buildKenjiLiveTruthDecision("membership_renewal", truth(member(), undefined, renewal));
  assert.match(result.text, /Premium ได้ 1 ปี ราคา 2,500 บาท/);
  assert.match(result.text, /CARE BACK เพิ่ม 6 เดือน/);
  assert.doesNotMatch(result.text, /6 ปี|โบนัสเพิ่ม 1|180 วัน/);
  assert.equal(result.handoff_required, true);
  assert.equal(result.truth_status, "verified");
});

test("unverified live-truth renewal remains a review reply without a personal bonus or price", () => {
  const unready = truth(member(), undefined, { status: "review_required", package_code: "premium",
    amount_thb: 2500, membership_years: 1, discount_verified: true, promotion: promo() });
  const decision = live.buildKenjiLiveTruthDecision("membership_renewal", unready);
  assert.doesNotMatch(decision.text, /6 เดือน|2,500/);
  assert.equal(decision.truth_status, "unavailable");
  const unresolved = { ...unready, identity_status: "unresolved",
    renewal: { ...unready.renewal, status: "ready" } };
  assert.doesNotMatch(live.buildKenjiLiveTruthDecision("membership_renewal", unresolved).text, /6 เดือน|2,500/);
});

test("an October owner-reviewed quote retains its historical bonus and expires before November", t => {
  const owner = { authority: "owner_per_rename_membership_context_v1", access_verified: false,
    level: "private_premium", status: "owner_confirmed_expiry", source_record_id: "fixture-rename",
    expire_at: "2023-01-13T16:59:59.999Z", renewal_offer: {
      authority: "owner_reviewed_account_renewal_v1", status: "ready", source_record_id: "fixture-rename",
      approval_ref: "fixture-only", package_code: "premium", amount_thb: 2500, membership_years: 1,
      bonus_years: 1, grants_access: false, requires_verified_payment: true,
      approved_at: "2026-10-30T12:48:17Z", valid_before: "2026-11-01T00:00:00+07:00",
    } };
  const payload = { ok: true, authority: "my_mmd_entitlement_resolver_v1",
    identity_status: "owner_oa_linked", owner_membership_context: owner };
  t.mock.method(Date, "now", () => Date.parse(OCTOBER));
  assert.match(live.buildKenjiLiveTruthDecision("membership_renewal", payload).text, /โบนัสเพิ่ม 1/);
  t.mock.method(Date, "now", () => now().getTime());
  assert.doesNotMatch(live.buildKenjiLiveTruthDecision("membership_renewal", payload).text, /โบนัสเพิ่ม 1|2,500/);
});

