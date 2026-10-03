import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const read=n=>readFile(new URL(n,import.meta.url),'utf8');
export async function build(){
 const source=await read('source/lv10-runtime-v11.js');
 const runtime=source.slice(source.indexOf('<script'));
 const composer=await read('source/lv11-owner-composer-v1.js');
 return (await read('template.html')).replace('<!-- STYLES -->','<style>'+await read('base.css')+'</style><style>'+await read('source/lv11-owner-composer-v1.css')+'</style>').replace('<!-- SCRIPTS -->',runtime+'\n<script>'+await read('source/model-search-case-alias-fix-v8.js')+'</script>\n'+composer.slice(composer.indexOf('<script')));
}
if(process.argv[1]===fileURLToPath(import.meta.url)) await writeFile(new URL('review.html',import.meta.url),await build());
