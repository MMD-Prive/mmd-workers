import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify_sync } from 'terser';
import CleanCSS from 'clean-css';
import { travelClientBundle, travelClientCss } from '../shared/model-travel-client-source.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const read=name=>fs.readFileSync(path.join(repo,'webflow/sigil/model',name),'utf8');
export function validateAtelierAssets(assets){
 const limits={'current-job-etching':[8192,'0 0 240 144'],'no-current-job':[6144,'0 0 240 112'],'media-review-motif':[5120,'0 0 160 96'],icons:[12288,'0 0 24 24']};
 let accentBytes=0;
 for(const [name,[limit,viewBox]] of Object.entries(limits)){
  const svg=assets[name];
  if(typeof svg!=='string'||!svg.startsWith('<svg'))throw Error('Missing SVG: '+name);
  const bytes=Buffer.byteLength(svg,'utf8');
  if(bytes>limit)throw Error('SVG byte budget exceeded: '+name);
  if(!svg.includes('viewBox="'+viewBox+'"'))throw Error('Unexpected SVG viewBox: '+name);
  if(/<(?:script|image|foreignObject|text|filter|mask)\b|\bon\w+\s*=|\b(?:href|src)\s*=|data:|url\(/i.test(svg))throw Error('Non-geometric SVG: '+name);
  if(name!=='icons')accentBytes+=bytes;
 }
 if(accentBytes>24576)throw Error('Combined accent budget exceeded');
 for(const name of ['home','jobs','console','you','profile','media','availability','support']){
  const symbol=assets.icons.match(new RegExp('<symbol id="'+name+'"[^>]*>[\\s\\S]*?</symbol>'));
  if(!symbol||Buffer.byteLength(symbol[0],'utf8')>2048)throw Error('Missing or oversized icon: '+name);
 }
}
export function buildLovableSkinEmbed(){
 const css=read('my-model-lovable-vnext-skin-20261017.css');
 const assets=Object.fromEntries(['current-job-etching','no-current-job','media-review-motif','icons'].map(name=>[name,read('atelier/'+name+'.svg').trim()]));
 validateAtelierAssets(assets);
 const js=read('my-model-lovable-vnext-skin-20261017.js').replace('/* MY_MODEL_ATELIER_ASSETS */{}',JSON.stringify(assets));
 const compactCss=new CleanCSS({level:2}).minify(css+travelClientCss);
 if(compactCss.errors.length)throw Error(compactCss.errors.join('; '));
 const prefix='#mmd-model-home-v4#mmd-model-home-v4';
 const template=compactCss.styles.replaceAll(prefix,'$ROOT$');
 const init=`if(!document.querySelector('style[id="my-model-lovable-vnext-skin-20261017"]')){const s=document.createElement('style');s.id='my-model-lovable-vnext-skin-20261017';s.textContent=${JSON.stringify(template)}.replaceAll('$ROOT$',${JSON.stringify(prefix)});document.head.append(s);}`;
 const script=minify_sync('(()=>{'+init+travelClientBundle(true)+'\n'+js+'})();',{compress:{passes:2},mangle:{properties:{regex:/^_tr/}},format:{comments:false,ascii_only:false,quote_style:2}}).code;
 const embed='<script id="my-model-lovable-vnext-skin-20261017">\n'+script+'\n</script>\n';
 if(Buffer.byteLength(embed,'utf8')>=50000)throw Error('Webflow skin >50KB: '+Buffer.byteLength(embed,'utf8'));
 return embed;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dest=process.argv[2];if(!dest)throw Error('Usage: node scripts/build-my-model-lovable-skin-embed.mjs /absolute/output.html');
 const html=buildLovableSkinEmbed();if(Buffer.byteLength(html,'utf8')>=50000)throw Error('Webflow embed >50KB');
 fs.writeFileSync(dest,html);console.log(dest);
}
