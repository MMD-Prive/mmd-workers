import core from "./index.js";

const DRIVE_BOOTSTRAP_PATH = "/__internal/member-drive/bootstrap";
const DRIVE_BOOTSTRAP_PURPOSE = "liff_drive_member_bootstrap";
const SECRET_HEADER = "x-mmd-member-resolver-secret";
const PREMIUM = "premium";
const STANDARD = "standard";
const MEMBER_TABLE = "Members";
const PACKAGE_TABLE = "member_packages";
const ENTITLEMENT_TABLE = "MMD — Member Entitlements";
const DRIVE_MARKER = "drive_access_sync";

export function packageAccessLayers(packageCode) {
  const normalized = normalizePackage(packageCode);
  if (normalized === PREMIUM) return [STANDARD, PREMIUM];
  if (normalized === STANDARD) return [STANDARD];
  return [];
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === DRIVE_BOOTSTRAP_PATH && request.method === "POST") {
      return handleDriveBootstrap(request, env);
    }
    return core.fetch(request, env, ctx);
  },
};

async function handleDriveBootstrap(request, env) {
  if (!authorizedInternalRequest(request, env)) return notFound();
  const body = await request.json().catch(() => null);
  const allowedKeys = new Set(["purpose", "line_user_id", "email", "display_name", "package_code", "drive_folder_id", "access_layers"]);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return json({ ok: false, error: { code: "INVALID_DRIVE_BOOTSTRAP", message: "A valid Drive member bootstrap request is required." } }, 400);
  }
  if (body.purpose !== DRIVE_BOOTSTRAP_PURPOSE) return notFound();

  const lineUserId = String(body.line_user_id || "").trim();
  const email = normalizeEmail(body.email);
  const displayName = safeText(body.display_name, 120);
  const packageCode = normalizePackage(body.package_code);
  const driveFolderId = safeFolderId(body.drive_folder_id);
  const requestedLayers = Array.isArray(body.access_layers) ? body.access_layers.map(normalizePackage).filter(Boolean) : [];
  const canonicalLayers = packageAccessLayers(packageCode);

  if (!/^U[0-9a-f]{32}$/i.test(lineUserId) || !email || !packageCode || !driveFolderId) {
    return json({ ok: false, error: { code: "INVALID_DRIVE_BOOTSTRAP", message: "Drive bootstrap identity is invalid." } }, 400);
  }
  if (requestedLayers.length !== canonicalLayers.length || requestedLayers.some((value, index) => value !== canonicalLayers[index])) {
    return json({ ok: false, error: { code: "INVALID_ACCESS_HIERARCHY", message: "Drive package access hierarchy is invalid." } }, 400);
  }

  try {
    const member = await upsertMemberMapping(env, { lineUserId, email, displayName, packageCode });
    await syncCurrentPackage(env, { email, packageCode, driveFolderId });
    await syncEntitlements(env, { memberRecordId: member.recordId, lineUserId, email, packageCode, driveFolderId });
    return json({
      ok: true,
      data: {
        member_resolved: true,
        package_code: packageCode,
        access_layers: canonicalLayers,
      },
    }, 200);
  } catch (error) {
    const code = String(error?.code || "DRIVE_BOOTSTRAP_FAILED");
    const status = code === "MEMBER_EMAIL_AMBIGUOUS" || code === "LINE_ID_CONFLICT" ? 409 : 503;
    console.warn({ event: "member_drive_bootstrap_failure", failure_class: code.toLowerCase() });
    return json({ ok: false, error: { code, message: "Drive-verified member mapping could not be materialized safely." } }, status);
  }
}

async function upsertMemberMapping(env, { lineUserId, email, displayName, packageCode }) {
  const emailField = String(env.AIRTABLE_MEMBERS_EMAIL_FIELD || "Contact Email");
  const lineField = String(env.AIRTABLE_MEMBERS_LINE_USER_ID_FIELD || "line_id");
  const matches = await airtableList(env, MEMBER_TABLE, {
    filterByFormula: `LOWER({${emailField}})=${formulaString(email)}`,
    maxRecords: 2,
  });
  if (matches.length > 1) throw coded("MEMBER_EMAIL_AMBIGUOUS");

  const tierLabel = packageCode === PREMIUM ? "Premium" : "Standard";
  if (matches.length === 1) {
    const record = matches[0];
    const fields = record.fields || {};
    const existingLine = String(fields[lineField] || fields.line_id || fields.line_user_id || "").trim();
    if (existingLine && existingLine !== lineUserId) throw coded("LINE_ID_CONFLICT");
    const updates = {
      [lineField]: lineUserId,
      [emailField]: email,
      "Membership Tier": tierLabel,
      "Membership Status": "Active",
      "Verification Status": "Verified",
    };
    if (!String(fields["Full Name"] || "").trim() && displayName) updates["Full Name"] = displayName;
    await airtableUpdate(env, MEMBER_TABLE, record.id, updates);
    return { recordId: record.id };
  }

  const memberId = `mmd_drive_${(await sha256Hex(email)).slice(0, 16)}`;
  const fields = {
    "Full Name": displayName || "สมาชิก MMD",
    [emailField]: email,
    email,
    [lineField]: lineUserId,
    member_id: memberId,
    "Membership Tier": tierLabel,
    "Membership Status": "Active",
    "Verification Status": "Verified",
  };
  const record = await airtableCreate(env, MEMBER_TABLE, fields);
  return { recordId: record.id };
}

