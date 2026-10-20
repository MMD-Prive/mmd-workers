import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const file=process.argv[2];assert(file,'Pass compiled Worker file');const code=await readFile(file,'utf8');
assert([...code.matchAll(/export\s*\{([^}]+)\}/g)].some(m=>/\bGuideOwnerNotifications\b/.test(m[1])),'Compiled Worker lost GuideOwnerNotifications RPC export');
assert(code.includes('notifyGuideRequest'),'Compiled Worker lost guide send method');
console.log('PASS compiled Worker retains guide notification RPC');
