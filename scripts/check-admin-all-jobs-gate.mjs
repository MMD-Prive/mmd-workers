import { pathToFileURL } from "node:url";

// Anonymous read-only probes. Do not follow redirects or create a login session.
export async function checkAdminAllJobsGate(fetchImpl = fetch) {
  const results = [];
  for (const origin of ["https://mmdbkk.com", "https://www.mmdbkk.com"]) {
    for (const path of ["/internal/admin/jobs/all", "/internal/admin/jobs/all/"]) {
      for (const search of ["", "?page=2"]) {
        for (const method of ["GET", "HEAD"]) {
          const url = `${origin}${path}${search}`;
          const response = await fetchImpl(url, {
            method, redirect: "manual", signal: AbortSignal.timeout(20000),
          });
          const gateVersion = response.headers.get("x-mmd-admin-gate-version");
          await response.body?.cancel();
          const expectedStatus = method === "GET" ? 303 : 401;
          if (response.status !== expectedStatus || gateVersion !== "credential-bound-v1") {
            throw new Error(`All Jobs gate failed: ${method} ${url} status=${response.status} gate=${gateVersion}`);
          }
          if (method === "GET") {
            const target = new URL(response.headers.get("location") || "", origin);
            if (
              target.origin !== origin || target.pathname !== "/internal/admin/login" ||
              target.searchParams.get("next") !== `/internal/admin/jobs/all${search}` ||
              response.headers.get("x-mmd-admin-gate") !== "credential-required"
            ) {
              throw new Error(`All Jobs login redirect failed: ${method} ${url}`);
            }
          }
          results.push({ method, url, status: response.status, gateVersion });
        }
      }
    }
  }
  return results;
}

// Newly applied routes may not be visible at every edge immediately. Retry the
// complete check; never turn an unexpected response into a successful probe.
export async function waitForAdminAllJobsGate({
  fetchImpl = fetch,
  attempts = 6,
  delayMs = 10000,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onRetry = () => {},
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { attempt, probes: await checkAdminAllJobsGate(fetchImpl) };
    } catch (error) {
      if (attempt === attempts) throw error;
      onRetry({ attempt, message: error.message });
      await pause(delayMs);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await waitForAdminAllJobsGate({
      onRetry: ({ attempt, message }) => console.error(`All Jobs route check attempt ${attempt}/6: ${message}; retrying in 10s`),
    });
    console.log(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
