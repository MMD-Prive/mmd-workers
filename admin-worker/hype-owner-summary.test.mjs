import test from "node:test";
import assert from "node:assert/strict";

import { buildHypeOwnerSummaryProjection, handleHypeOwnerSummaryRpc } from "./src/hype-owner-summary.js";

test("HYPE owner summary projects canonical dashboard into a bounded read-only brief", () => {
  const summary = buildHypeOwnerSummaryProjection({
    generated_at: "2026-09-19T07:50:00.000Z",
    focus: { title: "ตรวจเงินก่อน", text: "มี Payment Review รอตรวจ 2 รายการ" },
    counts: {
      urgent: 5,
      payment_review: 2,
      historical_recovery: 1,
      jobs: 3,
      jobs_need_confirm: 1,
      membership_review: 1,
      reconfirm_pending: 1,
      reconfirm_overdue: 0,
    },
    money: [
      { title: "คุณเอ็ม", text: "Deposit · พร้อมตรวจ", amount: "5000", href: "/internal/admin/payments" },
      { title: "คุณก้อง", text: "Balance · พร้อมตรวจ", amount: "3000", href: "/internal/admin/payments" },
    ],
    historical_recovery: [
      { customer_name: "คุณโจ", amount_thb: 10000, review_state: "pending" },
    ],
    jobs: [
      { id: "JOB-1", title: "Book EI · คุณเอ็ม", status: "รอคอนเฟิร์ม", text: "pending", job_date: "2026-09-19", time: "19 ก.ย. 2569 · 19:00", href: "/internal/admin/jobs/JOB-1" },
      { id: "JOB-2", title: "Kendo · คุณก้อง", status: "ยืนยันแล้ว", text: "confirmed", job_date: "2026-09-20", time: "20 ก.ย. 2569 · 18:00", href: "/internal/admin/jobs/JOB-2" },
    ],
    members: [
      { title: "คุณคิว", text: "SVIP · ใกล้หมดอายุ", tag: "ต่ออายุ", href: "/internal/admin/member-intelligence" },
    ],
    boss: [
      { title: "Boss Review", text: "มีเคสพิเศษ 1 รายการ", href: "/internal/ceo" },
    ],
    todos: [
      { title: "ตรวจเงินของคุณเอ็ม", text: "Deposit · พร้อมตรวจ", href: "/internal/admin/payments" },
    ],
    reconfirm: { total: 2, pending: 1, overdue: 0, acknowledged: 1 },
    status: { admin: "พร้อม", payments: "พร้อม", historical_recovery: "พร้อม", telegram: "พร้อม", data: "พร้อม", reconfirm: "พร้อม" },
  }, new Date("2026-09-19T07:50:00.000Z"), {
    ok: true,
    queue: {
      policy_version: "mmd-recovery-queue-sla-v1-20260919",
      open_count: 3,
      attention_count: 2,
      overdue_count: 1,
      watch_count: 1,
      assigned_count: 1,
      unassigned_count: 2,
      attention_unassigned_count: 1,
      by_domain: { booking: 2, mms: 1 },
      by_state: { reviewing: 2, resolved: 1 },
      attention: [
        {
          case_ref: "HYPE-PER-20260919010000-acde1234",
          client_name: "คุณเชน",
          domain: "booking",
          state: "reviewing",
          outcome_code: "awaiting_operations",
          sla_status: "overdue",
          since_update_minutes: 420,
          case_age_minutes: 510,
          next_attention: "review_and_update_outcome",
          assignment_status: "unassigned",
          assigned_to: null,
          assigned_lane: null,
          href: "/internal/admin/recovery?case_ref=HYPE-PER-20260919010000-acde1234",
        },
        {
          case_ref: "HYPE-PER-20260919050000-acde5678",
          client_name: "คุณ MMS",
          domain: "mms",
          state: "resolved",
          outcome_code: "rebooking_arranged",
          sla_status: "watch",
          since_update_minutes: 95,
          case_age_minutes: 270,
          next_attention: "notify_customer",
          assignment_status: "assigned",
          assigned_to: "Per",
          assigned_lane: "owner",
          href: "/internal/admin/recovery?case_ref=HYPE-PER-20260919050000-acde5678",
        },
      ],
      operational_only: true,
      business_truth_inferred: false,
    },
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.mode, "hype_owner_summary_v1");
  assert.equal(summary.focus.title, "ตรวจเงินก่อน");
  assert.equal(summary.counts.payment_review, 2);
  assert.equal(summary.counts.recovery_open, 3);
  assert.equal(summary.counts.recovery_attention, 2);
  assert.equal(summary.counts.recovery_overdue, 1);
  assert.equal(summary.counts.recovery_assigned, 1);
  assert.equal(summary.counts.recovery_unassigned, 2);
  assert.equal(summary.counts.recovery_attention_unassigned, 1);
  assert.equal(summary.recovery_queue.available, true);
  assert.equal(summary.recovery_queue.operational_only, true);
  assert.equal(summary.recovery_queue.business_truth_inferred, false);
  assert.equal(summary.what_to_watch_now[0].client_name, "คุณเชน");
  assert.equal(summary.what_to_watch_now[0].assignment_status, "unassigned");
  assert.equal(summary.what_to_watch_now[1].assigned_to, "Per");
  assert.equal(summary.next_actions[1].href, "/internal/admin/recovery?assignment=unassigned");
  assert.equal(summary.review_required.count, 7);
  assert.equal(summary.calendar.today_jobs.length, 1);
  assert.equal(summary.calendar.tomorrow_jobs.length, 1);
  assert.equal(summary.jobs.items[0].client_name, "คุณเอ็ม");
  assert.equal(summary.jobs.items[0].model_name, "Book EI");
  assert.deepEqual(summary.clients.display_names.slice(0, 4), ["คุณเอ็ม", "คุณก้อง", "คุณโจ", "คุณคิว"]);
  assert.equal(summary.next_actions[0].href, "/internal/admin/payments");
  assert.equal(summary.authority.recovery_assignment_policy, "mmd-recovery-assignment-v1-20260919");
  assert.equal(summary.authority.recovery_assignment_grants_authority, false);
  assert.equal(summary.authority.read_only, true);

  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /AIRTABLE_API_KEY|ADMIN_BEARER|payment_ref|raw_private_note/i);
});

test("HYPE owner summary RPC is service-binding only", async () => {
  const publicResponse = await handleHypeOwnerSummaryRpc(
    new Request("https://www.mmdbkk.com/__internal/hype/owner-summary", {
      method: "POST",
      headers: { "x-mmd-service-binding": "telegram-worker" },
    }),
    {},
  );
  assert.equal(publicResponse.status, 403);

  const wrongCaller = await handleHypeOwnerSummaryRpc(
    new Request("https://admin-worker.internal/__internal/hype/owner-summary", {
      method: "POST",
      headers: { "x-mmd-service-binding": "browser" },
    }),
    {},
  );
  assert.equal(wrongCaller.status, 403);
});
