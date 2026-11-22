// Node-only replacements for the Cloudflare runtime base classes.
export const cloudflareFixture = {
  name: 'cloudflare-fixture',
  setup(build) {
    build.onResolve({filter:/^cloudflare:workers$/}, () => ({path:'workers',namespace:'cloudflare-fixture'}));
    build.onLoad({filter:/.*/,namespace:'cloudflare-fixture'}, () => ({
      contents: 'class Base { constructor(ctx, env) { this.ctx = ctx; this.env = env; } } export { Base as DurableObject, Base as WorkerEntrypoint };',
    }));
  },
};
