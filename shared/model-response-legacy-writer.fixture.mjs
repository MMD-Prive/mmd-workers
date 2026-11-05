import {readFileSync} from 'node:fs';
// Exercise the actual writer in this checkout rather than a historical copy.
// Fail closed if the extraction boundaries change; never silently use stale code.
const source=readFileSync(new URL('../admin-worker/src/index.js',import.meta.url),'utf8');
const startMarker='async function handleModelSessionAction(req, env) {';
const endMarker='\nfunction schemaPatchError(';
const start=source.indexOf(startMarker);
const end=source.indexOf(endMarker,start);
if(start<0||end<0||source.indexOf(startMarker,start+1)!==-1) {
 throw new Error('Model response writer fixture boundaries changed; review current source');
}
export const legacyHandlerSource=source.slice(start,end).trimEnd()+'\n';
