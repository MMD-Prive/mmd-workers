import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const read = name => readFileSync(join(dir, name), 'utf8');
const head = '<meta name="theme-color" content="#160d08">\n<meta name="referrer" content="same-origin">\n<style id="mmd-referral-lv15">\n' + read('referral.css') + '\n</style>\n';
const footer = '<script id="mmd-referral-lv15-js">\n' + read('referral.js') + '\n</script>\n';
const preview = '<!doctype html>\n<html lang="th" data-wf-page="6a6affbb7583793304d749de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>แนะนำนายแบบ · SĪGIL Partner · LV15 Preview</title>\n' + head + '\n<script defer src="https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-i18n@main/assets/i18n/i18n.dict.js"></script>\n<script defer src="https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-i18n@main/assets/i18n/i18n.core.v21.js"></script>\n</head><body>\n' + read('referral.html') + '\n' + footer + '</body></html>\n';
for (const [file, content] of Object.entries({ 'page-head.html': head, 'page-footer.html': footer, 'preview.html': preview })) {
  if (process.argv.includes('--check')) {
    if (read(file) !== content) throw new Error('Generated file is stale: ' + file);
  } else writeFileSync(join(dir, file), content);
}
console.log(process.argv.includes('--check') ? 'Derived files are current.' : 'Derived files rebuilt.');
