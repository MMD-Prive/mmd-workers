// Shared with Create Job and customer Booking. Pure classification only; grants no access.
export function normalizePrivateWork(value) {
  const v = normalizeToken(value);
  if (v === "vip" || v.includes("vip")) return "vip";
  if (v === "pn" || v === "np" || /(^|\s)(?:pn|np)($|\s)/.test(v)) return "pn";
  return "";
}

export function derivePrivateServiceLevel(fields = {}, { allowPathFallback = false } = {}) {
  const canonicalRaw = first(fields, ["private_service_level", "Private Service Level"]);
  const canonical = normalizeToken(canonicalRaw);
  if (canonical) {
    if (canonical === "none") return { level: "none", source: "private_service_level" };
    if (canonical.includes("vip")) return { level: "vip", source: "private_service_level" };
    if (canonical === "pn" || canonical.startsWith("pn ")) return { level: "pn", source: "private_service_level" };
  }

  const formatRaw = first(fields, ["private_work_format", "Private Work Format", "work_format", "Work Format"]);
  const format = normalizeToken(formatRaw);
  if (format) {
    if (format.includes("vip")) return { level: "vip", source: "private_work_format" };
    if (format === "pn" || format.startsWith("pn ")) return { level: "pn", source: "private_work_format" };
  }

  const pnAbility = normalizeToken(first(fields, ["pn_ability", "PN Ability", "pn_compatible", "PN Compatible", "can_pn"]));
  if (["yes", "true", "1", "approved", "allowed"].includes(pnAbility)) {
    return { level: "pn", source: "pn_ability" };
  }

  if (allowPathFallback) {
    const path = normalizeToken(first(fields, ["source_folder", "folder_path", "drive_path", "legacy_folder", "folder_scope_key"]));
    if (path) {
      if (path.includes("exclusive vip") || path.includes("vip models") || path.includes(" vip ") || path.startsWith("vip ")) {
        return { level: "vip", source: "source_folder_migration_fallback" };
      }
      if (path.includes("exclusive pn") || path.includes("pn models") || path.includes(" pn ") || path.startsWith("pn ")) {
        return { level: "pn", source: "source_folder_migration_fallback" };
      }
    }
  }

  return { level: "", source: "unclassified" };
}

export function privateWorkCapabilities(level) {
  const v = normalizePrivateWork(level);
  if (v === "vip") return ["vip", "pn"];
  if (v === "pn") return ["pn"];
  return [];
}

export function privateWorkAllowed(level, requestedWork) {
  const requested = normalizePrivateWork(requestedWork);
  const normalizedLevel = normalizePrivateWork(level);
  if (!requested) return true;
  if (requested === "vip") return normalizedLevel === "vip";
  if (requested === "pn") return normalizedLevel === "vip" || normalizedLevel === "pn";
  return false;
}

function first(fields, keys) {
  for (const key of keys) {
    if (!fields || !Object.prototype.hasOwnProperty.call(fields, key)) continue;
    const value = scalar(fields[key]);
    if (value) return value;
  }
  return "";
}

function scalar(value) {
  if (Array.isArray(value)) return value.length ? scalar(value[0]) : "";
  if (value && typeof value === "object") return clean(value.name ?? value.value ?? value.label ?? value.id ?? "");
  if (value === true) return "true";
  if (value === false) return "false";
  return clean(value);
}

function normalizeToken(value) {
  return clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[_/\\|:+-]+/g, " ").replace(/\s+/g, " ").trim();
}


function clean(value) { return String(value ?? "").trim(); }
