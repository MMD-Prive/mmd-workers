// Uninstalled glue seam: no env flag, binding, route or credential is introduced.
// The supplied handler/provider owns authorization and durable coordination.
// Enabling this seam in a fixture does not authorize a production release.
export function createModelResponseRuntime({legacy, enabled = false, createHandler} = {}) {
  if (typeof legacy !== 'function') throw new TypeError('legacy handler required');
  if (enabled !== true) return (request, env, ctx) => legacy(request, env, ctx);
  if (typeof createHandler !== 'function') throw new TypeError('response provider required');
  // Keep provider construction lazy: the default/closed path has no new effects.
  let handler;
  return (request, env, ctx) => {
    handler ??= createHandler();
    if (typeof handler !== 'function') throw new TypeError('response handler required');
    return handler(request, env, ctx);
  };
}
