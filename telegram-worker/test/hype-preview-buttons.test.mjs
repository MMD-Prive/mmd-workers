import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { inlineButtons } from "../lib/hype-preview.js";

const CODE = "123456";
const CAMPAIGN = "preview_pride_jun2026";

function flatButtons(markup) {
  return markup.inline_keyboard.flat();
}

function byLabel(markup, label) {
  return flatButtons(markup).find((button) => button.text === label);
}

function assertPreviewParams(rawUrl) {
  const url = new URL(rawUrl);
  assert.equal(url.searchParams.get("promo"), CODE);
  assert.equal(url.searchParams.get("src"), "telegram_preview");
  assert.equal(url.searchParams.get("campaign"), CAMPAIGN);
}

describe("HYPE preview inline buttons", () => {
  it("renders exactly the customer action labels in the expected layout", () => {
    const markup = inlineButtons(CODE, CAMPAIGN, {});
    const labels = flatButtons(markup).map((button) => button.text);

    assert.deepEqual(labels, [
      "Preview Models",
      "Booking",
      "Apply for Membership",
      "Our Benefits",
      "Back to Preview Channel",
    ]);
    assert.equal(markup.inline_keyboard.length, 4);
    assert.equal(markup.inline_keyboard[0].length, 2);
  });

  it("preserves promo, src, and campaign on customer action URLs", () => {
    const markup = inlineButtons(CODE, CAMPAIGN, {});

    assertPreviewParams(byLabel(markup, "Preview Models").url);
    assertPreviewParams(byLabel(markup, "Booking").url);
    assertPreviewParams(byLabel(markup, "Apply for Membership").url);
    assertPreviewParams(byLabel(markup, "Our Benefits").url);

    assert.equal(new URL(byLabel(markup, "Preview Models").url).pathname, "/profiles");
    assert.equal(new URL(byLabel(markup, "Booking").url).pathname, "/sigil/booking");
    assert.equal(new URL(byLabel(markup, "Apply for Membership").url).pathname, "/member/apply");
    assert.equal(new URL(byLabel(markup, "Our Benefits").url).pathname, "/member/membership");
    assert.equal(byLabel(markup, "Back to Preview Channel").url, "https://t.me/MMDPriveTH");

    for (const button of flatButtons(markup)) {
      assert.doesNotMatch(button.url, /\/hall(?:[/?#]|$)/);
      assert.doesNotMatch(button.url, /\/membership\/benefits(?:[/?#]|$)/);
      assert.doesNotMatch(button.url, /line|liff/i);
    }
    assert.doesNotMatch(byLabel(markup, "Our Benefits").url, /\/pay\/membership(?:[/?#]|$)/);
  });

  it("honors safe URL env overrides without using legacy benefits URL", () => {
    const markup = inlineButtons(CODE, CAMPAIGN, {
      HYPE_PREVIEW_PROFILES_URL: "https://example.com/custom-profiles",
      HYPE_PREVIEW_BOOKING_URL: "https://example.com/custom-booking",
      HYPE_PREVIEW_APPLY_URL: "https://example.com/custom-apply",
      HYPE_PREVIEW_PACKAGES_URL: "https://example.com/member/membership",
      HYPE_PREVIEW_CHANNEL_URL: "https://t.me/customPreview",
    });

    assert.equal(new URL(byLabel(markup, "Preview Models").url).pathname, "/custom-profiles");
    assert.equal(new URL(byLabel(markup, "Booking").url).pathname, "/custom-booking");
    assert.equal(new URL(byLabel(markup, "Apply for Membership").url).pathname, "/custom-apply");
    assert.equal(new URL(byLabel(markup, "Our Benefits").url).pathname, "/member/membership");
    assert.doesNotMatch(byLabel(markup, "Our Benefits").url, /\/membership\/benefits/);
    assert.equal(byLabel(markup, "Back to Preview Channel").url, "https://t.me/customPreview");
  });

  it("keeps customer-facing HYPE copy away from forbidden package claims", () => {
    const source = readFileSync(new URL("../lib/hype-preview.js", import.meta.url), "utf8");

    assert.match(source, /Standard ได้ 150 Points/);
    assert.match(source, /Premium ได้ 250 Points/);
    assert.doesNotMatch(source, /SVIP/i);
    assert.doesNotMatch(source, /Black Card รับ 350 Points/i);
    assert.doesNotMatch(source, /ทีมงาน|ทีม/);
  });
});
