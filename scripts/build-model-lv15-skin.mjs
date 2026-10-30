import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import CleanCSS from 'clean-css';
import {minify_sync} from 'terser';
import {LV15_CSS,installModelLv15} from '../webflow/sigil/model/model-lv15-presentation.mjs';
export function buildLv15Embed(){
 const css=new CleanCSS({level:1}).minify(LV15_CSS);
 if(css.errors.length)throw new Error(css.errors.join('; '));
 const js=minify_sync(`(${installModelLv15.toString()})(document);`,{compress:true,mangle:true,format:{ascii_only:false}});
 if(js.error)throw js.error;
 const result='<style id="my-model-lv15-presentation">'+css.styles+'</style><script>'+js.code.replace(/<\/script/gi,'<\\/script')+'</script>';
 if(Buffer.byteLength(result)>=50000)throw new Error('LV15 presentation embed exceeds 50,000 bytes');
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw new Error('Provide a local output file');
 const embed=buildLv15Embed();fs.writeFileSync(process.argv[2],embed);console.log('LV15 presentation:',Buffer.byteLength(embed),'bytes');
}
