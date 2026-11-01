import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { renderStudioPage } from '../webflow/internal/admin/studio/studio-flow-v2-pages.mjs';
import { STUDIO_READABLE_CSS } from '../webflow/global/sigil-studio-readable-v1.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(repo, 'webflow/internal/admin/studio');
export const STUDIO_WEBFLOW_PAGES = Object.freeze({
  home: { page_id: '6a6e22f9f96d8a3a8fd56969', primary_embed: 'aacc27b1-94c4-77dd-f3b1-7e1bbdfbb200' },
  upload: { page_id: '6a1be738a8018a51046e5335', primary_embed: '17c03bad-4842-88e3-1fbe-d993f771cc89' },
  review: { page_id: '6a189ff7358e501d524bcce8', primary_embed: '513ec88f-7572-8345-1aa3-648e950baa62' },
  preview: { page_id: '6a137a1836f0137aa0e08da9', primary_embed: '9a7f02b3-a2a1-f3b4-83e5-a9f805abe1b0' },
});
const load = file => readFile(path.join(dir, file), 'utf8');
const script = (id, code) => `<script id="${id}">${code.replace(/<\/script/gi, '<\\/script')}</script>`;
const fonts = '@font-face{font-family:"LINE Seed Sans TH";src:url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6ad83f14320ae2c638b156c8_LINESeedSansTH_W_Rg.woff2") format("woff2");font-weight:400;font-display:swap}@font-face{font-family:"LINE Seed Sans TH";src:url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6ad83f191ba517237b6eaa0c_LINESeedSansTH_W_Bd.woff2") format("woff2");font-weight:700;font-display:swap}';
const isolation = '#mmdStudioR5,#mmdStudioUploadR5,#mmdStudioOnsenVisual{display:none!important}#studioFlow[data-studio-flow]{font-family:"LINE Seed Sans TH","Noto Sans Thai",Tahoma,system-ui,sans-serif!important}body:has(#studioFlow){background:#fff!important;color:#27313b!important}#studioFlow #mmd-auto-card-inbox{background:#fff!important;color:#27313b!important;border:0!important}#studioFlow #mmd-auto-card-inbox :is(p,span,small,strong,h2,a){color:#27313b!important;-webkit-text-fill-color:#27313b!important}';
const aiOps = '<script data-mmd-ai-ops-loader>(()=>{const p=location.pathname.replace(/\\/+$/,\'\')||\'/\';if(!p.startsWith(\'/internal/admin/\'))return;const s=document.createElement(\'script\');s.src=\'/v1/admin/ai-ops/client.js?v=1\';s.defer=true;s.dataset.mmdAiOps=\'v1\';document.head.appendChild(s)})();</script>';

export async function buildStudioFlowPackage() {
  const [css, controller, renderer, inboxHtml, inboxCss, inboxJs] = await Promise.all([
    load('studio-flow-v2.css'), load('studio-flow-v2.js'), load('studio-flow-renderer-v2.js'),
    load('auto-card-inbox.html'), load('auto-card-inbox.css'), load('auto-card-inbox.js'),
  ]);
  const pages = {};
  for (const [stage, ids] of Object.entries(STUDIO_WEBFLOW_PAGES)) {
    let markup = renderStudioPage(stage);
    if (stage === 'upload') markup = markup.replace('<div id="sfAutoInboxSlot" class="sf-details-body"></div>', `<div id="sfAutoInboxSlot" class="sf-details-body">${inboxHtml}</div>`);
    const head = `<meta name="robots" content="noindex,nofollow"><meta name="studio-flow-version" content="2"><style id="studio-flow-v2-css">${fonts}\n${stage === 'upload' ? inboxCss : ''}\n${STUDIO_READABLE_CSS}\n${css}\n${isolation}</style>`;
    const embed = markup + '\n' + script('studio-flow-v2-controller', controller);
    const footer = script('studio-flow-v2-renderer', renderer) + (stage === 'upload' ? script('mmd-auto-card-inbox-js-v1', inboxJs) : '') + aiOps;
    for (const [location, content] of Object.entries({ head, embed, footer })) {
      if (content.length > 50000) throw new Error(`${stage}.${location} exceeds Webflow custom-code limit`);
    }
    pages[stage] = { ...ids, head, embed, footer };
  }
  return { site_id: '68f879d546d2f4e2ab186e90', version: 2, pages };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] || '/tmp/studio-flow-v2-package');
  const release = await buildStudioFlowPackage();
  await mkdir(out, { recursive: true });
  const manifest = { site_id: release.site_id, version: release.version, publication: 'not_published', pages: {} };
  for (const [stage, page] of Object.entries(release.pages)) {
    manifest.pages[stage] = { page_id: page.page_id, primary_embed: page.primary_embed, blocks: {} };
    for (const location of ['head', 'embed', 'footer']) {
      const file = `${stage}.${location}.html`;
      await writeFile(path.join(out, file), page[location]);
      manifest.pages[stage].blocks[location] = { file, characters: page[location].length, sha256: createHash('sha256').update(page[location]).digest('hex') };
    }
  }
  await writeFile(path.join(out, 'release.json'), JSON.stringify(release));
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ output: out, pages: manifest.pages }, null, 2));
}
