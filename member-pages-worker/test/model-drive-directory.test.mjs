import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MODEL_DRIVE_DIRECTORY_HOST,
  MODEL_DRIVE_EXCLUSIVE_ROOT_FOLDER_ID,
  MODEL_DRIVE_RESOLVE_PATH,
  MODEL_DRIVE_SEARCH_PATH,
  MODEL_DRIVE_PHOTO_PATH,
  MODEL_DRIVE_CANONICAL_FILE_PATH,
  collapseDescendantsOfUniqueExactModelMatch,
  driveSearchToken,
  findExactModelImage,
  handleModelDriveDirectoryRequest,
  isModelDriveDirectoryRequest,
  modelNameScore,
  resolveApprovedModelFolder,
  searchApprovedModelFolders,
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
    isModelDriveDirectoryRequest(new Request(`https://${MODEL_DRIVE_DIRECTORY_HOST}${MODEL_DRIVE_PHOTO_PATH}?drive_folder_id=1FolderPhoto12345`)),
    true,
  );
  assert.equal(
    isModelDriveDirectoryRequest(new Request(`https://${MODEL_DRIVE_DIRECTORY_HOST}${MODEL_DRIVE_CANONICAL_FILE_PATH}`, { method: "POST" })),
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

test("canonical owner-approved Drive file lane can read a legacy folder without relaxing public root discovery", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const folderId = "1LegacyOwnerApproved12345";
  const fileId = "1LegacyApprovedFile12345";
  globalThis.fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);
    if (url.origin === "https://oauth2.googleapis.com") return Response.json({ access_token:"drive-token" });
    if (url.pathname === `/drive/v3/files/${folderId}`) {
      return Response.json({ id:folderId, name:"Legacy Model", parents:[], mimeType:"application/vnd.google-apps.folder", trashed:false });
    }
    if (url.pathname === "/drive/v3/files" && (url.searchParams.get("q") || "").includes(folderId)) {
      return Response.json({ files:[{ id:fileId, name:"owner-approved.jpg", mimeType:"image/jpeg", parents:[folderId], trashed:false }] });
    }
    if (url.pathname === `/drive/v3/files/${fileId}` && url.searchParams.get("alt") === "media") {
      return new Response(new Uint8Array([255,216,255,1]), { headers:{ "content-type":"image/jpeg" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const env = {
    GOOGLE_DRIVE_CLIENT_ID:"client",
    GOOGLE_DRIVE_CLIENT_SECRET:"secret",
    GOOGLE_DRIVE_REFRESH_TOKEN:"refresh",
  };
  const response = await handleModelDriveDirectoryRequest(new Request(
    `https://${MODEL_DRIVE_DIRECTORY_HOST}${MODEL_DRIVE_CANONICAL_FILE_PATH}`,
    {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({ drive_folder_id:folderId, file_name:"owner-approved.jpg" }),
    },
  ), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-model-photo-source"), "google-drive-canonical-owner-approved");
  assert.equal((await response.arrayBuffer()).byteLength, 4);

  assert.equal(
    isModelDriveDirectoryRequest(new Request(
      `https://mmdbkk.com${MODEL_DRIVE_CANONICAL_FILE_PATH}`,
      { method:"POST" },
    )),
    false,
  );
});

test("exact approved Drive photo lookup selects only the requested filename and fails closed on duplicates", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const rootId = "1ApprovedModelRoot12345";
  const childId = "1ApprovedChildFolder123";
  let duplicate = false;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname !== "/drive/v3/files") throw new Error("unexpected fetch");
    const query = url.searchParams.get("q") || "";
    if (query.includes(rootId)) {
      return Response.json({ files: [
        { id:"file-near", name:"approved-photo-copy.jpg", mimeType:"image/jpeg", parents:[rootId], trashed:false },
        { id:childId, name:"Media", mimeType:"application/vnd.google-apps.folder", parents:[rootId], trashed:false },
      ] });
    }
    if (query.includes(childId)) {
      const files = [
        { id:"file-exact", name:"approved-photo.jpg", mimeType:"image/jpeg", parents:[childId], trashed:false },
      ];
      if (duplicate) files.push({ id:"file-exact-2", name:"approved-photo.jpg", mimeType:"image/jpeg", parents:[childId], trashed:false });
      return Response.json({ files });
    }
    return Response.json({ files: [] });
  };

  const exact = await findExactModelImage("token", rootId, "approved-photo.jpg");
  assert.equal(exact?.id, "file-exact");
  assert.equal(await findExactModelImage("token", rootId, "missing.jpg"), null);

  duplicate = true;
  await assert.rejects(
    findExactModelImage("token", rootId, "approved-photo.jpg"),
    /drive_model_photo_exact_ambiguous/,
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

test("EMs16 code search suppresses nested Review folder when the real root includes the nickname", () => {
  const rows = [
    {
      drive_folder_id: "1aJGfs0fBI-bH1mwra3SG1uXz71JWtM3t",
      folder_name: "EMs16 Gohan",
      folder_path: "MMD Exclusive Models / Exclusive PN / EMs16 Gohan",
      lane: "exclusive",
      score: 0.88,
    },
    {
      drive_folder_id: "1JNv8OWPmQValSlUf5VirOtQ_nRaWq4Vd",
      folder_name: "Review EMs16 Gohan",
      folder_path: "MMD Exclusive Models / Exclusive PN / EMs16 Gohan / Review EMs16 Gohan",
      lane: "exclusive",
      score: 0.88,
    },
  ];

  const collapsed = collapseDescendantsOfUniqueExactModelMatch("EMs16", rows);
  assert.deepEqual(collapsed.map((item) => item.drive_folder_id), ["1aJGfs0fBI-bH1mwra3SG1uXz71JWtM3t"]);
});

test("Drive search end-to-end collapses live-shaped EMs16 Gohan root over Review child", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const rootId = "1aJGfs0fBI-bH1mwra3SG1uXz71JWtM3t";
  const reviewId = "1JNv8OWPmQValSlUf5VirOtQ_nRaWq4Vd";
  const pnId = "1ExclusivePnFolder12345";
  const files = new Map([
    [rootId, {
      id: rootId,
      name: "EMs16 Gohan",
      parents: [pnId],
      mimeType: "application/vnd.google-apps.folder",
      trashed: false,
    }],
    [reviewId, {
      id: reviewId,
      name: "Review EMs16 Gohan",
      parents: [rootId],
      mimeType: "application/vnd.google-apps.folder",
      trashed: false,
    }],
    [pnId, {
      id: pnId,
      name: "Exclusive PN",
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
    if (url.pathname === "/drive/v3/files") {
      return Response.json({ files: [files.get(rootId), files.get(reviewId)] });
    }
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const folder = files.get(id);
    return folder
      ? Response.json(folder)
      : Response.json({ error: "not_found" }, { status: 404 });
  };

  const items = await searchApprovedModelFolders("test-token", "EMs16", "all", {});
  assert.deepEqual(items.map((item) => item.drive_folder_id), [rootId]);
  assert.equal(items[0].folder_name, "EMs16 Gohan");
  assert.equal(items[0].folder_path, "MMD Exclusive Models / Exclusive PN / EMs16 Gohan");
  assert.equal(items[0].folder_scope_key, `exclusive:drive:${rootId}`);
});

test("Drive search resolves a bounded, best-name-ranked folder set", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const publicRoot = "1pr8X4sk7A_5vPZxG5syp5fmgEs9fZF77";
  const exactId = "1CaptainExact12345";
  const folders = [
    { id: exactId, name: "Captain S", parents: [publicRoot], mimeType: "application/vnd.google-apps.folder", trashed: false },
    ...Array.from({ length: 40 }, (_, index) => ({
      id: "1CaptainCandidate" + String(index).padStart(2, "0"),
      name: "Captain Model " + String(index).padStart(2, "0"),
      parents: [publicRoot],
      mimeType: "application/vnd.google-apps.folder",
      trashed: false,
    })),
  ];
  let folderReads = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/drive/v3/files" && !url.pathname.endsWith("/")) {
      if (url.searchParams.has("q")) return Response.json({ files: folders });
    }
    if (url.pathname.startsWith("/drive/v3/files/")) {
      folderReads += 1;
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const folder = folders.find((item) => item.id === id) || {
        id: publicRoot, name: "MMD Models - Public", parents: [],
        mimeType: "application/vnd.google-apps.folder", trashed: false,
      };
      return Response.json(folder);
    }
    throw new Error("unexpected Drive request " + url.pathname);
  };
  const items = await searchApprovedModelFolders("test-token", "Captain S", "all", {});
  assert.ok(items.some((item) => item.drive_folder_id === exactId));
  assert.ok(folderReads <= 48, "at most 24 candidate folders and their approved root should be read");
});

test("exact model root still suppresses nested operational children", () => {
  const rows = [
    { drive_folder_id: "root-folder-12345", folder_name: "EMs16", folder_path: "MMD Exclusive Models / Exclusive PN / EMs16", score: 1 },
    { drive_folder_id: "child-folder-12345", folder_name: "Review EMs16 Gohan", folder_path: "MMD Exclusive Models / Exclusive PN / EMs16 / Review EMs16 Gohan", score: 0.88 },
  ];
  assert.deepEqual(
    collapseDescendantsOfUniqueExactModelMatch("EMs16", rows).map((item) => item.drive_folder_id),
    ["root-folder-12345"],
  );
});

test("operational child alone is never promoted to a model root", () => {
  const rows = [{
    drive_folder_id: "review-only-12345",
    folder_name: "Review EMs16 Gohan",
    folder_path: "MMD Exclusive Models / Exclusive PN / EMs16 Gohan / Review EMs16 Gohan",
    score: 0.88,
  }];
  assert.deepEqual(
    collapseDescendantsOfUniqueExactModelMatch("EMs16", rows).map((item) => item.drive_folder_id),
    ["review-only-12345"],
  );
});

test("Drive ambiguity remains fail-closed when multiple genuine model roots match the code", () => {
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
