import test from "node:test";
import assert from "node:assert/strict";
import { membershipGrantsTmib } from "../src/tmib-story-access.js";

const active = (level) => ({ level, levelVerified: true, displayOnly: false, status: "active", lifecycle: "active", access: "checking" });

test("TMIB includes the public 690 THB member lane through private Black Card", () => {
  for (const level of ["public_member", "elite", "red_card", "standard", "premium", "vip", "svip", "black_card"]) {
    assert.equal(membershipGrantsTmib(active(level)), true, level);
  }
});

test("TMIB fails closed for non-active lifecycle", () => {
  for (const status of ["expired", "blocked", "suspended", "revoked", "pending_review", "checking"]) {
    assert.equal(membershipGrantsTmib({ ...active("public_member"), status, lifecycle: status === "checking" ? "checking" : "inactive" }), false, status);
  }
});
