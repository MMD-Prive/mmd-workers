import { Container, getContainer } from "@cloudflare/containers";

import { handleExtractorRequest } from "./worker-core.mjs";

export class SlipExtractorContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "5m";
  enableInternet = false;
  pingEndpoint = "localhost/health";
}

export default {
  async fetch(request, env) {
    return handleExtractorRequest(request, env, { getContainer });
  }
};
