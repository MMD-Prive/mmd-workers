import baseWorker from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const SLIP_EVIDENCE_PATH = "/v1/pay/slip/evidence";

const PAYMENT_STATUS_PENDING = "Pending";
const VERIFICATION_STATUS_PENDING_REVIEW = "pending_review";
const INTENT_STATUS_PENDING_CONFIRMATION = "Pending Confirmation";
const SOURCE_WEB_PAY = "web_pay";

function toStr(value) {
  return value == null ? "" : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== ""));
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .replace(/^\"+|\"+$/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCorsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = getAllowedOrigins(env);
  const headers = new Headers();

  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Internal-Token, X-Confirm-Key");
  headers.set("Access-Control-Max-Age", "86400");
 