import test from "node:test";
import assert from "node:assert/strict";
import { isTmibAct001MediaPath, TMIB_ACT001_MEDIA_SOURCES } from "../src/tmib-media-lazy-seed.js";

test("lazy media seed owns frames 04 through 20 only", () => {
  const frames = Object.keys(TMIB_ACT001_MEDIA_SOURCES).sort((a, b) => Number(a) - Number(b));
  assert.deepEqual(frames, Array.from({ length:17 }, (_, index) => String(index + 4).padStart(2, "0")));
  for (const url of Object.values(TMIB_ACT001_MEDIA_SOURCES)) {
    assert.match(url, /^https:\/\/cdn\.prod\.website-files\.com\//);
    assert.match(url, /\.webp$/);
  }
});

test("lazy media route never claims public or content routes", () => {
  assert.equal(isTmibAct001MediaPath("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/media/04?exp=1&sig=x"), true);
  assert.equal(isTmibAct001MediaPath("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/media/20?exp=1&sig=x"), true);
  assert.equal(isTmibAct001MediaPath("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/media/03"), false);
  assert.equal(isTmibAct001MediaPath("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/content"), false);
  assert.equal(isTmibAct001MediaPath("https://mmdbkk.com/tmib/act-001"), false);
});
