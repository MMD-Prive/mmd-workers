import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { travelClientBundle, travelClientCss } from '../shared/model-travel-client-source.mjs';
import { minify_sync } from 'terser';
import CleanCSS from 'clean-css';
import { normalizeModelDecline } from '../shared/model-decline-options.mjs';
import { openModelDecline } from '../webflow/sigil/model/model-console-decline-options.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'webflow/sigil/model');
const assets = path.join(source, 'console-atelier');
const names = { session: 'console-session-etching.svg', travel: 'console-travel-arc.svg', empty: 'console-no-session.svg', after: 'console-after-job.svg' };
export function buildConsoleEmbed() {
  const illustrations = Object.fromEntries(Object.entries(names).map(([key, file]) => [key, fs.readFileSync(path.join(assets, file), 'utf8').trim()]));
  const sprite = fs.readFileSync(path.join(assets, 'icons.svg'), 'utf8');
  illustrations.icons = Object.fromEntries([...sprite.matchAll(/<symbol id="([^"]+)"[^>]*>(.*?)<\/symbol>/gs)].map(([, id, body]) => [id, body]));
  const css = fs.readFileSync(path.join(source, 'model-console-atelier-v3.css'), 'utf8');
  const skin = fs.readFileSync(path.join(source, 'model-console-atelier-v3.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(source, 'model-console-v3-i18n.js'), 'utf8');
  const compactCss = new CleanCSS({ level: 2 }).minify(css + travelClientCss);
  if (compactCss.errors.length) throw new Error(compactCss.errors.join('; '));
  // Store repeated selectors once without changing their specificity or using
  // CSS nesting unsupported by older LIFF webviews. One guarded style owner.
  const prefix = '#sigil-model-console-v3[data-console-atelier]';
  const cssTemplate = compactCss.styles.replaceAll(prefix, '$ROOT$');
  const style = `if(!document.getElementById('mmd-console-lv9-css')){const s=document.createElement('style');s.id='mmd-console-lv9-css';s.textContent=${JSON.stringify(cssTemplate)}.replaceAll('$ROOT$',${JSON.stringify(prefix)});document.head.append(s);}`;
  const js = '(()=>{' + style + 'const consoleAtelierAssets=' + JSON.stringify(illustrations) + ';\n' + skin + '\n' + travelClientBundle() + '\n' + runtime + '\n})();';
  const compact = minify_sync(js, { compress: { passes: 2 }, mangle: { reserved: ['consoleAtelierAssets', 'renderConsoleAtelier'], properties: { regex: /^_tr/ } }, format: { comments: false, ascii_only: false } }).code;
  const embed = '<!-- MY MODEL LV9 travel + Console V3 -->\n<script>' + compact + '</script>';
  if (Buffer.byteLength(embed, 'utf8') >= 50000) throw new Error(`Console Embed exceeds 50,000 bytes: ${Buffer.byteLength(embed, 'utf8')}`);
  return embed;
}
export function assetManifest() {
  return { version: 'console-atelier-v3', delivery: 'inline SVG; no additional image requests', attribution: 'Project-authored geometry; job/support shapes reuse MY MODEL icon family', files: [...Object.values(names), 'icons.svg'].map(file => {
    const bytes = fs.readFileSync(path.join(assets, file));
    return { file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }) };
}
// A separate presentation embed avoids overflowing the existing Console Footer.
export function buildConsoleDeclineEmbed() {
  const code = '(()=>{const normalizeModelDecline=' + normalizeModelDecline.toString() + ';window.MMDConsoleDecline=' + openModelDecline.toString() + ';})();';
  return '<script>' + minify_sync(code, { compress: true, mangle: true }).code + '</script>';
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) throw new Error('Provide an explicit local output directory');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'model-console-atelier-v3.embed.html'), buildConsoleEmbed());
  fs.writeFileSync(path.join(out, 'asset-manifest.json'), JSON.stringify(assetManifest(), null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'model-console-decline-options.embed.html'), buildConsoleDeclineEmbed());
}
