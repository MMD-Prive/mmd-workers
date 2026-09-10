import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReconfirmOverview,
  deriveDashboardReconfirmStatus,
} from "./src/dashboard-worker.js";

const here = dirname(fileURLToPath(import.meta.url));

test("dashboard reconfirm derives D-1 states on the server", () => {
  const now = Date.parse("2026-09-10T17:00:00+07:00");
  assert.equal(
    deriveDashboardReconfirmStatus({
      explicitStatus: "scheduled",
      requiredAt: "2026-09-10T16:00:00+07:00",
      overdueAt: "2026-09-10T19:00:00+07:00",
      acknowledgedAt: "",
    }, now),
    "pending",
  );
  assert.equal(
    deriveDashboardReconfirmStatus({
      explicitStatus: "pending",
      requiredAt: "2026-09-10T16:00:00+07:00",
      overdueAt: "2026-09-10T19:00:00+07:00",
      acknowledgedAt: "2026-09-10T16:30:00+07:00",
    }, now),
    "acknowledged",
  );
  assert.equal(
    deriveDashboardReconfirmStatus({
      explicitStatus: "pending",
      requiredAt: "2026-09-10T16:00:00+07:00",
      overdueAt: "2026-09-10T19:00:00+07:00",
      acknowledgedAt: "",
    }, Date.parse("2026-09-10T19:00:00+07:00")),
    "overdue",
  );
});

test("SIGIL Jobs tomorrow overview exposes only safe reconfirm fields", () => {
  const records = [
    {
      id: "recA",
      fields: {
        session_id: "s1",
        job_id: "j1",
        job_date: "2026-09-11",
        start_time: "18:00",
        model_name: "EMs01",
        client_name: "คุณ A",
        session_state: "confirmed",
        reconfirm_status: "pending",
        reconfirm_required_at: "2026-09-10T16:00:00+07:00",
        reconfirm_reminder_at: "2026-09-10T18:00:00+07:00",
        reconfirm_overdue_at: "2026-09-10T19:00:00+07:00",
        note: "PRIVATE INTERNAL NOTE",
      },
    },
    {
      id: "recB",
      fields: {
        session_id: "s2",
        job_date: "2026-09-11",
        start_time: "17:00",
        model_name: "EMs03",
        client_name: "คุณ B",
        session_state: "accepted",
        reconfirm_status: "acknowledged",
        reconfirm_acknowledged_at: "2026-09-10T15:00:00+07:00",
      },
    },
    {
      id: "recC",
      fields: {
        session_id: "s3",
        job_date: "2026-09-11",
        session_state: "en_route",
        reconfirm_status: "pending",
      },
    },
  ];

  const out = buildReconfirmOverview(
    records,
    new Date("2026-09-10T17:00:00+07:00"),
    "2026-09-11",
  );

  assert.equal(out.available, true);
  assert.equal(out.total, 2);
  assert.equal(out.pending, 1);
  assert.equal(out.acknowledged, 1);
  assert.deepEqual(out.items.map((item) => item.session_id), ["s2", "s1"]);
  assert.equal(JSON.stringify(out).includes("PRIVATE INTERNAL NOTE"), false);
  assert.equal(Object.hasOwn(out.items[0], "note"), false);
});

test("Create Job keeps canonical linking inside the reconfirm wrapper", async () => {
  const source = await readFile(join(here, "src/studio-telegram-worker.js"), "utf8");
  assert.match(source, /isModelReconfirmRequest\(path, method\)/);
  assert.match(source, /isCanonicalLinkedJobCreate\(path, method\)/);
  assert.match(source, /const canonicalDownstream = \{/);
  assert.match(source, /handleCanonicalLinkedJobCreate\(innerRequest, innerEnv, innerCtx, studioWorker\)/);
  assert.match(source, /handleModelReconfirmRequest\(request, env, ctx, canonicalDownstream\)/);
});
