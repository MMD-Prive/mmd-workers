import admin from "./admin-worker/src/admin-login-hero-worker.js";
import { readCredentialBoundAdminActor } from "./admin-worker/src/credential-bound-admin-session.js";
import { handleCreateJobWorkerPage } from "./admin-worker/src/create-job-worker-page.js";
import { handleMoneyControlWorkerHome } from "./admin-worker/src/money-control-worker-home.js";
import { lookupPerRenameFirst } from "./admin-worker/src/per-rename-client-search.js";
import { allowAdminConsoleFrame } from "./webflow/global/admin-console-views.mjs";

const origin = "https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev";
const clientId = "recFixtureClient001";
const modelId = "recFixtureModel001";
const drive = "/v1/admin/booking-models/" + modelId + "/drive";
const numbers = [1, 2, 3, 4, 5, 6];
const memberPhotos = numbers.map(n => "/fixture-photo/member/" + n);
const modelFiles = numbers.map(n => ({ kind: "photo", file_id: "fixture_model_" + n, created_time: "2026-11-0" + n }));

export function readFixture(input) {
  const url = new URL(input);
  if (url.origin === "https://api.airtable.com" && url.pathname === "/v0/fixture/index") {
    return Response.json({ records: [{ id: "recFixtureRename001", fields: {
      identity_key: "line_ofc_per_rename:fixture", source_type: "line_ofc_staging",
      resolution_status: "linked", session_lookup_status: "canonical_ready",
      preferred_name: "Fixture Per Rename", line_user_id: "U" + "1".repeat(32), linked_client: [clientId],
    } }] });
  }
  if (url.origin === "https://api.airtable.com" && url.pathname === "/v0/fixture/clients/" + clientId) {
    return Response.json({ id: clientId, fields: { "Client Name": "Fixture Canonical Client" } });
  }
  return new Response(null, { status: 404 });
}

function protect(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, private");
  headers.set("X-Robots-Tag", "noindex");
  headers.set("X-MMD-Staging-Source", "217a23730c4c70a7f2cb68e550bf7a74227ae424");
  headers.append("Content-Security-Policy", "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; form-action 'self'; base-uri 'none'");
  return new Response(response.body, { status: response.status, headers });
}

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (url.origin !== origin) return new Response(null, { status: 421 });
  if (!env.ADMIN_LOGIN_CREDENTIAL || !env.ADMIN_SESSION_SECRET) return new Response(null, { status: 503 });
  const auth = { ADMIN_LOGIN_CREDENTIAL: env.ADMIN_LOGIN_CREDENTIAL, ADMIN_SESSION_SECRET: env.ADMIN_SESSION_SECRET, ALLOWED_ORIGINS: origin };
  if (method === "GET" && ["/internal/admin/login", "/internal/admin/console"].includes(path)) {
    return admin.fetch(request, auth, ctx);
  }
  if (method === "POST" && path === "/internal/admin/login/session") {
    const input = await request.clone().formData().catch(() => null);
    if (request.headers.get("Origin") !== origin || input?.get("action") !== "owner_login"
      || typeof input.get("credential") !== "string") return new Response(null, { status: 403 });
    return admin.fetch(request, auth, ctx);
  }
  const actor = await readCredentialBoundAdminActor(request, auth);
  if (actor?.role !== "owner") return new Response(null, { status: 403 });

  if (method === "POST" && path === "/v1/admin/clients/lineage-lookup") {
    const result = await lookupPerRenameFirst(request, {
      AIRTABLE_API_KEY: "fixture", AIRTABLE_BASE_ID: "fixture",
      AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID: "index", AIRTABLE_TABLE_CLIENTS_ID: "clients",
    });
    const body = await result.json();
    for (const key of ["records", "results", "items"]) {
      if (Array.isArray(body[key])) body[key] = body[key].map(row => ({ ...row, profile_photos: memberPhotos }));
    }
    return Response.json(body, { status: result.status, headers: result.headers });
  }
  if (method !== "GET") return new Response(null, { status: 405 });
  if (path === "/internal/admin/jobs/create-job") return allowAdminConsoleFrame(request, handleCreateJobWorkerPage(request));
  if (path === "/internal/admin/payments") return allowAdminConsoleFrame(request, handleMoneyControlWorkerHome(request));
  if (path === "/v1/admin/payments/review-queue") return Response.json({ ok: true, items: [] });
  if (path === "/v1/admin/dashboard") return Response.json({
    ok: true, source: "admin-worker", layer: "core", view: "jobs", generated_at: new Date().toISOString(),
    filters: { q: null, job_date: url.searchParams.get("date"), session_id: null, job_id: null, client_id: null },
    counts: { all: 0, filtered: 0, today: 0, upcoming: 0, past: 0, undated: 0 },
    pagination: { page: 1, page_size: 20, total: 0, total_pages: 1, has_prev: false, has_next: false }, jobs: [],
  });
  if (path === "/v1/admin/models/search") {
    const p = url.searchParams;
    const privateMatch = p.get("booking_visibility") === "private" && p.get("private_work") === "pn"
      && p.get("work_type") === "pn" && p.get("selected_access_folder") === "standard"
      && p.get("customer_lane") === "gay" && p.get("selected_orientation") === "gay";
    const publicMatch = p.get("booking_visibility") === "public" && p.get("work_type") === "event"
      && p.get("selected_access_folder") === "travel" && !p.has("private_work") && !p.has("customer_lane");
    const matched = p.get("client_id") === clientId && p.get("q") === "Fixture Model" && (privateMatch || publicMatch);
    return Response.json({ ok: true, items: matched ? [{ model_id: modelId, display_name: "Fixture Model" }] : [] });
  }
  if (path === drive) return Response.json({ ok: true, items: modelFiles });
  if (memberPhotos.includes(path) || modelFiles.some(file => path === drive + "/" + file.file_id)) {
    const color = ["red", "green", "blue", "gold", "purple", "gray"][Number(path.at(-1)) - 1];
    return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="' + color + '"/></svg>',
      { headers: { "Content-Type": "image/svg+xml" } });
  }
  return new Response(null, { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    return protect(await route(request, env, ctx));
  },
};
