import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify_sync } from 'terser';
import CleanCSS from 'clean-css';
import { LV15_FONT_FACES } from '../webflow/sigil/model/model-lv15-fonts.mjs';
import {renderModelJobBrief} from '../webflow/sigil/model/model-job-brief.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const source = name => fs.readFileSync(path.join(repo, 'webflow/sigil/model', name), 'utf8');
export function buildBundle() {
  const media = source('dashboard-home-media-20261015.js')
    // Current owner policy distinguishes ordinary self-managed Public media from
    // Private approval. Preserve backend policy; do not promise a review state.
    .replace('ไฟล์ชุดนี้เป็น Public candidate และจะยังไม่แสดงต่อสาธารณะจนกว่า Studio จะอนุมัติ คลิปไม่บังคับ ส่งรูปก่อนได้', 'ไฟล์ชุดนี้เป็น Public media ตามสิทธิ์ของบัญชี ดูสถานะล่าสุดหลังส่ง คลิปไม่บังคับ ส่งรูปก่อนได้')
    .replace('ส่งแล้ว · รอ Studio ตรวจ', 'ส่งแล้ว · อ่านสถานะล่าสุดจากระบบ')
    .replace("!document.getElementById('mmd-model-home-v3')", "!document.getElementById('mmd-model-home-v4')")
    .replace("document.querySelector('#mmd-model-self-service .mss__shell')||document.getElementById('mmd-model-home-v3')", "document.querySelector('[data-mm-media-host]')")
    .replace("window.addEventListener('pagehide',()=>{", "const stopUploads=()=>{")
    .replace("privateQueue=[];privateInput.value='';});", "privateQueue=[];privateInput.value='';};const lockUploads=()=>{stopUploads();root.remove();window.removeEventListener('pagehide',stopUploads);window.removeEventListener('mmd:model-workspace-locked',lockUploads);};window.addEventListener('pagehide',stopUploads);window.addEventListener('mmd:model-workspace-locked',lockUploads);")
    .replace("window.addEventListener('mmd:model-session-ready',()=>readBack().catch(error=>say(error.message,true)));", '');
  if (!media.includes('const stopUploads=') || !media.includes('root.remove();')) throw new Error('media cleanup source changed; review build adapter');
  const fonts=LV15_FONT_FACES.filter(([family])=>['Outfit','Noto Sans Thai'].includes(family)).map(([family,weight,url,format])=>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url("${url}") format("${format}")}`).join('\n');
  const runtime=minify_sync('(()=>{const renderModelJobBrief='+renderModelJobBrief.toString()+';'+source('my-model-workspace-20261016.js')+'})();',{compress:{passes:3},mangle:true,format:{comments:false,ascii_only:false}}).code;
  const compactMedia=minify_sync(media,{compress:{passes:3},mangle:{reserved:['root']},format:{comments:false,ascii_only:false}}).code;
  const css=new CleanCSS({level:2}).minify(fonts+'\n'+source('my-model-workspace-20261016.css'));
  if(css.errors.length)throw new Error(css.errors.join('; '));
  const embed=source('my-model-workspace-20261016.html').replace(/>\s+</g,'><') + '\n<style>\n' + css.styles + '\n</style>\n' +
    '<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>\n' +
    '<script id="my-model-media-bundle-20261016">window.addEventListener("mmd:model-profile-ready",()=>{\n' + compactMedia + '\n});</script>\n' +
    '<script id="my-model-workspace-bundle-20261016">\n' + runtime + '\n</script>\n';
  if(Buffer.byteLength(embed)>=50000)throw new Error('MY MODEL embed exceeds 50,000 bytes: '+Buffer.byteLength(embed));
  return embed;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = process.argv[2];
  if (!destination) throw new Error('Usage: node scripts/build-my-model-workspace-bundle.mjs /absolute/output.html');
  fs.writeFileSync(destination, buildBundle());
  console.log(destination);
}
