import {
  MMS_SKILLS,
  normalizeTherapistRecord,
  acceptsGender,
} from "./core.mjs";
import { therapistWorkspaceReadiness } from "./workspace-admin-runtime.mjs";

const ROOT = "/internal/mms/customer-search";
const STATUSES = ["Available", "Unavailable", "Paused"];
const FIELDS = [
  "Therapist ID",
  "Display Name",
  "Status",
  "Therapist Auth Status",
  "LINE Subject Hash",
  "MY MMS Access",
  "Matching Enabled",
  "Manual Review Only",
  "Verified Skills",
  "Customer Gender Scope",
  "Availability Status",
  "Base Service Zone",
  "Coverage Service Zones",
];

const clean = (value, max = 180) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const select = (value) =>
  typeof value === "string" ? value : clean(value?.name);
const fail = (status, code) => Object.assign(new Error(code), { status, code });
const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });

/** Customer discovery only. Never calls booking, dispatch, coordinator or write APIs. */
export async function maybeHandleCustomerSearch(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== ROOT && url.pathname !== `${ROOT}/catalog`) return null;
  if (url.hostname !== (env.MMS_INTERNAL_HOST || "mms.internal"))
    return json({ ok: false, error: { code: "INTERNAL_ONLY" } }, 403);
  if (request.method !== "GET")
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  if (
    !/^mmsmem_[a-f0-9]{32}$/.test(
      request.headers.get("x-mms-customer-member-ref") || "",
    )
  )
    return json({ ok: false, error: { code: "MMS_SESSION_REQUIRED" } }, 401);
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(6500)]);
    const catalogOnly = url.pathname.endsWith("/catalog");
    const allowed = catalogOnly
      ? []
      : ["service", "zone", "availability", "recipient"];
    if (
      [...url.searchParams.keys()].some(
        (key) =>
          !allowed.includes(key) || url.searchParams.getAll(key).length !== 1,
      )
    )
      throw fail(400, "MMS_SEARCH_FILTER_INVALID");
    const service = url.searchParams.get("service");
    const zoneCode = url.searchParams.get("zone");
    const availability = url.searchParams.get("availability");
    const recipient = url.searchParams.get("recipient");
    if (
      !catalogOnly &&
      (!MMS_SKILLS.some((item) => item.code === service) ||
        !/^(BKK|NBI|PTE|SPK|SKN|NPT)-[A-Z0-9-]{2,70}$/.test(zoneCode || "") ||
        !STATUSES.includes(availability))
    )
      throw fail(400, "MMS_SEARCH_FILTER_INVALID");
    if (!catalogOnly && !["ผู้ชาย", "ผู้หญิง"].includes(recipient))
      throw fail(409, "MANUAL_COORDINATION_REQUIRED");
    const zones = await listRecords(
      env,
      "SERVICE_ZONES",
      [
        "Active",
        "Zone Code",
        "Zone Name TH",
        "Zone Label",
        "Customer Safe Label TH",
        "Province Code",
        "Province TH",
        "Sort Order",
      ],
      signal,
      "{Active}=TRUE()",
    );
    const byId = new Map();
    const byCode = new Map();
    for (const record of zones) {
      const f = record.fields || {};
      const code = clean(f["Zone Code"], 80);
      const label =
        clean(f["Customer Safe Label TH"]) ||
        clean(f["Zone Name TH"]) ||
        clean(f["Zone Label"]);
      if (
        f.Active !== true ||
        !/^(BKK|NBI|PTE|SPK|SKN|NPT)-[A-Z0-9-]{2,70}$/.test(code) ||
        !label
      )
        continue;
      if (byCode.has(code)) throw fail(503, "MMS_SEARCH_ZONE_AMBIGUOUS");
      const zone = {
        code,
        label,
        province: clean(select(f["Province TH"])),
        order: Number(f["Sort Order"]) || 0,
      };
      byCode.set(code, zone);
      byId.set(record.id, zone);
    }
    if (!byCode.size) throw fail(503, "MMS_SEARCH_CATALOG_UNAVAILABLE");
    if (catalogOnly)
      return json({
        ok: true,
        data: {
          services: MMS_SKILLS.map((item) => ({
            code: item.code,
            label: item.th,
          })),
          zones: [...byCode.values()]
            .sort(
              (a, b) =>
                a.order - b.order || a.label.localeCompare(b.label, "th"),
            )
            .map(({ code, label, province }) => ({ code, label, province })),
          availability: [
            { code: "Available", label: "Online · รับงาน" },
            { code: "Unavailable", label: "Offline" },
            { code: "Paused", label: "พักรับงาน" },
          ],
        },
      });
    const zone = byCode.get(zoneCode);
    if (!zone) throw fail(400, "SERVICE_ZONE_INVALID");
    const records = await listRecords(env, "THERAPISTS", FIELDS, signal);
    const ids = new Set();
    const eligible = records.filter((record) => {
      const f = record.fields || {};
      const id = clean(f["Therapist ID"], 80);
      if (!/^[A-Za-z0-9_-]{4,80}$/.test(id) || !clean(f["Display Name"], 120))
        return false;
      if (ids.has(id)) throw fail(503, "MMS_SEARCH_IDENTITY_AMBIGUOUS");
      ids.add(id);
      const zoneIds = [
        ...(Array.isArray(f["Base Service Zone"])
          ? f["Base Service Zone"]
          : []),
        ...(Array.isArray(f["Coverage Service Zones"])
          ? f["Coverage Service Zones"]
          : []),
      ];
      return (
        therapistWorkspaceReadiness(record).can_open === true &&
        f["Matching Enabled"] === true &&
        !f["Manual Review Only"] &&
        f["Availability Status"] === availability &&
        zoneIds.some((id) => byId.get(id)?.code === zoneCode)
      );
    });
    // Reuse MY THERAPIST's confirmed-course normalization and recipient policy.
    // Exact canonical membership was checked above; no substitute zone values.
    const matches = eligible
      .map(normalizeTherapistRecord)
      .filter(
        (item) =>
          acceptsGender(item.customer_gender_scope, recipient) &&
          item.verified_skills.includes(service),
      )
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "th"));
    const labelByCode = new Map(MMS_SKILLS.map((item) => [item.code, item.th]));
    const results = matches.map((item) => ({
      id: item.therapist_id,
      publicName: item.display_name,
      serviceTags: item.verified_skills
        .map((code) => labelByCode.get(code))
        .filter(Boolean),
      areaTags: [zone.label],
      availability: item.availability_status,
      canReceiveWork: item.availability_status === "Available",
    }));
    return json({
      ok: true,
      data: {
        results,
        criteria: { service, zone: zoneCode, availability, recipient },
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: {
          code:
            error?.code && error?.status
              ? error.code
              : "MMS_SEARCH_UNAVAILABLE",
        },
      },
      Number(error?.status) || 503,
    );
  }
}

