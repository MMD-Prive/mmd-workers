import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cardsRoot = path.join(here, "cards");
const manifest = JSON.parse(fs.readFileSync(path.join(here, "manifest.json"), "utf8"));
const routes = JSON.parse(fs.readFileSync(path.join(here, "routes.json"), "utf8"));
const schema = JSON.parse(fs.readFileSync(path.join(here, "schema.json"), "utf8"));
const safeRoutes = new Set(Object.keys(routes.public_and_member_safe_routes || {}));
const allowedLanes = new Set(schema.properties?.lane?.enum || []);
const allowedOwners = new Set(["Boss Per", "Ewvon", "Chang"]);
const allowedStatuses = new Set(["draft", "review", "published", "archived"]);
const forbiddenPatterns = [
  /authorization:\s*bearer/i,
  /x-confirm-key/i,
  /api[_-]?key/i,
  /client_secret/i,
  /line_user_id/i,
  /telegram_id/i,
  /memberstack_id/i,
  /airtable record/i,
  /mark\s*paid/i,
  /unlock(?:ed)?\s*membership/i
];

if (manifest.source_of_truth !== "git") fail(path.join(here, "manifest.json"), "source_of_truth must be git");
if (manifest.review_gate !== "pull_request") fail(path.join(here, "manifest.json"), "review_gate must be pull_request");
if (manifest.final_reviewer !== "Boss Per") fail(path.join(here, "manifest.json"), "final_reviewer must be Boss Per");
if (!['draft', 'published', 'archived'].includes(manifest.status)) {
  fail(path.join(here, "manifest.json"), `invalid manifest status ${manifest.status}`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".json") ? [full] : [];
  });
}

function fail(file, message) {
  console.error(`FAIL ${path.relative(here, file)}: ${message}`);
  process.exitCode = 1;
}

for (const file of walk(cardsRoot)) {
  let card;
  try {
    card = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(file, `invalid JSON: ${error.message}`);
    continue;
  }

  const required = [
    "id", "version", "status", "lane", "audience", "language", "title",
    "questions", "safe_answer", "allowed_actions", "forbidden_actions",
    "escalate_when", "safe_routes", "owner", "final_reviewer"
  ];

  for (const key of required) {
    if (card[key] === undefined || card[key] === null || card[key] === "") {
      fail(file, `missing required field ${key}`);
    }
  }

  if (!/^[a-z0-9][a-z0-9-]+$/.test(card.id || "")) fail(file, "invalid id");
  if (!Number.isInteger(card.version) || card.version < 1) fail(file, "version must be a positive integer");
  if (!allowedStatuses.has(card.status)) fail(file, `invalid status ${card.status}`);
  if (!allowedLanes.has(card.lane)) fail(file, `invalid lane ${card.lane}`);
  if (!allowedOwners.has(card.owner)) fail(file, `invalid owner ${card.owner}`);
  if (card.final_reviewer !== "Boss Per") fail(file, "final_reviewer must be Boss Per");

  for (const route of card.safe_routes || []) {
    if (!safeRoutes.has(route)) fail(file, `unsafe or unknown route ${route}`);
  }

  const text = JSON.stringify(card);
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) fail(file, `forbidden content matched ${pattern}`);
  }

  if (!Array.isArray(card.forbidden_actions) || card.forbidden_actions.length === 0) {
    fail(file, "forbidden_actions must not be empty");
  }

  if (!Array.isArray(card.escalate_when) || card.escalate_when.length === 0) {
    fail(file, "escalate_when must not be empty");
  }

  console.log(`OK   ${path.relative(here, file)}`);
}

if (manifest.status === "published") {
  for (const file of walk(cardsRoot)) {
    const card = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!['published', 'archived'].includes(card.status)) {
      fail(file, `manifest is published but card status is ${card.status}`);
    }
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Kenji knowledge validation passed.");
