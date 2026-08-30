import { Container, getContainer } from "@cloudflare/containers";

import { handleExtractorRequest } from "./worker-core.mjs";

export class SlipExtractorContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";
  envVars = {
    NODE_ENV: "production",
    PORT: "8080",
    MMD_SLIP_EXTRACTOR_MAX_BYTES: "4194304"
  };
  entrypoint = ["/usr/local/bin/node", "/app/cloudflare/container-server.mjs"];
  enableInternet = false;

  onStart() {
    console.log(JSON.stringify({ event: "mmd_slip_extractor_container_started", port: 8080 }));
  }

  onStop({ exitCode, reason } = {}) {
    console.log(JSON.stringify({
      event: "mmd_slip_extractor_container_stopped",
      exit_code: exitCode ?? null,
      reason: reason ?? "unknown"
    }));
  }

  onError(error) {
    console.error(JSON.stringify({
      event: "mmd_slip_extractor_container_lifecycle_error",
      message: error instanceof Error ? error.message : String(error)
    }));
  }
}

export default {
  async fetch(request, env) {
    return handleExtractorRequest(request, env, { getContainer });
  }
};
