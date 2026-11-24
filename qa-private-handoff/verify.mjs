import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile(new URL('./manifest.json',import.meta.url),'utf8'));
let checked=0;
for(const worker of manifest.workers) {
  for(const [path,expected] of Object.entries(worker.files)) {
    const bytes=await readFile(new URL('./deployed/'+worker.worker+'/'+path,import.meta.url));
    if(createHash('sha256').update(bytes).digest('hex')!==expected) throw Error('Snapshot mismatch '+worker.worker+'/'+path);
    checked++;
  }
}
console.log('Verified '+checked+' deployed module hashes');
