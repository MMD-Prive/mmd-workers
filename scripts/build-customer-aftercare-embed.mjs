import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {minify_sync} from 'terser';
import CleanCSS from 'clean-css';
import {LV15_FONT_FACES} from '../webflow/sigil/model/model-lv15-fonts.mjs';
import {SYSTEM_DARK} from '../webflow/global/sigil-brand-v1.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url));
export function buildCustomerAftercareEmbed(){
  const read=name=>fs.readFileSync(path.join(repo,'webflow/aftercare',name),'utf8');
  const fonts=LV15_FONT_FACES.filter(([family])=>family!=='Canela').map(([family,weight,url,format])=>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url("${url}") format("${format}")}`).join('\n');
  const css=new CleanCSS({level:1}).minify(fonts+'\n'+read('customer-aftercare-v2.css'));
  if(css.errors.length)throw new Error(css.errors.join('; '));
  const runtime=read('customer-aftercare-v2.js').replace('<!--MMD_AFTERCARE_BRAND-->',SYSTEM_DARK);
  const js=minify_sync(runtime,{compress:true,mangle:true,format:{comments:false,ascii_only:false}}).code;
  const embed='<style id="mmd-aftercare-base-v2-styles">'+css.styles+'</style><script>'+js+'</script>';
  if(Buffer.byteLength(embed)>=50000)throw new Error('Aftercare embed exceeds 50,000 bytes');
  return embed;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw new Error('Provide an explicit local output file');
  fs.writeFileSync(process.argv[2],buildCustomerAftercareEmbed());
}
