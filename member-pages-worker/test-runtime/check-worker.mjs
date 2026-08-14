import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { build } from "esbuild";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testRoot, "../..");
const temporary = await mkdtemp(path.join(tmpdir(), "mmd-member-pages-check-"));

try {
  const packageJson = JSON.parse(await readFile(path.join(testRoot, "node_modules/wrangler/package.json"), "utf8"));
  const wranglerCli = path.join(testRoot, "node_modules/wrangler", packageJson.bin.wrangler);
  const types = spawnSync(process.execPath, [
    wranglerCli,
    "types",
    path.join(temporary, "worker-configuration.d.ts"),
    "--config",
    path.join(root, "member-pages-worker/wrangler.toml"),
  ], {
    cwd: root,
    env: { ...process.env, WRANGLER_LOG_PATH: path.join(temporary, "wrangler.log") },
    stdio: "inherit",
  });
  if (types.status !== 0) process.exitCode = types.status || 1;
  if (process.exitCode) throw new Error("Wrangler configuration validation failed");

  await build({
    entryPoints: [path.join(root, "member-pages-worker/src/runtime-index.js")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    external: ["cloudflare:*"],
    logLevel: "info",
    write: false,
  });
} finally {
  await rm(temporary, { recursive: true, force: true });
}
