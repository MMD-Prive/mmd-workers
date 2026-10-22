// Deliberately not imported by any runtime entrypoint. All I/O is injected.
const CONTEXT = ["account_id", "namespace_id", "worker_name", "binding_name", "class_name", "store_name"];
const HEX32 = /^[a-f0-9]{32}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const MAX_BYTES = 1024 * 1024;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const only = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key));

function target(input) {
  const value = Object.fromEntries(CONTEXT.map((key) => [key, input?.[key]]));
  check(typeof value.account_id === "string" && typeof value.namespace_id === "string" &&
    HEX32.test(value.account_id) && HEX32.test(value.namespace_id) &&
    value.worker_name === "admin-worker" && value.binding_name === "MODEL_ACTIVATION_COORDINATOR" &&
    value.class_name === "ModelActivationCoordinator" && value.store_name === "line-job-briefs-v1", "inventory_baseline_invalid");
  return Object.freeze(value);
}

async function boundedJson(response) {
  check(response.body?.getReader, "inventory_body_invalid");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) {
        await reader.cancel();
        throw new Error("inventory_body_too_large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createLineBriefInventoryTransport({ baseline, token, request, timeoutMs = 5000 } = {}) {
  const fixed = target(baseline);
  check(typeof token === "string" && token.length > 0 && token.length <= 4096 && !/\s/.test(token), "inventory_credential_unavailable");
  check(typeof request === "function" && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 10000, "inventory_transport_invalid");
  const root = `/client/v4/accounts/${fixed.account_id}/workers`;
  return async (resource, options = {}) => {
    check(only(options, resource === "objects" ? ["cursor"] : resource === "namespaces" ? ["page"] : []), "inventory_request_invalid");
    check(["settings", "namespaces", "objects"].includes(resource), "inventory_resource_forbidden");
    const url = new URL("https://api.cloudflare.com");
    if (resource === "settings") url.pathname = `${root}/scripts/admin-worker/settings`;
    if (resource === "namespaces") {
      const page = options.page ?? 1;
      check(Number.isInteger(page) && page >= 1 && page <= MAX_PAGES, "inventory_page_invalid");
      url.pathname = `${root}/durable_objects/namespaces`;
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", String(PAGE_SIZE));
    }
    if (resource === "objects") {
      url.pathname = `${root}/durable_objects/namespaces/${fixed.namespace_id}/objects`;
      url.searchParams.set("limit", String(PAGE_SIZE));
      if (options.cursor !== undefined) {
        check(typeof options.cursor === "string" && /^[A-Za-z0-9_-]{1,4096}$/.test(options.cursor), "inventory_cursor_invalid");
        url.searchParams.set("cursor", options.cursor);
      }
    }
    const controller = new AbortController();
    let timer;
    const expiry = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("inventory_timeout")); }, timeoutMs);
    });
    try {
      const read = async () => {
        const response = await request(url.href, { method: "GET", redirect: "error", signal: controller.signal,
          headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
        check(response.ok === true && response.status === 200 && !response.redirected &&
          (!response.url || response.url === url.href), "inventory_http_failure");
        const correlation = response.headers.get("cf-ray");
        check(typeof correlation === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(correlation), "inventory_correlation_missing");
        const data = await boundedJson(response);
        check(data?.success === true && (!data.errors || (Array.isArray(data.errors) && data.errors.length === 0)), "inventory_api_failure");
        let result;
        if (resource === "settings") {
          check(Array.isArray(data.result?.bindings), "inventory_settings_invalid");
          // Strip values and unrelated bindings before returning to the provider.
          result = { bindings: data.result.bindings.filter((binding) => binding?.name === fixed.binding_name).map((binding) => ({
            name: binding.name, type: binding.type, class_name: binding.class_name,
            namespace_id: binding.namespace_id, script_name: binding.script_name,
          })) };
        } else {
          check(Array.isArray(data.result) && data.result.length <= PAGE_SIZE, "inventory_result_invalid");
          result = data.result.map((row) => resource === "objects"
            ? { id: row?.id, hasStoredData: row?.hasStoredData }
            : { id: row?.id, class: row?.class, script: row?.script, use_sqlite: row?.use_sqlite });
        }
        const info = data.result_info;
        return { result, result_info: info && {
          count: info.count, page: info.page, per_page: info.per_page,
          total_pages: info.total_pages, total_count: info.total_count,
          ...(Object.hasOwn(info, "cursor") ? { cursor: info.cursor } : {}),
        }, correlation_id: correlation, observed_at: new Date().toISOString() };
      };
      return await Promise.race([read(), expiry]);
    } catch { throw new Error("inventory_transport_failed"); }
    finally { clearTimeout(timer); }
  };
}

