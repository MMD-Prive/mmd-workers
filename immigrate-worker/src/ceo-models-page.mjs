import { modelsClient } from './ceo-models-client.mjs';

// Scoped to the existing authenticated CEO Models response. No route/auth changes.
export const MODELS_CSS = `
html body #model-supply-v3{--bg:#fff;--panel:#fff;--panel2:#fff;--text:#27313b;--body:#27313b;--muted:#545c66;--gold:#27313b;--gold2:#91420d;--line:#c7ccd2;--line2:#c7ccd2;--good:#286442;--warn:#895209;--bad:#a12535;--hold:#895209;background:#fff!important;color:#27313b!important}
html body #model-supply-v3 :is(article,.msv3-card,.msv3-review-shell,.msv3-mini,.msv3-review,.msv3-box,.msv3-av,.msv3-row,.msv3-metric,.msv3-media-item,.msv3-avatar,input,textarea){background:#fff!important;border-color:#c7ccd2!important;color:#27313b!important}
html body #model-supply-v3 :is(p,small,span,label,.msv3-empty){color:#545c66!important;-webkit-text-fill-color:currentColor!important}
html body #model-supply-v3 :is(h1,h2,h3,h4,strong,b){color:#27313b!important;-webkit-text-fill-color:currentColor!important}
html body #model-supply-v3 .msv3-btn{background:#ffdab0!important;border-color:#c7833c!important;color:#27313b!important;-webkit-text-fill-color:#27313b!important}
html body #model-supply-v3 .msv3-btn.is-bad{background:#fff!important;color:#a12535!important;-webkit-text-fill-color:#a12535!important;border-color:#a12535!important}
html body #model-supply-v3 :is(button,a,input,textarea):focus-visible{outline:3px solid #91420d;outline-offset:3px}
html body #model-supply-v3 button:disabled{background:#edf0f3!important;opacity:1!important;cursor:wait}
html body #model-supply-v3 .msv3-family{grid-template-columns:repeat(auto-fit,minmax(135px,1fr))}
html body #model-supply-v3 .msv3-state{white-space:normal;line-height:1.5}
html body #model-supply-v3 .msv3-section-head{flex-wrap:wrap}
html body #model-supply-v3 .msv3-lightbox-close{background:#fff!important;color:#27313b!important}
html body #sigil-workspace-directory,html body #sigil-workspace-directory :is(nav,summary){background:#fff!important;color:#27313b!important;-webkit-text-fill-color:#27313b!important;border-color:#c7ccd2!important}
html body #sigil-workspace-directory :is(a,span,h3,strong){color:#27313b!important;-webkit-text-fill-color:#27313b!important}
html body #sigil-workspace-directory a:is(:hover,[aria-current=page]){background:#ffdab0!important}
html body #mmdK{position:relative!important;inset:auto!important;width:auto!important;max-width:100%!important;margin:16px!important;background:#fff!important;color:#27313b!important;border:1px solid #c7ccd2!important;box-shadow:none!important}
html body #mmdK :is(a,span,strong){color:#27313b!important;-webkit-text-fill-color:#27313b!important}
@media(max-width:640px){html body #model-supply-v3 .msv3-supply{grid-template-columns:repeat(3,minmax(0,1fr))}html body #model-supply-v3 .msv3-family{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

export async function decorateCeoModels(request, response) {
  if(request.method !== 'GET' || new URL(request.url).pathname.replace(/\/$/,'') !== '/internal/ceo/models' || !response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
  let html = await response.text();
  // Replace the inline owner-review runtime once; keep the original markup and CTAs.
  const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].filter(m => m[0].includes('var r=document.getElementById("model-supply-v3")'));
  if(scripts.length !== 1) return new Response(html,response);
  html = html.replace(scripts[0][0],()=>`<script data-ceo-models-runtime="v1">(${modelsClient.toString()})();</script>`)
    .replace('</head>',`<style data-ceo-models-theme="v1">${MODELS_CSS}</style></head>`)
    .replace('TOTAL INVENTORY','รายการที่โหลด').replace('MULTI-LANE','หลายประเภทในชุดนี้').replace('ASSET READY</span>','สื่อพร้อมในชุดนี้</span>');
  // Initial server markup must not present zeroes before the API resolves.
  html=html.replace(/(<[^>]+data-(?:family="[^"]+"|total(?:="")?|multi(?:="")?|ready(?:="")?)[^>]*>)0(<\/[^>]+>)/g,'$1—$2');
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('etag');
  headers.set('x-mmd-ceo-models-ui','readable-v1');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
