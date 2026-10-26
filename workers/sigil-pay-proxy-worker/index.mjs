import { QR_LIBRARY } from './qr-library.mjs';
// Presentation ingress only. Payment APIs and signed-link authority stay in payments-worker.
export const LIFF_ID = '2010830159-0n1O3ANK';
export const UPSTREAM = 'https://www.mmdbkk.com/sigil/pay';
const MAX_HTML_BYTES = 512 * 1024;

export function tokenFromSearch(search) {
  const params = new URLSearchParams(search);
  const direct = (params.get('t') || '').trim();
  if (direct) return direct;
  let state = (params.get('liff.state') || params.get('liff_state') || '').trim();
  if (!state) return '';
  // URLSearchParams already decoded the outer query. Allow one legacy extra layer.
  if (/^%[23]/i.test(state)) {
    try { state = decodeURIComponent(state); } catch { return ''; }
  }
  // A LIFF state can contain a path, e.g. /?t=..., rather than only ?t=....
  if (/^[a-z][a-z0-9+.-]*:/i.test(state) || state.startsWith('//')) return '';
  if (!state.startsWith('/') && !state.startsWith('?')) state = '?' + state;
  try {
    const url = new URL(state, 'https://sigil.mmdbkk.com');
    if (url.origin !== 'https://sigil.mmdbkk.com' || url.username || url.password) return '';
    return (url.searchParams.get('t') || '').trim();
  } catch { return ''; }
}

const PRIVATE_QR = "function privatePaymentQr(url){\n    var u=new URL(url);\n    if(u.origin!==\"https://promptpay.io\")return url;\n    var match=u.pathname.match(/^\\/(\\d{10}|\\d{13})\\/(\\d{1,9}\\.\\d{2})\\.png$/);\n    if(!match)throw new Error(\"invalid_promptpay_qr\");\n    var ref=match[1],amount=match[2];\n    var account=ref.length===10?\"01130066\"+ref.slice(1):\"0213\"+ref;\n    var merchant=\"0016A000000677010111\"+account;\n    function tlv(id,value){return id+String(value.length).padStart(2,\"0\")+value;}\n    var payload=\"000201010212\"+tlv(\"29\",merchant)+\"5303764\"+tlv(\"54\",amount)+\"5802TH6304\";\n    var crc=65535;\n    for(var i=0;i<payload.length;i++){crc^=payload.charCodeAt(i)<<8;for(var j=0;j<8;j++)crc=(crc&32768)?((crc<<1)^4129)&65535:(crc<<1)&65535;}\n    payload+=crc.toString(16).toUpperCase().padStart(4,\"0\");\n    var code=qrcode(0,\"M\");code.addData(payload,\"Byte\");code.make();\n    return \"data:image/svg+xml;charset=utf-8,\"+encodeURIComponent(code.createSvgTag({cellSize:5,margin:20,scalable:true}));\n  }\n";
const TOKEN_FUNCTION = `function tokenFromUrl(){return (${tokenFromSearch.toString()})(location.search);}`;
export function patchPaymentRuntime(source) {
  if (!source.includes('document.getElementById("sigil-pay-v21")')) return source;
  const start = source.indexOf('  function tokenFromUrl(){');
  const end = source.indexOf('\n  function text(', start);
  if (start < 0 || end < 0 || !/\n  load\(\);\s*\}\)\(\);\s*$/.test(source)) {
    throw new Error('payment_runtime_contract_changed');
  }
  source=source.replace('  function renderQr(){','  '+PRIVATE_QR+'\n  function renderQr(){')
    .replaceAll('pp.enabled===true&&clean(pp.display_ref)!==""','pp.enabled===true&&!!safeHttps(pp.qr_url)')
    .replace('if(qrUrl)qr.src=qrUrl;else qr.removeAttribute("src");','if(qrUrl){try{qr.src=privatePaymentQr(qrUrl);}catch(e){qr.hidden=true;if(qrFallback)qrFallback.hidden=false;}}else qr.removeAttribute("src");qr.onerror=function(){qr.hidden=true;if(qrFallback)qrFallback.hidden=false;};')
    .replace(/    text\("\[data-sp21-promptpay-ref(?:-inline)?\]"[^\n]*\n/g,'');
  const patchedStart=source.indexOf('  function tokenFromUrl(){');
  const patchedEnd=source.indexOf('\n  function text(',patchedStart);
  return (source.slice(0, patchedStart) + '  ' + TOKEN_FUNCTION + '\n' + source.slice(patchedEnd))
    .replace(/\n  load\(\);(\s*\}\)\(\);\s*)$/, `
  Promise.resolve(window.__sigilPayReady).then(function(ready){
    if(ready===false){
      showError("เปิดผ่าน LINE ไม่สำเร็จครับ","กรุณาปิดหน้านี้แล้วเปิดจากลิงก์ล่าสุดอีกครั้ง");
      return;
    }
    load();
  });$1`);
}

