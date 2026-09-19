import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MODEL_DRIVE_DIRECTORY_HOST,
  MODEL_DRIVE_EXCLUSIVE_ROOT_FOLDER_ID,
  MODEL_DRIVE_RESOLVE_PATH,
  MODEL_DRIVE_SEARCH_PATH,
  collapseDescendantsOfUniqueExactModelMatch,
  driveSearchToken,
  isModelDriveDirectoryRequest,
  modelNameScore,
  resolveApprovedModelFolder,
} from "../src/model-drive-directory.js";

test("model Drive directory only recognizes internal model-directory paths", () => {
  assert.equal(
    isModelDriveDirectoryRequest(new Request(`https://${MODEL_DRIVE_DIRECTORY_HOST}${MODEL_DRIVE_SEARCH_PATH}?q=Book`)),
    true,
  );
  assert.equal(
    isModelDriveDirectoryRequest(new Request(`https://${MODEL_DRIVE_DIRECTORY_HOST}${MODEL_DRIVE_RESOLVE_PATH}`, { method: "POST" })),
    true,
  );
  assert.equal(
    isModelDriveDirectoryRequest(new Request("https://member-pages-worker.malemodel-bkk.workers.dev/__internal/model-drive/search?q=Book")),
    true,
  );
  assert.equal(
    isModelDriveDirectoryRequest(new Request("https://mmdbkk.com/__internal/model-drive/search?q=Book")),
    false,
  );
});

test("Drive discovery uses a stable meaningful token for near-name searches", () => {
  assert.equal(driveSearchToken("Book El"), "Book");
  assert.equal(driveSearchToken("Babe B"), "Babe");
  assert.equal(driveSearchToken("EMs01"), "EMs01");
});

test("Drive discovery can suggest Book EI for Book El without auto-binding", () => {
  assert.ok(modelNameScore("Book El", "Book EI") > 0.7);
  // Weak unrelated similarity must remain below the production suggestion cutoff (0.28).
  assert.ok(modelNameScore("Book El", "Completely Different") < 0.28);
});

test("exact EMs16 model root suppresses its nested Review EMs16 Gohan folder", () => {
  const rows = [
    {
      drive_folder_id: "1aJGfs0fBI-bH1mwra3SG1uXz71JWtM3t",
      folder_name: "EMs16",
      folder_path: "MMD Exclusive Models / Exclusive PN / EMs16",
      lane: "exclusive",
      score: 1,
    },
    {
      drive_folder_id: "1JNv8OWPmQValSlUf5VirOtQ_nRaWq4Vd",
      folder_name: "Review EMs16 Gohan",
      folder_path: "MMD Exclusive Models / Exclusive PN / EMs16 / Review EMs16 Gohan",
      lane: "exclusive",
      score: 0.88,
    },
  ];

  const collapsed = collapseDescendantsOfUniqueExactModelMatch("EMs16", rows);
  assert.deepEqual(collapsed.map((item) => item.drive_folder_id), ["1aJGfs0fBI-bH1mwra3SG1uXz71JWtM3t"]);
});

test("Drive ambiguity remains fail-closed when there is no unique exact model-root match", () => {
  const rows = [
    { drive_folder_id: "folder-a-12345", folder_name: "EMs16 Alpha", folder_path: "MMD Exclusive Models / Exclusive PN / EMs16 Alpha", score: 0.88 },
    { drive_folder_id: "folder-b-12345", folder_name: "EMs16 Beta", folder_path: "MMD Exclusive Models / Exclusive PN / EMs16 Beta", score: 0.88 },
  ];
  assert.equal(collapseDescendantsOfUniqueExactModelMatch("EMs16", rows).length, 2);
});

test("Exclusive inventory root is pinned to the reviewed MMD Exclusive Models folder", () => {
  assert.equal(MODEL_DRIVE_EXCLUSIVE_ROOT_FOLDER_ID, "1j1NRB44PboVQR91M8-17Vb8kcCTCLS97");
});

test("EMs15 resolves through Exclusive VIP/Both into an Exclusive folder_scope_key", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const folders = new Map([
    ["1BothFolderForEMs15", {
      id: "1BothFolderForEMs15",
      name: "Both",
      parents: ["1ExclusiveVipFolder"],
      mimeType: "application/vnd.google-apps.folder",
      trashed: false,
    }],
    ["1ExclusiveVipFolder", {
      id: "1ExclusiveVipFolder",
      name: "Exclusive VIP",
      parents: [MODEL_DRIVE_EXCLUSIVE_ROOT_FOLDER_ID],
      mimeType: "application/vnd.google-apps.folder",
      trashed: false,
    }],
    [MODEL_DRIVE_EXCLUSIVE_ROOT_FOLDER_ID, {
      id: MODEL_DRIVE_EXCLUSIVE_ROOT_FOLDER_ID,
      name: "MMD Exclusive Models",
      parents: ["1CatalogParentPlaceholder"],
      mimeType: "application/vnd.google-apps.folder",
      trashed: false,
    }],
  ]);

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const folder = folders.get(id);
    return folder
      ? new Response(JSON.stringify(folder), { status: 200, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });
  };

  const ems15Id = "1CCf755JC6-e4VPM5ApqadNozXVFpofmh";
  const resolved = await resolveApprovedModelFolder("test-token", ems15Id, {}, {
    id: ems15Id,
    name: "EMs15",
    parents: ["1BothFolderForEMs15"],
    mimeType: "application/vnd.google-apps.folder",
    trashed: false,
  });

  assert.equal(resolved?.lane, "exclusive");
  assert.equal(resolved?.approved_root_id, MODEL_DRIVE_EXCLUSIVE_ROOT_FOLDER_ID);
  assert.equal(resolved?.folder_scope_key, `exclusive:drive:${ems15Id}`);
  assert.equal(resolved?.folder_path, "MMD Exclusive Models / Exclusive VIP / Both / EMs15");
});
