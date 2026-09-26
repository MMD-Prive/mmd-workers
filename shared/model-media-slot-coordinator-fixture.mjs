import { ModelMediaSlotCoordinator } from "./model-media-slot-coordinator.mjs";

export function modelMediaSlotCoordinatorFixture() {
  const instances = new Map();
  return {
    idFromName(name) { return String(name); },
    get(id) {
      if (!instances.has(id)) {
        const values = new Map();
        let queue = Promise.resolve();
        const state = { storage: {
          get: async (key) => values.get(key),
          put: async (key, value) => { values.set(key, value); },
          transaction: async (callback) => callback({
            get: async (key) => values.get(key),
            put: async (key, value) => { values.set(key, value); },
          }),
        } };
        const durableObject = new ModelMediaSlotCoordinator(state);
        instances.set(id, {
          values,
          fetch(request, init) {
            const task = queue.then(() => durableObject.fetch(request instanceof Request ? request : new Request(request, init)));
            queue = task.catch(() => {});
            return task;
          },
        });
      }
      return instances.get(id);
    },
    instances,
  };
}
