import assert from "node:assert/strict";
import test from "node:test";

import legacyMemberPages from "../src/legacy-member-pages.js";

test("/member/profile renders responsive digital hero backgrounds without changing route actions", async () => {
  const response = await legacyMemberPages.fetch(
    new Request("https://www.mmdbkk.com/member/profile?t=member-test&promo=profile"),
    {},
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-page"), "member-profile");

  const html = await response.text();
  assert.match(html, /data-mmd-page="member-profile"/);
  assert.match(html, /Profiles%20Hero%20Desk\.webp/);
  assert.match(html, /Profiles%20Hero%20Mob\.webp/);
  assert.match(html, /min-height:100svh/);
  assert.match(html, /MEMBER SYSTEM/);
  assert.match(html, /PROFILE ACCESS/);
  assert.match(html, /\/member\/dashboard\?t=member-test&amp;promo=profile/);
  assert.match(html, /\/sigil\/member\/membership\?t=member-test&amp;promo=profile/);
});

test("/member/profile HEAD keeps presentation headers and no body", async () => {
  const response = await legacyMemberPages.fetch(
    new Request("https://www.mmdbkk.com/member/profile", { method: "HEAD" }),
    {},
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-page"), "member-profile");
  assert.equal(await response.text(), "");
});
