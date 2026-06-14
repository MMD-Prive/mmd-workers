import assert from "node:assert/strict";
import worker, {
  findMappedPath,
  isMemberFrontendPath,
  shouldNeverTouch,
} from "../src/index.js";

assert.equal(findMappedPath("/login"), "/trust/inme");
assert.equal(findMappedPath("/member/membership/benefits"), "/pay/membership");
assert.equal(findMappedPath("/member/dashboard"), "/member/dashboard");

assert.equal(isMemberFrontendPath(new URL("https://mmdbkk.com/member/dashboard?t=abc&debug=1")), true);
assert.equal(isMemberFrontendPath(new URL("https://mmdbkk.com/member/membership?code=abc&promo=gold")), true);
assert.equal(shouldNeverTouch(new URL("https://mmdbkk.com/pay/membership")), true);
assert.equal(shouldNeverTouch(new URL("https://mmdbkk.com/sigil/admin/login")), true);

{
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/login?debug=1"));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://mmdbkk.com/trust/inme?debug=1");
}

{
  const env = {
    IMMIGRATE_WORKER: {
      fetch(request) {
        const url = new URL(request.url);
        return new Response("member", {
          status: 200,
          headers: {
            "x-test-path": url.pathname,
            "x-test-query": url.search,
          },
        });
      },
    },
  };
  const response = await worker.fetch(new Request("https://mmdbkk.com/member/dashboard?t=abc&code=gold&debug=1"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-test-path"), "/member/dashboard");
  assert.equal(response.headers.get("x-test-query"), "?t=abc&code=gold&debug=1");
}
