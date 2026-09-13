import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MODEL_DRIVE_DIRECTORY_HOST,
  MODEL_DRIVE_RESOLVE_PATH,
  MODEL_DRIVE_SEARCH_PATH,
  driveSearchToken,
  isModelDriveDirectoryRequest,
  modelNameScore,
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
  assert.equal(modelNameScore("Book El", "Completely Different"), 0);
});
