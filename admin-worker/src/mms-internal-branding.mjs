import { MMS_LOGO_PATH } from './mms-internal-logo-asset.mjs';
const logo = `<span class="mms-ai-brand" aria-label="Male Massage AI"><img src="${MMS_LOGO_PATH}" alt="Male Massage AI" width="1983" height="793" decoding="async"></span>`;
export function withMmsInternalBranding(html) {
 const branded=html.replace(/<img class="brand"[^>]*alt="MMS Male Massage"[^>]*>/,logo).replace('<span class="brand">SĪGIL | SYSTEM</span>',logo);
 if(branded===html) throw Error('MMS internal brand slot missing');
 return branded.replace('</head>',`<style id="mms-internal-approved-logo">.mms-ai-brand{display:inline-flex;align-items:center;flex:0 1 240px;width:240px;max-width:100%;padding:10px 12px;background:#14231b;border-radius:14px;line-height:0}.mms-ai-brand img{display:block;width:100%;height:auto;max-width:100%;object-fit:contain;aspect-ratio:1983/793}.top:has(.mms-ai-brand),.brand-row:has(.mms-ai-brand){flex-wrap:wrap;gap:12px}</style></head>`);
}
