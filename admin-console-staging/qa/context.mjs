import { AsyncLocalStorage } from 'node:async_hooks';
export const scope = new AsyncLocalStorage();
export function fetch(input, init) {
  const current = scope.getStore();
  if (!current) throw new Error('fixture_scope_required');
  return current.fetch(input, init);
}
