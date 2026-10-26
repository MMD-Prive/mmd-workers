// Catch the entire custom domain so percent-encoded legacy paths cannot
// bypass a narrower path route. Existing studio/api and health routes retain
// their more-specific owners; non-Model static assets stay in the same bucket.
export async function handleLegacyAssetHost(request, env) {
  const headers = new Headers({ "cache-control": "private, no-store",
    "cdn-cache-control": "no-store", "cloudflare-cdn-cache-control": "no-store",
    "x-mmd-route-owner": "sigil-booking-worker", "x-content-type-options": "nosniff" });
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers });
  let key;
  try { key = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, ""); }
  catch { return new Response(null, { status: 400, headers }); }
  if (/^(?:models\/|mmd)/i.test(key)) return new Response(null, { status: 410, headers });
  if (!key || key.includes("\\") || key.split("/").includes("..") || key.includes("\u0000")) return new Response(null, { status: 404, headers });
  const bucket = env.MMD_MODEL_ASSETS;
  if (!bucket) return new Response(null, { status: 503, headers });
  const object = request.method === "HEAD" ? await bucket.head(key) : await bucket.get(key, { range: request.headers });
  if (!object) return new Response(null, { status: 404, headers });
  object.writeHttpMetadata?.(headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("etag", object.httpEtag || object.etag || "");
  headers.set("accept-ranges", "bytes");
  const range = object.range;
  if (range) {
    headers.set("content-range", "bytes " + range.offset + "-" + (range.offset + range.length - 1) + "/" + object.size);
    headers.set("content-length", String(range.length));
  } else headers.set("content-length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { status: range ? 206 : 200, headers });
}
