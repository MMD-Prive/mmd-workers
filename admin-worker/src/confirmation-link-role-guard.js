const ROUTES = Object.freeze({
  customer: "/sigil/confirm/job-confirmation",
  model: "/sigil/confirm/job-model",
});

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function decodeTokenPayload(token) {
  const encoded = clean(token).split(".")[0] || "";
  if (!encoded || encoded.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;

  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/")
      + "=".repeat((4 - (encoded.length % 4)) % 4);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

export function confirmationTokenRoleHint(token) {
  const payload = decodeTokenPayload(token);
  const explicitRole = clean(payload?.role).toLowerCase();
  if (explicitRole === "customer" || explicitRole === "model") return explicitRole;
  if (payload?.kind === "customer_confirm") return "customer";
  if (payload?.kind === "model_confirm") return "model";
  return "";
}

export function assertConfirmationUrlRole(value, expectedRole) {
  const role = clean(expectedRole).toLowerCase();
  if (!ROUTES[role]) throw new Error("confirmation_url_expected_role_invalid");

  let url;
  try {
    url = new URL(clean(value), "https://mmdbkk.com");
  } catch (_) {
    throw new Error(`confirmation_url_invalid:${role}`);
  }

  if (url.pathname.replace(/\/+$/, "") !== ROUTES[role]) {
    throw new Error(`confirmation_url_path_mismatch:${role}`);
  }

  const token = clean(url.searchParams.get("t"));
  if (!token) throw new Error(`confirmation_url_token_missing:${role}`);

  const hintedRole = confirmationTokenRoleHint(token);
  if (hintedRole !== role) {
    throw new Error(`confirmation_url_role_mismatch:${role}:${hintedRole || "unknown"}`);
  }
  return true;
}

export function assertConfirmationUrlPair(customerUrl, modelUrl) {
  assertConfirmationUrlRole(customerUrl, "customer");
  assertConfirmationUrlRole(modelUrl, "model");
  return true;
}
