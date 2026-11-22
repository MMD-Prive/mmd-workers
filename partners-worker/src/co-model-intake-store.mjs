// The transaction retries on contention. Only the committed attempt returns.
export function transactionalIntakeStore(storage) {
  return {
    update(id, change) {
      return storage.transaction(async tx => {
        const key = 'request:' + id;
        const previous = await tx.get(key);
        const [next, result] = change(previous);
        if (next && next !== previous) await tx.put(key, next);
        return result;
      });
    },
  };
}
