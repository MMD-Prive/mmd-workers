import fs from 'node:fs';
import {mountModelNightline} from '../webflow/sigil/model/model-nightline.mjs';
const base=new URL('../webflow/sigil/model/',import.meta.url);
export function buildModelNightlineSkin(){
 const fonts=fs.readFileSync(new URL('nightline/font-faces.css',base),'utf8');
 const css=fs.readFileSync(new URL('model-nightline.css',base),'utf8');
 const logo='data:image/webp;base64,'+fs.readFileSync(new URL('nightline/sigil-logo.webp',base)).toString('base64');
 // Keep each asset block independent rather than enlarging the existing runtime embed.
 const blocks=[...fonts.matchAll(/@font-face\{[^}]+\}/g)].map(([rule])=>'<style>'+rule+'</style>');
 blocks.push('<style>'+css+'</style>');
 blocks.push('<script>(()=>{const start=()=>('+mountModelNightline.toString()+')(document,'+JSON.stringify(logo)+');if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();})();</script>');
 for(const block of blocks)if(Buffer.byteLength(block)>=50000)throw Error('Nightline skin block exceeds 50KB');
 return blocks.join('\n');
}
