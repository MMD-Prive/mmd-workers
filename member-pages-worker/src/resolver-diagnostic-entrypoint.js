import { WorkerEntrypoint } from "cloudflare:workers";

import { runMemberResolverDiagnostic } from "./member-resolver-diagnostic.js";

export class MemberResolverDiagnosticEntrypoint extends WorkerEntrypoint {
  async runMemberResolverDiagnostic() {
    return runMemberResolverDiagnostic(this.env, arguments.length);
  }
}
