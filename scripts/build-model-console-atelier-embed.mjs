import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
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
  return '<!-- Console V3 presentation candidate; not a deployment receipt -->\n<style>' + css + '</style>\n<script>(()=>{const consoleAtelierAssets=' + JSON.stringify(illustrations) + ';\n' + skin + '\n' + runtime + '\n})();</script>';
}
export function assetManifest() {
  return { version: 'console-atelier-v3', delivery: 'inline SVG; no additional image requests', attribution: 'Project-authored geometry; job/support shapes reuse MY MODEL icon family', files: [...Object.values(names), 'icons.svg'].map(file => {
    const bytes = fs.readFileSync(path.join(assets, file));
    return { file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) throw new Error('Provide an explicit local output directory');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'model-console-atelier-v3.embed.html'), buildConsoleEmbed());
  fs.writeFileSync(path.join(out, 'asset-manifest.json'), JSON.stringify(assetManifest(), null, 2) + '\n');
}
