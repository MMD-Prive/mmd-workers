import { ModelActivationCoordinator } from './src/model-first-time-activation.js';

// Use the real Durable Object implementation, with one instance per object name.
export function installReviewTestCoordinator(env) {
  const objects = new Map();
  env.MODEL_ACTIVATION_COORDINATOR = {
    idFromName: name => name,
    get: name => {
      if (!objects.has(name)) {
        let tail = Promise.resolve();
        const state = { blockConcurrencyWhile(fn) {
          const result = tail.then(fn); tail = result.catch(() => {}); return result;
        } };
        objects.set(name, new ModelActivationCoordinator(state, env));
      }
      return { fetch: (url, init) => objects.get(name).fetch(new Request(url, init)) };
    },
  };
  return env;
}
