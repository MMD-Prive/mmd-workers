import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {travelClientBundle,travelClientCss} from '../shared/model-travel-client-source.mjs';
import {minify_sync} from 'terser';
export function buildConfirmationTravel(){
  const code=travelClientBundle()+`;window.MMDMountConfirmationTravel=(root,options)=>{let host=root.querySelector('[data-confirmation-travel]');if(!host){host=document.createElement('section');host.dataset.confirmationTravel='1';root.append(host);}return mountTravelPanel(host,options);};`;
  return '<style>'+travelClientCss+'</style><script>(()=>{'+minify_sync(code,{compress:true,mangle:true}).code+'})();</script>';
}
export function buildConfirmationInstallBlocks(){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const blocks=[{name:'01-customer-confirmation-travel.embed.html',content:buildConfirmationTravel()},
    {name:'02-customer-session-tracker.embed.html',content:'<script>'+fs.readFileSync(path.join(root,'webflow/sigil/confirm/customer-session-tracker-v2.js'),'utf8')+'</script>'}];
  for(const block of blocks)if(Buffer.byteLength(block.content)>=50000)throw Error('Confirmation embed exceeds 50000 bytes');
  return blocks;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Explicit local output directory required');
  fs.mkdirSync(process.argv[2],{recursive:true});fs.writeFileSync(path.join(process.argv[2],'customer-confirmation-travel.embed.html'),buildConfirmationTravel());
  for(const block of buildConfirmationInstallBlocks())fs.writeFileSync(path.join(process.argv[2],block.name),block.content);
}