async function listRecords(env, kind, fields, signal, formula) {
  const table = env[`AIRTABLE_${kind}_TABLE_ID`];
  if (
    !env.AIRTABLE_API_TOKEN ||
    !/^app[A-Za-z0-9]+$/.test(env.AIRTABLE_BASE_ID || "") ||
    !/^tbl[A-Za-z0-9]+$/.test(table || "")
  )
    throw fail(503, "MMS_SEARCH_CONFIG_UNAVAILABLE");
  const records = [];
  let offset = "";
  for (let page = 0; page < 10; page++) {
    const url = new URL(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table}`,
    );
    url.searchParams.set("pageSize", "100");
    fields.forEach((field) => url.searchParams.append("fields[]", field));
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${env.AIRTABLE_API_TOKEN}` },
      signal,
      redirect: "error",
    });
    const body = await response.json().catch(() => null);
    if (
      !response.ok ||
      !Array.isArray(body?.records) ||
      body.records.some(
        (item) =>
          !item ||
          typeof item.id !== "string" ||
          !item.fields ||
          typeof item.fields !== "object" ||
          Array.isArray(item.fields),
      ) ||
      (body.offset !== undefined &&
        (typeof body.offset !== "string" || !body.offset))
    )
      throw fail(503, "MMS_SEARCH_SOURCE_UNAVAILABLE");
    records.push(...body.records);
    offset = body.offset || "";
    if (!offset) return records;
  }
  throw fail(503, "MMS_SEARCH_SOURCE_INCOMPLETE");
}
