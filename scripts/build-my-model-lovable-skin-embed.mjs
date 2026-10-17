import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url));
const read=name=>fs.readFileSync(path.join(repo,'webflow/sigil/model',name),'utf8');
export function buildLovableSkinEmbed(){
 const css=read('my-model-lovable-vnext-skin-20261017.css');
 const js=read('my-model-lovable-vnext-skin-20261017.js');
 return '<style id="my-model-lovable-vnext-skin-20261017">\n'+css+'\n</style>\n<script id="my-model-lovable-vnext-skin-20261017">\n'+js+'\n</script>\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dest=process.argv[2];if(!dest)throw Error('Usage: node scripts/build-my-model-lovable-skin-embed.mjs /absolute/output.html');
 const html=buildLovableSkinEmbed();if(Buffer.byteLength(html,'utf8')>=50000)throw Error('Webflow embed >50KB');
 fs.writeFileSync(dest,html);console.log(dest);
}
