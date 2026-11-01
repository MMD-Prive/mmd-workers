// Apply only the reviewed presentation transport edits to a pinned serving bundle.
// The caller must separately verify the source version and full SHA-256 first.
export function patchMmsCloudflareGateway(source) {
  const edits = [
    ['var PRESENTATION_ORIGIN = "https://my-therapist.lovable.app";', 'var PRESENTATION_ORIGIN = "https://mms-customer-ui.internal";'],
    ['headers.set("x-mmd-ui-source", "my-mms-therapist-github-via-lovable");', 'headers.set("x-mmd-ui-source", "my-mms-therapist-github-via-cloudflare");'],
    ['async function handleMyMmsCustomerUi(request) {', 'async function handleMyMmsCustomerUi(request, env = {}) {'],
    ['upstream = await globalThis.fetch(new Request(presentationUrlForPage3(request), {', 'if (!env.MMS_CUSTOMER_UI?.fetch) throw new Error("MMS_PRESENTATION_UNAVAILABLE");\n    upstream = await env.MMS_CUSTOMER_UI.fetch(new Request(presentationUrlForPage3(request), {'],
    ['async function handleMyMmsCustomerAsset(request) {', 'async function handleMyMmsCustomerAsset(request, env = {}) {'],
    ['if (isMyMmsCustomerAssetRequest(request)) return handleMyMmsCustomerAsset(request);', 'if (isMyMmsCustomerAssetRequest(request)) return handleMyMmsCustomerAsset(request, env);'],
    ['if (isMyMmsCustomerUiRequest(request)) return handleMyMmsCustomerUi(request);', 'if (isMyMmsCustomerUiRequest(request)) return handleMyMmsCustomerUi(request, env);'],
  ];
  const start = source.indexOf('async function handleMyMmsCustomerAsset(request) {');
  const end = source.indexOf('\n__name(handleMyMmsCustomerAsset,', start);
  if (start < 0 || end < start) throw Error('MMS asset function boundary mismatch');
  const assetBody = source.slice(start, end);
  const assetOld = 'upstream = await globalThis.fetch(new Request(upstreamUrl, {';
  const assetNew = 'if (!env.MMS_CUSTOMER_UI?.fetch) throw new Error("MMS_PRESENTATION_UNAVAILABLE");\n    upstream = await env.MMS_CUSTOMER_UI.fetch(new Request(upstreamUrl, {';
  if (assetBody.split(assetOld).length !== 2) throw Error('MMS asset fetch mismatch');
  // Keep the asset replacement scoped: other app proxies use the same expression.
  let candidate = source.slice(0, start) + assetBody.replace(assetOld, assetNew) + source.slice(end);
  for (const [before, after] of edits) {
    if (candidate.split(before).length !== 2) throw Error('MMS presentation patch no longer unique: ' + before.slice(0, 70));
    candidate = candidate.replace(before, after);
  }
  let restored = candidate;
  for (const [before, after] of [...edits].reverse()) restored = restored.replace(after, before);
  const nextStart = restored.indexOf('async function handleMyMmsCustomerAsset(request) {');
  const nextEnd = restored.indexOf('\n__name(handleMyMmsCustomerAsset,', nextStart);
  restored = restored.slice(0, nextStart) + restored.slice(nextStart, nextEnd).replace(assetNew, assetOld) + restored.slice(nextEnd);
  if (restored !== source) throw Error('MMS patch changed bytes outside the eight reviewed edits');
  return { code: candidate, editCount: edits.length + 1 };
}
