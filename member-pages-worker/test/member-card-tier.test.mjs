import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLevel } from "../src/member-app-api.js";

test("canonical member-card tiers survive the MY MMD adapter", () => {
  assert.equal(normalizeLevel("MMD Member"), "public_member");
  assert.equal(normalizeLevel("Public Member"), "public_member");
  assert.equal(normalizeLevel("Elite"), "elite");
  assert.equal(normalizeLevel("Red Card"), "red_card");
  assert.equal(normalizeLevel("Standard"), "standard");
  assert.equal(normalizeLevel("Premium"), "premium");
  assert.equal(normalizeLevel("VIP"), "vip");
  assert.equal(normalizeLevel("SVIP"), "svip");
  assert.equal(normalizeLevel("Black Card"), "black_card");
});

test("unknown membership tier remains fail-closed", () => {
  assert.equal(normalizeLevel("Founder Secret"), "unknown");
  assert.equal(normalizeLevel(""), "unknown");
});