export const BOOTSTRAP = `<script data-sigil-pay-liff>
(function(){
  var required=/Line\\//i.test(navigator.userAgent)||/[?&]liff[._]/.test(location.search);
  if(!required){window.__sigilPayReady=Promise.resolve(true);return;}
  window.__sigilPayReady=new Promise(function(resolve){
    var done=false;
    var timer=setTimeout(function(){finish(false);},15000);
    function finish(ok){if(done)return;done=true;clearTimeout(timer);resolve(ok);}
    function init(){
      if(!window.liff){finish(false);return;}
      Promise.resolve().then(function(){return window.liff.init({liffId:"${LIFF_ID}"});})
        .then(function(){finish(true);},function(){finish(false);});
    }
    if(window.liff){init();return;}
    var sdk=document.createElement('script');
    sdk.src='https://static.line-scdn.net/liff/edge/2/sdk.js';sdk.charset='utf-8';
    sdk.onload=init;sdk.onerror=function(){finish(false);};document.head.appendChild(sdk);
  });
})();
</script>`;

export async function readBounded(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_HTML_BYTES) { await reader.cancel(); throw new Error('payment_html_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function prepareHtml(html) {
  let patched = false;
  const result = html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi, (all, open, code, close) => {
    if (!code.includes('document.getElementById("sigil-pay-v21")')) return all;
    patched = true;
    return open + QR_LIBRARY + '\n' + patchPaymentRuntime(code) + close;
  });
  if (!patched || !/<\/head>/i.test(result)) throw new Error('payment_page_contract_changed');
  return result.replace(/<div class="sp21__qr-ref">[\s\S]*?<\/div>/g,'')
    .replace(/<small>PromptPay<\/small>\s*<strong data-sp21-promptpay-ref>[\s\S]*?<\/strong>/g,'โหลด QR ไม่สำเร็จ กรุณาลองใหม่หรือเลือกโอนธนาคาร')
    .replace(/<\/head>/i, BOOTSTRAP + '</head>');
}

export async function handle(request, fetcher = fetch, rewriter = () => new HTMLRewriter()) {
  const url = new URL(request.url);
  const headers = {
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-mmd-route-source': 'sigil-pay-proxy-worker',
    'x-sigil-pay-liff-id': LIFF_ID
  };
  if (url.hostname !== 'sigil.mmdbkk.com' || !/^\/sigil\/pay\/?$/.test(url.pathname)) {
    return new Response('Not found', {status: 404, headers});
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', {status: 405, headers: {...headers, allow: 'GET, HEAD'}});
  }
  try {
    // Never send the signed token, LIFF credentials, cookies or authorization to Webflow.
    const upstream = await fetcher(UPSTREAM, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: {accept: 'text/html'}, cf: {cacheTtl: 0, cacheEverything: false}
    });
    if (upstream.status !== 200 || !/^text\/html\b/i.test(upstream.headers.get('content-type') || '')) {
      await upstream.body?.cancel();
      throw new Error('payment_upstream_unavailable');
    }
    const html = prepareHtml(await readBounded(upstream));
    const response = new Response(request.method === 'HEAD' ? null : html, {
      headers: {...headers, 'content-type': 'text/html; charset=utf-8'}
    });
    if (request.method === 'HEAD') return response;
    return rewriter().on('a[href]', {element(element) {
      const href = element.getAttribute('href');
      if (href?.startsWith('/') && !href.startsWith('//')) {
        element.setAttribute('href', new URL(href, UPSTREAM).href);
      }
    }}).transform(response);
  } catch {
    return new Response('เปิดหน้าชำระเงินไม่ได้ชั่วคราว กรุณาลองอีกครั้ง', {
      status: 503, headers: {...headers, 'content-type': 'text/plain; charset=utf-8', 'retry-after': '30'}
    });
  }
}

export default {fetch(request) { return handle(request); }};
