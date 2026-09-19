export function createSerializedClaimOp(store) {
  let queue = Promise.resolve();
  return async (claim, audit) => {
    let release;
    const turn = new Promise((resolve) => { release = resolve; });
    const previous = queue;
    queue = turn;
    await previous;
    try {
      const existing = await store.findByIdentity(claim.identityHash);
      if (existing) return { existing };
      return { created: await store.create(claim, audit) };
    } finally {
      release();
    }
  };
}
