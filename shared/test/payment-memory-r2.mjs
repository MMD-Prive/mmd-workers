// Models R2 conditional writes and pagination, including conflict -> null.
export function memoryR2() {
  const objects = new Map();
  let version = 0;
  return {
    objects,
    async put(key, value, options = {}) {
      const current = objects.get(key);
      if (options.onlyIf?.etagDoesNotMatch === "*" && current) return null;
      if (options.onlyIf?.etagMatches && current?.etag !== options.onlyIf.etagMatches) return null;
      const stored = { value, etag: `version-${++version}`, httpMetadata: options.httpMetadata || {} };
      objects.set(key, stored);
      return { key, etag: stored.etag };
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        etag: object.etag, httpMetadata: object.httpMetadata,
        async text() { return typeof object.value === "string" ? object.value : new TextDecoder().decode(object.value); },
        async arrayBuffer() { return typeof object.value === "string" ? new TextEncoder().encode(object.value).buffer : object.value; },
      };
    },
    async head(key) { const object = objects.get(key); return object ? { etag: object.etag } : null; },
    async delete(key) { objects.delete(key); },
    async list({ prefix = "", limit = 1000, cursor = "" } = {}) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix) && key > cursor).sort();
      const page = keys.slice(0, limit);
      return { objects: page.map((key) => ({ key })), truncated: keys.length > page.length, cursor: page.at(-1) };
    },
  };
}
