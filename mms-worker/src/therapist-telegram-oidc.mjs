const TELEGRAM_ORIGIN = "https://oauth.telegram.org";
const PKCE_VALUE = /^[A-Za-z0-9_-]{43}$/;
export const TELEGRAM_ID_FIELD = "Therapist Telegram User ID";

export function therapistTelegramRequired(env) {
  return String(env.MMS_THERAPIST_TELEGRAM_REQUIRED || "").toLowerCase() === "true";
}

export function therapistTelegramId(record) {
  const id = String(record?.fields?.[TELEGRAM_ID_FIELD] ?? "").trim();
  return /^[1-9][0-9]{0,15}$/.test(id) && Number.isSafeInteger(Number(id)) ? id : "";
}

export function telegramConfig(env, error) {
  const clientId = String(env.MMS_THERAPIST_TELEGRAM_CLIENT_ID || "").trim();
  const secret = String(env.MMS_THERAPIST_TELEGRAM_CLIENT_SECRET || "").trim();
  if (!/^\d{1,20}$/.test(clientId) || !/^[\x21-\x7e]+$/.test(secret)) {
    throw error(503, "THERAPIST_TELEGRAM_NOT_CONFIGURED");
  }
  return { clientId, secret };
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
}

export async function startTelegramAuthorization(config, redirectUri) {
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const url = new URL("/auth", TELEGRAM_ORIGIN);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return { state, verifier, authorizationUrl: url.href };
}

async function requestTelegram(path, init, error) {
  try {
    const response = await fetch(new URL(path, TELEGRAM_ORIGIN), {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      if (path === "/token" && [400, 401].includes(response.status)) {
        throw error(401, "THERAPIST_TELEGRAM_INVALID");
      }
      throw error(503, "THERAPIST_TELEGRAM_UNAVAILABLE");
    }
    return await response.json();
  } catch (cause) {
    if (cause.code === "THERAPIST_TELEGRAM_INVALID") throw cause;
    throw error(503, "THERAPIST_TELEGRAM_UNAVAILABLE");
  }
}

export async function verifyTelegramAuthorization({ code, verifier, redirectUri }, config, error) {
  const invalid = () => error(401, "THERAPIST_TELEGRAM_INVALID");
  if (!code || code.length > 2048 || !/^[\x21-\x7e]+$/.test(code) || !PKCE_VALUE.test(verifier)) throw invalid();
  const tokens = await requestTelegram("/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(config.clientId + ":" + config.secret),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      code_verifier: verifier,
    }),
  }, error);
  const jwt = tokens?.id_token;
  if (typeof jwt !== "string" || jwt.length > 12000 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(jwt)) throw invalid();
  const [encodedHeader, encodedClaims, encodedSignature] = jwt.split(".");
  let header, claims;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    header = JSON.parse(decoder.decode(decode(encodedHeader)));
    claims = JSON.parse(decoder.decode(decode(encodedClaims)));
  } catch {
    throw invalid();
  }
  if (header?.alg !== "RS256" || header.crit !== undefined || typeof header.kid !== "string") throw invalid();
  const jwks = await requestTelegram("/.well-known/jwks.json", {}, error);
  const keys = Array.isArray(jwks?.keys) ? jwks.keys.filter(key =>
    key?.kid === header.kid && key.kty === "RSA" && (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig")
  ) : [];
  if (keys.length !== 1) throw invalid();
  try {
    const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const key = await crypto.subtle.importKey("jwk", keys[0], algorithm, false, ["verify"]);
    const signed = new TextEncoder().encode(encodedHeader + "." + encodedClaims);
    if (!await crypto.subtle.verify(algorithm, key, decode(encodedSignature), signed)) throw invalid();
  } catch {
    throw invalid();
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims?.iss !== TELEGRAM_ORIGIN || claims.aud !== config.clientId ||
      typeof claims.sub !== "string" || !claims.sub ||
      !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
      !Number.isSafeInteger(claims.iat) || claims.iat > now + 60 || claims.iat < now - 600 ||
      claims.exp <= claims.iat || !Number.isSafeInteger(claims.id) || claims.id <= 0) {
    throw invalid();
  }
  return String(claims.id);
}
