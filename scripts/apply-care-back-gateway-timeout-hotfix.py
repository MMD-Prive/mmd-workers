from pathlib import Path

source = Path("member-pages-worker/src/liff-gateway-airtable.js")
s = source.read_text()

old = 'const DEFAULT_AIRTABLE_REQUEST_TIMEOUT_MS = 4000;'
new = 'const DEFAULT_AIRTABLE_REQUEST_TIMEOUT_MS = 7000;'
if old not in s:
    raise SystemExit("gateway default timeout changed unexpectedly")
s = s.replace(old, new, 1)

old_call = 'const timeout = setTimeout(() => controller.abort(), airtableRequestTimeoutMs(this.env));'
new_call = 'const startedAt = Date.now();\n    const timeout = setTimeout(() => controller.abort(), liffGatewayAirtableTimeoutMs(this.env));'
if old_call not in s:
    raise SystemExit("gateway timeout call changed unexpectedly")
s = s.replace(old_call, new_call, 1)

old_catch = '''    } catch (error) {
      if (error instanceof LiffGatewayStorageError) throw error;
      throw new LiffGatewayStorageError();
    } finally {'''
new_catch = '''    } catch (error) {
      const code = error instanceof LiffGatewayStorageError ? error.code : "LIFF_GATEWAY_STORAGE_UNAVAILABLE";
      console.warn({
        event: "liff_gateway_airtable_failure",
        operation: method,
        failure_class: error?.name === "AbortError" ? "timeout" : code === "LIFF_GATEWAY_STORAGE_FORBIDDEN" ? "forbidden" : "storage_unavailable",
        duration_ms: Math.max(0, Date.now() - startedAt),
      });
      if (error instanceof LiffGatewayStorageError) throw error;
      throw new LiffGatewayStorageError();
    } finally {'''
if old_catch not in s:
    raise SystemExit("gateway catch block changed unexpectedly")
s = s.replace(old_catch, new_catch, 1)

old_fn = '''function airtableRequestTimeoutMs(env) {
  const configured = Number(env.AIRTABLE_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(configured)) return DEFAULT_AIRTABLE_REQUEST_TIMEOUT_MS;
  return Math.min(MAX_AIRTABLE_REQUEST_TIMEOUT_MS, Math.max(MIN_AIRTABLE_REQUEST_TIMEOUT_MS, configured));
}'''
new_fn = '''export function liffGatewayAirtableTimeoutMs(env = {}) {
  const configured = Number(env.AIRTABLE_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(configured)) return DEFAULT_AIRTABLE_REQUEST_TIMEOUT_MS;
  return Math.min(MAX_AIRTABLE_REQUEST_TIMEOUT_MS, Math.max(MIN_AIRTABLE_REQUEST_TIMEOUT_MS, configured));
}'''
if old_fn not in s:
    raise SystemExit("gateway timeout helper changed unexpectedly")
s = s.replace(old_fn, new_fn, 1)
source.write_text(s)

wrangler = Path("member-pages-worker/wrangler.toml")
w = wrangler.read_text()
anchor_top = 'LIFF_MEMBER_RESOLVER_TIMEOUT_MS = "8000"\n'
if w.count(anchor_top) != 2:
    raise SystemExit("unexpected resolver timeout config count")
# Add explicitly to both production and staging env blocks.
w = w.replace(anchor_top, anchor_top + 'AIRTABLE_REQUEST_TIMEOUT_MS = "7000"\n')
wrangler.write_text(w)

test = Path("member-pages-worker/test/liff-gateway-airtable.test.mjs")
t = test.read_text()
old_import = 'import { getLiffGatewayStore, LIFF_GATEWAY_ROUTES, LiffGatewayStorageError } from "../src/liff-gateway-airtable.js";'
new_import = 'import { getLiffGatewayStore, LIFF_GATEWAY_ROUTES, LiffGatewayStorageError, liffGatewayAirtableTimeoutMs } from "../src/liff-gateway-airtable.js";'
if old_import not in t:
    raise SystemExit("gateway test import changed unexpectedly")
t = t.replace(old_import, new_import, 1)
marker = 'describe("LIFF gateway Airtable adapter", () => {\n'
addition = '''describe("LIFF gateway Airtable adapter", () => {
  it("uses a bounded seven-second gateway timeout by default and clamps explicit overrides", () => {
    assert.equal(liffGatewayAirtableTimeoutMs(env()), 7000);
    assert.equal(liffGatewayAirtableTimeoutMs(env({ AIRTABLE_REQUEST_TIMEOUT_MS: 8500 })), 8500);
    assert.equal(liffGatewayAirtableTimeoutMs(env({ AIRTABLE_REQUEST_TIMEOUT_MS: 100 })), 500);
    assert.equal(liffGatewayAirtableTimeoutMs(env({ AIRTABLE_REQUEST_TIMEOUT_MS: 20000 })), 10000);
  });

'''
if marker not in t:
    raise SystemExit("gateway test suite marker missing")
t = t.replace(marker, addition, 1)
test.write_text(t)

print("gateway timeout hotfix patch applied")
