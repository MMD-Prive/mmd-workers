import { PRIVATE_MEDIA_BUCKET } from "../shared/private-media.mjs";

const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
const account = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
if (!token || !/^[a-f0-9]{32}$/.test(account)) throw new Error("Cloudflare credentials unavailable");
const root = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets`;
async function call(suffix, options = {}) {
  const response = await fetch(root + suffix, { ...options, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const body = await response.json().catch(() => null);
  return { ok: response.ok && body?.success === true, status: response.status, result: body?.result };
}
let bucket = await call(`/${PRIVATE_MEDIA_BUCKET}`);
if (bucket.status === 404) {
  await call("", { method: "POST", body: JSON.stringify({ name: PRIVATE_MEDIA_BUCKET }) });
  // Re-read also handles two deployment jobs creating the same bucket.
  bucket = await call(`/${PRIVATE_MEDIA_BUCKET}`);
}
if (!bucket.ok) throw new Error(`Private media bucket unavailable (${bucket.status})`);
const managed = await call(`/${PRIVATE_MEDIA_BUCKET}/domains/managed`);
const custom = await call(`/${PRIVATE_MEDIA_BUCKET}/domains/custom`);
if (!managed.ok || managed.result?.enabled !== false || !custom.ok || !Array.isArray(custom.result?.domains) || custom.result.domains.some(item => item.enabled !== false)) {
  throw new Error("Private media bucket public access is not verified disabled; deployment stopped");
}
console.log("Private media R2 bucket verified: r2.dev disabled, no enabled custom domains");
