import assert from 'node:assert/strict';
import { test } from 'node:test';
import { patchMmsCloudflareGateway } from './my-mms-cloudflare-gateway-candidate.mjs';

const source = `var PRESENTATION_ORIGIN = "https://my-therapist.lovable.app";
headers.set("x-mmd-ui-source", "my-mms-therapist-github-via-lovable");
async function handleMyMmsCustomerUi(request) {
  upstream = await globalThis.fetch(new Request(presentationUrlForPage3(request), {}));
}
async function handleMyMmsCustomerAsset(request) {
  upstream = await globalThis.fetch(new Request(upstreamUrl, {}));
}
__name(handleMyMmsCustomerAsset, "handleMyMmsCustomerAsset");
if (isMyMmsCustomerAssetRequest(request)) return handleMyMmsCustomerAsset(request);
if (isMyMmsCustomerUiRequest(request)) return handleMyMmsCustomerUi(request);
// unrelated proxy and identity authority
upstream = await globalThis.fetch(new Request(upstreamUrl, {}));
if (isMyMmsCustomerApiRequest(request)) return handleMyMmsCustomerApi(request, env);
`;
test('eight reversible edits preserve the other proxy and API authority byte for byte', () => {
  const result = patchMmsCloudflareGateway(source);
  assert.equal(result.editCount, 8);
  assert.equal(result.code.split('env.MMS_CUSTOMER_UI.fetch').length - 1, 2);
  assert.ok(result.code.includes('// unrelated proxy and identity authority\nupstream = await globalThis.fetch(new Request(upstreamUrl, {}));'));
  assert.ok(result.code.includes('if (isMyMmsCustomerApiRequest(request)) return handleMyMmsCustomerApi(request, env);'));
});
test('a changed or ambiguous baseline is rejected instead of applying a partial patch', () => {
  assert.throws(() => patchMmsCloudflareGateway(source.replace('presentationUrlForPage3(request)', 'unknown(request)')));
  assert.throws(() => patchMmsCloudflareGateway(source + '\n' + 'var PRESENTATION_ORIGIN = "https://my-therapist.lovable.app";'));
});
