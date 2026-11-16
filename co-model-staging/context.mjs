import {AsyncLocalStorage} from 'node:async_hooks';
export const scope=new AsyncLocalStorage();
export function fetch(input,init){const f=scope.getStore();if(!f)throw Error('fixture_scope_required');return f(input,init);}
