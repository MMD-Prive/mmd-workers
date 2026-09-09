import { serviceUnavailable } from "../lib/errors.js";

function value(input) {
  return input === undefined || input === null ? "" : String(input).trim();
}

async function fetchCanonicalJson(url, env, body) {
  const endpoint = value(url);
  const token = value(env?.AI_CANONICAL_UPSTREAM_TOKEN);
  if (!endpoint || !token) {
    throw serviceUnavailable("Canonical AI context upstream is not configured");
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-mmd-service-name": "ai-worker",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw serviceUnavailable("Canonical AI context upstream could not be reached");
  }

  if (!response.ok) {
    throw serviceUnavailable(`Canonical AI context upstream returned HTTP ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw serviceUnavailable("Canonical AI context upstream returned invalid JSON");
  }

  if (!payload || payload.ok !== true) {
    throw serviceUnavailable("Canonical AI context upstream did not return an accepted contract");
  }
  return payload.data ?? payload;
}

// Compatibility connector name only. ai-worker no longer treats Airtable as a direct truth source.
export async function searchAirtable(query, scope = [], env = {}) {
  const data = await fetchCanonicalJson(env.AI_SEARCH_UPSTREAM_URL, env, {
    query: value(query),
    scope: Array.isArray(scope) ? scope : [],
  });
  return Array.isArray(data?.results) ? data.results : [];
}

export async function getMemberContext(memberId, env = {}) {
  return fetchCanonicalJson(env.AI_MEMBER_CONTEXT_UPSTREAM_URL, env, {
    member_id: value(memberId),
  });
}
