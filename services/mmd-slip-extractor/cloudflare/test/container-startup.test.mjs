import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cloudflareDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serviceDir = resolve(cloudflareDir, "..");

async function waitForHealth(url, child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`container server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // The process may still be binding the local test port.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("container server did not become healthy in time");
}

test("container image and Worker use an explicit absolute startup contract", async () => {
  const [dockerfile, worker] = await Promise.all([
    readFile(resolve(cloudflareDir, "Dockerfile"), "utf8"),
    readFile(resolve(cloudflareDir, "worker.mjs"), "utf8")
  ]);

  assert.match(dockerfile, /COPY cloudflare\/container-server\.mjs \.\/cloudflare\/container-server\.mjs/);
  assert.match(dockerfile, /ENTRYPOINT \["\/usr\/local\/bin\/node", "\/app\/cloudflare\/container-server\.mjs"\]/);
  assert.match(worker, /defaultPort = 8080/);
  assert.match(worker, /entrypoint = \["\/usr\/local\/bin\/node", "\/app\/cloudflare\/container-server\.mjs"\]/);
});

test("container server binds on PORT and serves health", async (t) => {
  const port = 18080 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [resolve(cloudflareDir, "container-server.mjs")], {
    cwd: serviceDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(() => child.kill("SIGTERM"));

  const response = await waitForHealth(`http://127.0.0.1:${port}/health`, child);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "mmd-slip-extractor",
    runtime: "cloudflare-container-staging"
  });
});