async function syncCurrentPackage(env, { email, packageCode, driveFolderId }) {
  const records = await airtableList(env, PACKAGE_TABLE, {
    filterByFormula: `AND(LOWER({member_email})=${formulaString(email)},{status}=${formulaString("active")})`,
    maxRecords: 50,
  });
  const marker = `${DRIVE_MARKER}:${driveFolderId}`;
  const matching = records.find((record) => {
    const fields = record.fields || {};
    return normalizePackage(fields.package_code) === packageCode && String(fields.note || "").includes(marker);
  });
  if (matching) return;

  const idHash = (await sha256Hex(`${email}:${packageCode}:${driveFolderId}`)).slice(0, 14);
  await airtableCreate(env, PACKAGE_TABLE, {
    Name: `drive-${packageCode}-${idHash}`,
    member_email: email,
    package_code: packageCode,
    status: "active",
    note: `${marker}; source_of_truth=malemodel.bkk@gmail.com`,
  });
}

async function syncEntitlements(env, { memberRecordId, lineUserId, email, packageCode, driveFolderId }) {
  const desiredLayers = packageAccessLayers(packageCode);
  const records = await airtableList(env, ENTITLEMENT_TABLE, {
    filterByFormula: `OR({line_user_id}=${formulaString(lineUserId)},LOWER({member_email})=${formulaString(email)})`,
    maxRecords: 100,
  });

  if (packageCode === STANDARD) {
    for (const record of records) {
      const fields = record.fields || {};
      if (normalizePackage(fields.package_code) === PREMIUM && String(fields.access_status || "").toLowerCase() === "active") {
        await airtableUpdate(env, ENTITLEMENT_TABLE, record.id, {
          access_status: "revoked",
          notes: `${DRIVE_MARKER}:standard_access_no_premium`,
        });
      }
    }
  }

  for (const layer of desiredLayers) {
    const existing = records.find((record) => {
      const fields = record.fields || {};
      return normalizePackage(fields.package_code) === layer && String(fields.access_status || "").toLowerCase() === "active";
    });
    if (existing) continue;
    const entitlementId = `ent_drive_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    await airtableCreate(env, ENTITLEMENT_TABLE, {
      entitlement_id: entitlementId,
      member: [memberRecordId],
      member_email: email,
      line_user_id: lineUserId,
      member_status: layer,
      access_status: "active",
      entitlement_level: layer === PREMIUM ? "premium" : "standard_basic",
      package_code: layer,
      source: "access_sync",
      source_ref: `${DRIVE_MARKER}:${driveFolderId}`,
      notes: layer === PREMIUM
        ? "Premium Package includes Premium Models and Standard Models."
        : "Standard model access from verified Google Drive package permission.",
    });
  }
}

function authorizedInternalRequest(request, env) {
  const expected = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");
  const actual = String(request.headers.get(SECRET_HEADER) || "");
  return expected.length >= 32 && actual === expected;
}

async function airtableList(env, tableName, { filterByFormula = "", maxRecords = 100 } = {}) {
  const params = new URLSearchParams();
  if (filterByFormula) params.set("filterByFormula", filterByFormula);
  params.set("maxRecords", String(maxRecords));
  const payload = await airtableRequest(env, "GET", tableName, `?${params.toString()}`);
  return Array.isArray(payload.records) ? payload.records : [];
}

async function airtableCreate(env, tableName, fields) {
  const payload = await airtableRequest(env, "POST", tableName, "", { records: [{ fields }], typecast: false });
  const record = Array.isArray(payload.records) ? payload.records[0] : null;
  if (!record?.id) throw coded("AIRTABLE_WRITE_FAILED");
  return record;
}

async function airtableUpdate(env, tableName, recordId, fields) {
  await airtableRequest(env, "PATCH", tableName, "", { records: [{ id: recordId, fields }], typecast: false });
}

async function airtableRequest(env, method, tableName, suffix = "", body = null) {
  const baseId = String(env.AIRTABLE_BASE_ID || "").trim();
  const apiKey = String(env.AIRTABLE_API_KEY || "").trim();
  if (!baseId || !apiKey) throw coded("AIRTABLE_NOT_CONFIGURED");
  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}${suffix}`;
  const headers = new Headers({ authorization: `Bearer ${apiKey}`, accept: "application/json" });
  const init = { method, headers };
  if (body) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  const fetcher = env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch.bind(env.AIRTABLE_HTTP) : fetch;
  const response = await fetcher(new Request(url, init));
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") throw coded(`AIRTABLE_${response.status || "FAILED"}`);
  return payload;
}

function formulaString(value) {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizePackage(value) {
  const code = String(value || "").trim().toLowerCase();
  return code === PREMIUM || code === STANDARD ? code : "";
}

function safeFolderId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{10,120}$/.test(id) ? id : "";
}

function safeText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function notFound() {
  return json({ ok: false, error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
