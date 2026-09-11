// Compatibility-only module for older deploy checks.
// Production remains pinned to admin-login-hero-worker.js; Payment Review is
// handled inside that canonical credential-bound admin entrypoint.
import adminWorker from "./admin-login-hero-worker.js";

export {
  KenjiKnowledgeCoordinator,
  ModelActivationCoordinator,
  ModelLocationCoordinator,
} from "./admin-login-hero-worker.js";

export default adminWorker;
