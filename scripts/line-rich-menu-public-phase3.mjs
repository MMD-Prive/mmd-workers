import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const CONFIG_PATH = path.join(SCRIPT_DIR, "line-rich-menu-public-phase3.json");
const LINE_API_BASE = "https://api.line.me/v2/bot";
const LINE_DATA_API_BASE = "https://api-data.line.me/v2/bot";
const FORBIDDEN_ROUTE_PATTERNS = [
  /\/default(?:[/?#]|$)/i,
  /\/autodirect(?:[/?#]|$)/i,
  /\/member\/mermbership(?:[/?#]|$)/i,
  /\/pay\/membership(?:[/?#]|$)/i,
  /\/login(?:[/?#]|$)/i,
  /\/admin(?:[/?#]|$)/i,
  /\/internal(?:[/?#]|$)/i,
  /token=/i,
  /key=/i,
  /secret=/i,
  /admin=/i,
  /private=/i,
];

function usage() {
  return [
    "Usage:",
    "  node scripts/line-rich-menu-public-phase3.mjs --dry-run",
    "  APPLY=1 node scripts/line-rich-menu-public-phase3.mjs --apply",
    "  ROLLBACK=1 node scripts/line-rich-menu-public-phase3.mjs --rollback [richmenu-id]",
    "",
    "Environment:",
    "  LINE_CHANNEL_ACCESS_TOKEN is required only for --apply or --rollback.",
  ].join("\n");
}

function parseMode(argv) {
  const modes = argv.filter((arg) => ["--dry-run", "--apply", "--rollback"].includes(arg));
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }
  if (modes.length > 1) throw new Error("Choose only one mode.");
  return modes[0] || "--dry-run";
}

function parseRollbackTarget(argv, config) {
  const index = argv.indexOf("--rollback");
  if (index === -1) return config.rollbackRichMenuId;
  const candidate = argv[index + 1];
  if (!candidate || candidate.startsWith("--")) return config.rollbackRichMenuId;
  if (!/^richmenu-[a-z0-9]+$/i.test(candidate)) throw new Error("Rollback target must look like a LINE rich menu ID.");
  return candidate;
}

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function resolveImagePath(config) {
  return path.resolve(REPO_ROOT, config.imagePath);
}

function readImageInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24) throw new Error("Image file is too small.");

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return {
      type: "image/png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      bytes: buffer.length,
    };
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      const length = buffer.readUInt16BE(offset);
      if (length < 2) throw new Error("Invalid JPEG segment length.");
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        return {
          type: "image/jpeg",
          width: buffer.readUInt16BE(offset + 5),
          height: buffer.readUInt16BE(offset + 3),
          bytes: buffer.length,
        };
      }
      offset += length;
    }
  }

  throw new Error("Unsupported image type. Use JPEG or PNG.");
}

function toRichMenuPayload(config) {
  return {
    size: config.size,
    selected: config.selected,
    name: config.name,
    chatBarText: config.chatBarText,
    areas: config.areas,
  };
}

function ensureSafeActions(config) {
  const errors = [];
  config.areas.forEach((area, index) => {
    const label = `button_${index + 1}`;
    if (area.action.type === "uri") {
      const uri = area.action.uri || "";
      const pathname = new URL(uri).pathname;
      if (uri.startsWith("https://miniapp.line.me/")) errors.push(`${label}: LINE Mini App URL is forbidden in Phase 3.`);
      if (pathname === "/member/dashboard") errors.push(`${label}: /member/dashboard is forbidden for Phase 3.`);
      if (FORBIDDEN_ROUTE_PATTERNS.some((pattern) => pattern.test(uri))) errors.push(`${label}: forbidden route or identifier in URI.`);
      if (!uri.startsWith("https://mmdbkk.com/")) errors.push(`${label}: URI must stay on https://mmdbkk.com.`);
    } else if (area.action.type === "message") {
      if (!["Hi Per", "Hi MMD"].includes(area.action.text)) errors.push(`${label}: unsupported message text.`);
    } else {
      errors.push(`${label}: unsupported action type ${area.action.type}.`);
    }
  });
  if (config.areas.length !== 6) errors.push("Expected exactly 6 rich menu areas.");
  return errors;
}

async function lineFetch(pathname, token, init = {}) {
  const response = await fetch(`${LINE_API_BASE}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function getCurrentDefault(token) {
  if (!token) return null;
  const { response, body } = await lineFetch("/user/all/richmenu", token);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      richMenuId: null,
      error: body?.message || body?.error || "line_default_lookup_failed",
    };
  }
  return { ok: true, status: response.status, richMenuId: body?.richMenuId || null };
}

function routeVerdict(url, status, finalUrl, error) {
  if (error) return { ok: false, reason: error };
  if (new URL(finalUrl).pathname === "/member/dashboard") {
    return { ok: false, reason: "forbidden_member_dashboard_route" };
  }
  if (FORBIDDEN_ROUTE_PATTERNS.some((pattern) => pattern.test(finalUrl))) {
    return { ok: false, reason: "forbidden_final_route" };
  }
  if (status >= 200 && status < 300) return { ok: true, reason: "valid_2xx" };
  return { ok: false, reason: `unexpected_status_${status}` };
}

async function requestWithRedirects(startUrl, method) {
  let url = startUrl;
  const hops = [];
  for (let i = 0; i < 6; i += 1) {
    const response = await fetch(url, { method, redirect: "manual" });
    const location = response.headers.get("location");
    hops.push({ status: response.status, url });
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      url = new URL(location, url).toString();
      continue;
    }
    return { status: response.status, finalUrl: url, hops };
  }
  return { status: 0, finalUrl: url, hops, error: "too_many_redirects" };
}

async function checkRoute(url) {
  try {
    let result = await requestWithRedirects(url, "HEAD");
    if ([405, 403].includes(result.status)) {
      result = await requestWithRedirects(url, "GET");
    }
    return { url, ...result, ...routeVerdict(url, result.status, result.finalUrl, result.error) };
  } catch (error) {
    return { url, ok: false, status: 0, finalUrl: url, hops: [], reason: error.message };
  }
}

async function checkRoutes(config) {
  const urls = config.areas
    .map((area) => area.action)
    .filter((action) => action.type === "uri")
    .map((action) => action.uri);
  return Promise.all(urls.map((url) => checkRoute(url)));
}

async function createRichMenu(config, token) {
  const { response, body } = await lineFetch("/richmenu", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toRichMenuPayload(config)),
  });
  if (!response.ok || !body?.richMenuId) {
    throw new Error(`Create rich menu failed with HTTP ${response.status}: ${body?.message || body?.error || "unknown_error"}`);
  }
  return body.richMenuId;
}

async function uploadRichMenuImage(richMenuId, token, imagePath, imageInfo) {
  const response = await fetch(`${LINE_DATA_API_BASE}/richmenu/${encodeURIComponent(richMenuId)}/content`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": imageInfo.type,
    },
    body: fs.readFileSync(imagePath),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = JSON.parse(text)?.message || message;
    } catch {
      // Keep LINE's short error text when it is not JSON.
    }
    throw new Error(`Upload rich menu image failed with HTTP ${response.status}: ${message}`);
  }
}

async function setDefaultRichMenu(richMenuId, token) {
  const { response, body } = await lineFetch(`/user/all/richmenu/${encodeURIComponent(richMenuId)}`, token, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Set default failed with HTTP ${response.status}: ${body?.message || body?.error || "unknown_error"}`);
  }
}

function printReadiness({ config, imagePath, imageInfo, currentDefault, routeResults, actionErrors, mode }) {
  const currentDefaultId = currentDefault?.richMenuId || config.expectedCurrentDefaultRichMenuId;
  const currentDefaultSource = currentDefault?.richMenuId ? "LINE API read-only" : "configured fallback";
  const imageMatches = imageInfo.width === config.size.width && imageInfo.height === config.size.height;
  const routesOk = routeResults.every((result) => result.ok);
  const actionsOk = actionErrors.length === 0;
  const ready = imageMatches && routesOk && actionsOk;

  console.log(JSON.stringify({
    ok: ready,
    mode,
    apply_disabled: mode === "--dry-run",
    current_default_rich_menu_id: currentDefaultId,
    current_default_source: currentDefaultSource,
    rollback_rich_menu_id: config.rollbackRichMenuId,
    image: {
      path: imagePath,
      type: imageInfo.type,
      width: imageInfo.width,
      height: imageInfo.height,
      bytes: imageInfo.bytes,
      matches_expected_dimensions: imageMatches,
    },
    proposed_rich_menu: toRichMenuPayload(config),
    action_validation_errors: actionErrors,
    route_results: routeResults.map((result) => ({
      url: result.url,
      ok: result.ok,
      status: result.status,
      final_url: result.finalUrl,
      reason: result.reason,
      hops: result.hops.map((hop) => ({ status: hop.status, url: hop.url })),
    })),
    verdict: ready ? "PHASE_3_RICH_MENU_READY_FOR_APPROVAL" : "PHASE_3_RICH_MENU_NEEDS_WORK",
  }, null, 2));
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const config = readConfig();
  const rollbackTarget = parseRollbackTarget(process.argv.slice(2), config);
  const imagePath = resolveImagePath(config);
  const imageInfo = readImageInfo(imagePath);
  const actionErrors = ensureSafeActions(config);
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  const currentDefault = await getCurrentDefault(token);
  const routeResults = await checkRoutes(config);

  if (mode === "--dry-run") {
    printReadiness({ config, imagePath, imageInfo, currentDefault, routeResults, actionErrors, mode });
    return;
  }

  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required for this mode.");
  if (mode === "--apply" && process.env.APPLY !== "1") throw new Error("APPLY=1 is required for --apply.");
  if (mode === "--rollback" && process.env.ROLLBACK !== "1") throw new Error("ROLLBACK=1 is required for --rollback.");
  if (actionErrors.length) throw new Error(`Action validation failed: ${actionErrors.join(" ")}`);
  if (imageInfo.width !== config.size.width || imageInfo.height !== config.size.height) {
    throw new Error(`Image dimensions must be ${config.size.width}x${config.size.height}.`);
  }
  const failedRoutes = routeResults.filter((result) => !result.ok);
  if (failedRoutes.length) {
    throw new Error(`Route checks failed: ${failedRoutes.map((result) => `${result.url}=${result.reason}`).join(", ")}`);
  }

  if (mode === "--rollback") {
    await setDefaultRichMenu(rollbackTarget, token);
    const verified = await getCurrentDefault(token);
    console.log(JSON.stringify({
      ok: verified?.richMenuId === rollbackTarget,
      mode,
      rollback_rich_menu_id: rollbackTarget,
      verified_default_rich_menu_id: verified?.richMenuId || null,
      old_rich_menus_deleted: false,
    }, null, 2));
    return;
  }

  const richMenuId = await createRichMenu(config, token);
  await uploadRichMenuImage(richMenuId, token, imagePath, imageInfo);
  await setDefaultRichMenu(richMenuId, token);
  const verified = await getCurrentDefault(token);
  console.log(JSON.stringify({
    ok: verified?.richMenuId === richMenuId,
    mode,
    new_rich_menu_id: richMenuId,
    verified_default_rich_menu_id: verified?.richMenuId || null,
    rollback_rich_menu_id: config.rollbackRichMenuId,
    image_uploaded: true,
    default_set: verified?.richMenuId === richMenuId,
    old_rich_menus_deleted: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
