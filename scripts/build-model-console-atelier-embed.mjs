import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { travelClientBundle, travelClientCss } from '../shared/model-travel-client-source.mjs';
import { minify_sync } from 'terser';
import CleanCSS from 'clean-css';
import { normalizeModelDecline } from '../shared/model-decline-options.mjs';
import { openModelDecline } from '../webflow/sigil/model/model-console-decline-options.mjs';
import { mountConsoleHero } from '../webflow/sigil/model/model-console-hero.mjs';
import { installModelTravelReceiptNotice } from '../webflow/sigil/model/model-console-travel-receipt.mjs';
import { installConsoleCustomerUpdates } from '../webflow/sigil/model/model-console-customer-updates.mjs';
import {renderModelJobBrief} from '../webflow/sigil/model/model-job-brief.mjs';
import { LV15_FONT_FACES } from '../webflow/sigil/model/model-lv15-fonts.mjs';
import {mountMeetingDetails} from '../shared/model-meeting-client.mjs';
import {buildTartSkinEmbed,TART_REVIEW_ASSET_URL} from './build-model-lv15-skin.mjs';
import {buildLovableSkinEmbed} from './build-my-model-lovable-skin-embed.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'webflow/sigil/model');
const assets = path.join(source, 'console-atelier');
const names = { session: 'console-session-etching.svg', travel: 'console-travel-arc.svg', empty: 'console-no-session.svg', after: 'console-after-job.svg' };
export function consoleStyleSource(css) {
  // Lossless storage only: decoded CSS is byte-for-byte identical. Keep the
  // existing style owner and embed order; make room for the session guard.
  const tokens = [['$r', '#sigil-model-console-v3[data-console-atelier]'], ['$c', '.smcv3-'], ['$v', 'var(--ca-']];
  if (tokens.some(([token]) => css.includes(token))) throw new Error('Console CSS token collision');
  let packed = css;
  for (const [token, value] of tokens) packed = packed.replaceAll(value, token);
  const decoded = tokens.reduce((code, [token, value]) => code + `.replaceAll(${JSON.stringify(token)},${JSON.stringify(value)})`, JSON.stringify(packed));
  return `if(!document.getElementById('mmd-console-lv9-css')){const s=document.createElement('style');s.id='mmd-console-lv9-css';s.textContent=${decoded};document.head.append(s);}`;
}
function consoleAssets() {
  const illustrations = Object.fromEntries(Object.entries(names).map(([key, file]) => [key, fs.readFileSync(path.join(assets, file), 'utf8').trim()]));
  const sprite = fs.readFileSync(path.join(assets, 'icons.svg'), 'utf8');
  illustrations.icons = Object.fromEntries([...sprite.matchAll(/<symbol id="([^"]+)"[^>]*>(.*?)<\/symbol>/gs)].map(([, id, body]) => [id, body]));
  return illustrations;
}
export function buildConsoleEmbed() {
  const skin = fs.readFileSync(path.join(source, 'model-console-atelier-v3.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(source, 'model-console-v3-i18n.js'), 'utf8');
  const js = '(()=>{' + skin + '\n' + travelClientBundle(false,false) + '\n' + runtime + '\n})();';
  const compact = minify_sync(js, { compress: { passes: 3 }, mangle: { reserved: ['consoleAtelierAssets', 'renderConsoleAtelier'], properties: { regex: /^_tr/ } }, format: { comments: false, ascii_only: false } }).code;
  const embed = '<!-- MY MODEL LV9 travel + Console V3 -->\n<script>' + compact + '</script>';
  if (Buffer.byteLength(embed, 'utf8') >= 50000) throw new Error(`Console Embed exceeds 50,000 bytes: ${Buffer.byteLength(embed, 'utf8')}`);
  return embed;
}
export function assetManifest() {
  const tart=fs.readFileSync(path.join(root,'model-dashboard-presentation-worker/assets/tart-review.png'));
  const logo=fs.readFileSync(path.join(root,'model-dashboard-presentation-worker/assets/sigil-review-logo.png'));
  return { version: 'console-atelier-v3', delivery: 'inline SVG and same-origin TarT asset', externalAssets: [], servedAssets:[{role:'decorative-console-hero',url:TART_REVIEW_ASSET_URL,source:'model-dashboard-presentation-worker/assets/tart-review.png',bytes:tart.length,sha256:crypto.createHash('sha256').update(tart).digest('hex')},{role:'private-logo',url:'/sigil/model/dashboard-assets/sigil-review-logo.png',source:'model-dashboard-presentation-worker/assets/sigil-review-logo.png',bytes:logo.length,sha256:crypto.createHash('sha256').update(logo).digest('hex')}], attribution: 'Project-authored geometry; job/support shapes reuse MY MODEL icon family', files: [...Object.values(names), 'icons.svg'].map(file => {
    const bytes = fs.readFileSync(path.join(assets, file));
    return { file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }) };
}
// A separate presentation embed avoids overflowing the existing Console Footer.
export function buildConsoleDeclineEmbed() {
  const code = 'window.renderModelJobBrief='+renderModelJobBrief.toString()+';window.consoleAtelierAssets='+JSON.stringify(consoleAssets())+';(()=>{window.MMDMeetingDetails='+mountMeetingDetails.toString()+';const normalizeModelDecline=' + normalizeModelDecline.toString() + ';window.MMDConsoleDecline=' + openModelDecline.toString() + ';const mountConsoleHero=' + mountConsoleHero.toString() + ';const installModelTravelReceiptNotice=' + installModelTravelReceiptNotice.toString() + ';const installConsoleCustomerUpdates='+installConsoleCustomerUpdates.toString()+';installConsoleCustomerUpdates();if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>mountConsoleHero(),{once:true});else mountConsoleHero();installModelTravelReceiptNotice();})();';
  const fonts=LV15_FONT_FACES.filter(([family])=>['Outfit','Noto Sans Thai'].includes(family)).map(([family,weight,url,format])=>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url("${url}") format("${format}")}`).join('\n');
  const css = new CleanCSS({ level: 2 }).minify(fonts+'\n'+fs.readFileSync(path.join(source, 'model-console-atelier-v3.css'), 'utf8')+'\n'+travelClientCss+'\n'+fs.readFileSync(path.join(source, 'model-console-surfaces.css'), 'utf8'));
  if (css.errors.length) throw new Error(css.errors.join('; '));
  const embed = '<style>' + css.styles + '</style><script>' + minify_sync(code, { compress: true, mangle: true }).code + '</script>';
  if (Buffer.byteLength(embed, 'utf8') >= 50000) throw new Error('Console theme embed exceeds 50,000 bytes');
  return embed;
}
export function buildConsoleInstallBlocks(savedFooter) {
  const match = /<script\b[^>]*>[\s\S]*?<\/script>/i.exec(savedFooter);
  if (!savedFooter.startsWith('<!-- MY MODEL LV9 travel + Console V3 -->') || !match) throw new Error('Unknown Footer baseline');
  const tail = savedFooter.slice(match.index + match[0].length);
  if ((tail.match(/<script\b/gi) || []).length !== 2) throw new Error('Footer tail changed; inspect before assembling');
  const blocks = [
    { name: '01-console-form-and-theme.embed.html', content: buildConsoleDeclineEmbed() },
    { name: '02-console-runtime.embed.html', content: buildConsoleEmbed() },
    { name: '03-console-preserved-tail.embed.html', content: tail },
    { name: '04-console-lv15-skin.embed.html', content: buildTartSkinEmbed({consoleOnly:true}) },
  ];
  for (const block of blocks) {
    block.bytes = Buffer.byteLength(block.content);
    block.sha256 = crypto.createHash('sha256').update(block.content).digest('hex');
    if (block.bytes >= 50000) throw new Error(`${block.name} exceeds local 50,000 byte budget`);
  }
  return blocks;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) throw new Error('Provide an explicit local output directory');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'model-console-atelier-v3.embed.html'), buildConsoleEmbed());
  fs.writeFileSync(path.join(out, 'asset-manifest.json'), JSON.stringify(assetManifest(), null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'model-console-decline-options.embed.html'), buildConsoleDeclineEmbed());
  fs.writeFileSync(path.join(out, 'model-console-lv15-skin.embed.html'), buildTartSkinEmbed({consoleOnly:true}));
  fs.writeFileSync(path.join(out, 'my-model-lv15-skin.embed.html'), buildTartSkinEmbed());
  fs.writeFileSync(path.join(out, 'my-model-atelier-skin.embed.html'), buildLovableSkinEmbed());
  fs.mkdirSync(path.join(out,'assets'),{recursive:true});
  fs.copyFileSync(path.join(root,'model-dashboard-presentation-worker/assets/tart-review.png'),path.join(out,'assets/tart-review.png'));
  fs.copyFileSync(path.join(root,'model-dashboard-presentation-worker/assets/sigil-review-logo.png'),path.join(out,'assets/sigil-review-logo.png'));
  if (process.argv[3]) {
    const saved = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const blocks = buildConsoleInstallBlocks(saved.content);
    for (const block of blocks) fs.writeFileSync(path.join(out, block.name), block.content);
    fs.writeFileSync(path.join(out, 'install-manifest.json'), JSON.stringify({
      scope: 'local-only; ordered blocks replace one old runtime, never append a duplicate',
      baselineSha256: crypto.createHash('sha256').update(saved.content).digest('hex'),
      blocks: blocks.map(({ content, ...metadata }) => metadata),
    }, null, 2));
  }
}
