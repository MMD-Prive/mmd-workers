import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inferDrivePrivateAccessFolder,
  inferDrivePrivateServiceLevel,
  inferModelLanes,
} from "./src/unified-model-drive-link.js";

test("Exclusive folder scope remains distinct while inheriting Private capability", () => {
  assert.deepEqual(
    inferModelLanes({
      folder_scope_key: "exclusive:drive:1CCf755JC6-e4VPM5ApqadNozXVFpofmh",
      can_work_private: true,
    }),
    ["private", "exclusive"],
  );
});

test("Exclusive scope is discoverable even before canonical private capability is materialized", () => {
  assert.deepEqual(
    inferModelLanes({ folder_scope_key: "exclusive:drive:1CCf755JC6-e4VPM5ApqadNozXVFpofmh" }),
    ["exclusive", "private"],
  );
});


test("Approved Exclusive VIP Drive path materializes canonical VIP plus PN capability", () => {
  assert.equal(
    inferDrivePrivateServiceLevel({
      lane: "exclusive",
      folder_path: "MMD Exclusive Models / Exclusive VIP / Active / EMs21 J Dye",
    }),
    "vip",
  );
});

test("Approved Exclusive PN Drive path materializes PN-only capability", () => {
  assert.equal(
    inferDrivePrivateServiceLevel({
      lane: "exclusive",
      folder_path: "MMD Exclusive Models / Exclusive PN / Active / EMs22",
    }),
    "pn",
  );
});


test("Private legacy path uses the most specific VIP subfolder as access group", () => {
  const folder = {
    lane: "private",
    folder_path: "Private Models / Standard Package / MMD Variety / MMD Farang / VIP / Simba",
  };
  assert.equal(inferDrivePrivateAccessFolder(folder), "vip");
  assert.equal(inferDrivePrivateServiceLevel(folder), "vip");
});

test("Private Premium package without a deeper VIP group stays Premium access", () => {
  assert.equal(
    inferDrivePrivateAccessFolder({
      lane: "private",
      folder_path: "Private Models / Premium Package / Straight / Example",
    }),
    "premium",
  );
});
