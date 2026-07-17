import baseWorker from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const SLIP_EVIDENCE_PATH = "/v1/pay/slip/evidence";

function toStr(value) {
  return value == null ? "" : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function esc(value) {
  return String(value || "")
    .replace