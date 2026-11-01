import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "terser";

const studio = new URL("../webflow/internal/admin/studio/", import.meta.url);
export function validateStudioFrameManifest(manifest) {
  if (manifest.assets.length !== 7 || !manifest.release_ready) throw new Error("studio_frame_registry_not_ready");
  const colors = ["matte gray", "green", "cyan", "red", "orange"];
  if (manifest.assets.slice(0, 5).some((a, i) => a.accent !== colors[i] || a.superseded_pending_replacement)) throw new Error("studio_frame_palette_not_ready");
  if (manifest.color_scope !== "small_right_edge_strip_only") throw new Error("studio_frame_color_scope_not_ready");
  const rejected = new Set((manifest.superseded_inputs || []).map(a => a.library_file_id));
  if (manifest.assets.some(a => rejected.has(a.library_file_id))) throw new Error("studio_frame_source_superseded");
}
export async function buildStudioFrames({ assetBase } = {}) {
  const manifest = JSON.parse(await readFile(new URL("frames/clean-v1/manifest.json", studio), "utf8"));
  validateStudioFrameManifest(manifest);
  const expected = [null, null, null, null, null, "EMs", "GWs"];
  const base = assetBase || manifest.hosting.public_base;
  for (const [index, asset] of manifest.assets.entries()) {
    if (asset.number !== index + 1 || asset.field !== expected[index]) throw new Error("studio_frame_mapping_changed");
    const bytes = await readFile(new URL("frames/clean-v1/" + asset.asset_file, studio));
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256 || bytes.readUInt32BE(16) !== 1316 || bytes.readUInt32BE(20) !== 1195) throw new Error("studio_frame_source_changed");
  }
  const registry = "window.MMDStudioFrameAssets=" + JSON.stringify(manifest.assets.map(a => ({ number: a.number, field: a.field, accent: a.accent, label: a.label, url: base + "/" + a.asset_file }))) + ";\n";
  const renderer = await readFile(new URL("studio-clean-frame-renderer.js", studio), "utf8");
  const selector = await readFile(new URL("studio-compcard-template-selector.js", studio), "utf8");
  const result = await minify(registry + renderer + "\n" + selector, { compress: true, mangle: true, format: { comments: false } });
  if (!result.code) throw new Error("studio_frame_bundle_empty");
  const sha256 = createHash("sha256").update(result.code).digest("hex");
  return { manifest, code: result.code, sha256, filename: "studio-frames-" + sha256.slice(0, 12) + ".js" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(process.argv[2] || "/tmp/studio-clean-frame-release");
  const release = await buildStudioFrames();
  await mkdir(output, { recursive: true });
  for (const asset of release.manifest.assets) await copyFile(new URL("frames/clean-v1/" + asset.asset_file, studio), resolve(output, asset.asset_file));
  await writeFile(resolve(output, release.filename), release.code);
  const url = release.manifest.hosting.public_base + "/" + release.filename;
  const loader = '<script defer src="' + url + '"></script>';
  await writeFile(resolve(output, "webflow-loader.html"), loader + "\n");
  await writeFile(resolve(output, "release.json"), JSON.stringify({ source_version: release.manifest.version, bundle: release.filename, sha256: release.sha256, url, bucket: release.manifest.hosting.bucket, prefix: release.manifest.hosting.prefix, assets: release.manifest.assets.map(a => ({ file: a.asset_file, sha256: a.sha256 })) }, null, 2) + "\n");
  console.log(JSON.stringify({ output, bundle: release.filename, bytes: Buffer.byteLength(release.code), loader }));
}