export function createLineBriefInventoryProvider({ baseline, get } = {}) {
  const fixed = target(baseline);
  check(typeof get === "function", "inventory_transport_unavailable");
  return async (expected) => {
    const requested = Object.fromEntries([...CONTEXT, "object_id"].map((key) => [key, expected?.[key]]));
    const receipts = [];
    const started = Date.now();
    const read = async (resource, options) => {
      check(Date.now() >= started && Date.now() - started < 60000, "inventory_evidence_expired");
      const response = await get(resource, options);
      const observed = Date.parse(response?.observed_at);
      const age = Date.now() - observed;
      check(observed >= started && Number.isFinite(age) && age >= 0 && age < 60000 && /^[A-Za-z0-9_-]{1,120}$/.test(response?.correlation_id || ""), "inventory_receipt_invalid");
      receipts.push({ resource, correlation_id: response.correlation_id, observed_at: response.observed_at });
      return response;
    };
    const verifyBinding = async () => {
      const settings = await read("settings");
      const bindings = settings.result?.bindings?.filter((binding) => binding?.name === fixed.binding_name);
      check(bindings?.length === 1, "inventory_binding_ambiguous");
      const binding = bindings[0];
      check(binding.type === "durable_object_namespace" && binding.namespace_id === fixed.namespace_id &&
        binding.class_name === fixed.class_name && (!binding.script_name || binding.script_name === fixed.worker_name), "inventory_binding_changed");
    };
    try {
      check(CONTEXT.every((key) => requested[key] === fixed[key]) && typeof requested.object_id === "string" && HEX64.test(requested.object_id), "inventory_target_mismatch");
      await verifyBinding();
      let pages, total, count = 0, foundNamespace = false;
      const namespaceIds = new Set();
      for (let page = 1; page <= MAX_PAGES; page++) {
        const response = await read("namespaces", { page });
        const rows = response.result, info = response.result_info;
        check(Array.isArray(rows) && rows.length <= PAGE_SIZE && info?.page === page && info.per_page === PAGE_SIZE && info.count === rows.length &&
          Number.isSafeInteger(info.total_count) && info.total_count >= 0, "inventory_pagination_incomplete");
        // Cloudflare may omit total_pages. Derive it only from the required,
        // validated total_count/per_page, and reject a conflicting supplied value.
        const derivedPages = Math.max(1, Math.ceil(info.total_count / PAGE_SIZE));
        check(derivedPages <= MAX_PAGES && (info.total_pages === undefined || info.total_pages === derivedPages), "inventory_pagination_incomplete");
        pages ??= derivedPages; total ??= info.total_count;
        check(pages === derivedPages && total === info.total_count &&
          rows.length === Math.min(PAGE_SIZE, Math.max(0, total - (page - 1) * PAGE_SIZE)), "inventory_pagination_changed");
        for (const row of rows) {
          check(HEX32.test(row?.id || "") && !namespaceIds.has(row.id), "inventory_namespace_invalid");
          namespaceIds.add(row.id);
          if (row.id === fixed.namespace_id) {
            check(row.class === fixed.class_name && row.script === fixed.worker_name && row.use_sqlite === true, "inventory_namespace_changed");
            foundNamespace = true;
          }
        }
        count += rows.length;
        if (page === pages) break;
      }
      check(count === total && foundNamespace, "inventory_namespace_not_verified");
      let cursor, complete = false, foundObject = false;
      const cursors = new Set(), objectIds = new Set();
      for (let page = 1; page <= MAX_PAGES; page++) {
        const response = await read("objects", cursor === undefined ? {} : { cursor });
        const rows = response.result, info = response.result_info;
        check(Array.isArray(rows) && rows.length <= PAGE_SIZE && info?.count === rows.length && Object.hasOwn(info, "cursor"), "inventory_pagination_incomplete");
        for (const row of rows) {
          check(HEX64.test(row?.id || "") && typeof row.hasStoredData === "boolean" && !objectIds.has(row.id), "inventory_object_invalid");
          objectIds.add(row.id);
          if (row.id === requested.object_id) foundObject = true;
        }
        if (info.cursor === null || info.cursor === "") { complete = true; break; }
        check(typeof info.cursor === "string" && /^[A-Za-z0-9_-]{1,4096}$/.test(info.cursor) && !cursors.has(info.cursor), "inventory_cursor_invalid");
        cursors.add(info.cursor); cursor = info.cursor;
      }
      check(complete && foundObject, "inventory_object_not_verified");
      await verifyBinding();
      check(Date.now() >= started && Date.now() - started < 60000, "inventory_evidence_expired");
      return { ok: true, ...fixed, source: "cloudflare_existing_objects", object_id: requested.object_id,
        observed_at: new Date(started).toISOString(), evidence_id: receipts.at(-1).correlation_id,
        inventory_complete: true, receipts };
    } catch { return { ok: false, error: "inventory_verification_unavailable", pending_status: "unknown" }; }
  };
}
