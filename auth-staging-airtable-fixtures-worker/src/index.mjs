const BASE_ID = "app_auth_staging_fixture";

const FIXTURES = Object.freeze({
  current: {
    lineUserId: "U00000000000000000000000000000001",
    memberId: "MMD-STAGING-CURRENT-01",
    email: "care-back-current@example.invalid",
    displayName: "สมาชิกปัจจุบัน · STAGING",
  },
  returning: {
    lineUserId: "U00000000000000000000000000000002",
    memberId: "MMD-STAGING-RETURNING-01",
    email: "care-back-returning@example.invalid",
    displayName: "สมาชิกเก่า · STAGING",
  },
});

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function fixtureFromFormula(formula = "") {
  for (const fixture of Object.values(FIXTURES)) {
    if (formula.includes(fixture.lineUserId) || formula.toLowerCase().includes(fixture.email.toLowerCase())) return fixture;
  }
  return null;
}

function members(fixture) {
  if (!fixture) return [];
  return [{
    id: fixture === FIXTURES.current ? "recStageCurrent01" : "recStageReturn01",
    fields: {
      line_id: fixture.lineUserId,
      member_id: fixture.memberId,
      "Full Name (Display)": fixture.displayName,
      "Contact Email": fixture.email,
    },
  }];
}

function packages(fixture) {
  if (fixture === FIXTURES.current) {
    return [{ fields: {
      member_email: fixture.email,
      package_code: "premium",
      status: "active",
      created_at: "2026-08-01T00:00:00.000Z",
      start_date: "2026-08-01",
      end_date: "2027-01-31",
      duration_days: 184,
    } }];
  }
  if (fixture === FIXTURES.returning) {
    return [{ fields: {
      member_email: fixture.email,
      package_code: "standard",
      status: "expired",
      created_at: "2025-01-01T00:00:00.000Z",
      start_date: "2025-01-01",
      end_date: "2026-01-31",
      duration_days: 396,
    } }];
  }
  return [];
}

function points(fixture) {
  if (fixture !== FIXTURES.current) return [];
  return [{ fields: {
    member_email: fixture.email,
    points: 25,
    transaction_status: "posted",
    posted_at: "2026-08-15T02:00:00.000Z",
    created_at: "2026-08-15T02:00:00.000Z",
    idempotency_key: "stage-points-current-01",
  } }];
}

function sessions(fixture) {
  if (fixture !== FIXTURES.current) return [];
  return [{ fields: {
    line_user_id: fixture.lineUserId,
    email: fixture.email,
    job_date: "2026-08-20",
    job_type: "Staging Session",
    "Session Status": "Completed",
  } }];
}

function payments(fixture) {
  if (fixture !== FIXTURES.current) return [];
  return [{ fields: {
    "Member Email": fixture.email,
    "Payment Status": "paid",
    "Verification Status": "verified",
    "Payment Date": "2026-08-01",
    "Created At": "2026-08-01T00:00:00.000Z",
    "Updated At": "2026-08-01T00:00:00.000Z",
  } }];
}

export default {
  async fetch(request) {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 3 || parts[0] !== "v0" || parts[1] !== BASE_ID) return json({ error: "not_found" }, 404);

    const table = decodeURIComponent(parts.slice(2).join("/"));
    const formula = url.searchParams.get("filterByFormula") || "";
    const fixture = fixtureFromFormula(formula);
    let records;
    if (table === "Members") records = members(fixture);
    else if (table === "member_packages") records = packages(fixture);
    else if (table === "MMD — Points Ledger") records = points(fixture);
    else if (table === "Sessions") records = sessions(fixture);
    else if (table === "Payments") records = payments(fixture);
    else return json({ error: "unknown_fixture_table" }, 404);

    return json({ records });
  },
};
