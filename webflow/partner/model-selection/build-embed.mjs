import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { minify } = require(process.env.MMD_BUILD_TERSER_PATH || "terser");
const capture = "(function(){'use strict';var p=new URLSearchParams(location.hash.slice(1)),id=p.get('s'),token=p.get('t'),valid=/^[a-f0-9]{32}$/.test(id||'');if(p.has('t')){try{if(valid&&/^[A-Za-z0-9_-]{43}$/.test(token||''))sessionStorage.setItem('mmd-shortlist:'+id,token);else if(valid)sessionStorage.removeItem('mmd-shortlist:'+id)}catch{}try{history.replaceState(null,'',location.pathname+location.search+(valid?'#s='+id:''))}catch{}}})();";
let html = await fs.readFile(path.join(dir, "index.html"), "utf8");
// Capture credentials before any canonical third-party dictionary script runs.
if (!html.includes('data-shortlist-capture')) {
  html = html.replace('<meta name="theme-color"', '<script data-shortlist-capture>' + capture + '</script>\n<meta name="theme-color"');
  await fs.writeFile(path.join(dir, "index.html"), html);
}
html = html.replace(/<style>([\s\S]*?)<\/style>/g, (_, css) => "<style>" + css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim() + "</style>");
let parts = [], cursor = 0;
for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  parts.push(html.slice(cursor, match.index));
  if (/\bsrc=/.test(match[1])) parts.push(match[0]);
  else {
    const output = await minify(match[2], { compress: { passes: 2 }, mangle: true, format: { comments: false, ascii_only: false } });
    parts.push("<script" + match[1] + ">" + output.code.replace(/<\/script/gi, "<\\/script") + "</script>");
  }
  cursor = match.index + match[0].length;
}
parts.push(html.slice(cursor));
html = parts.join("").replace(/>\s+</g, "><").trim();
const encode = value => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const version = createHash("sha256").update(html).digest("hex").slice(0, 16);
const split = Math.floor(html.length / 2);
const first = encode(html.slice(0, split)), second = encode(html.slice(split));
const head = '<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#30251f"><script>' + capture + '</script><script>window.__MMD_SHORTLIST_SOURCE__={version: ' + JSON.stringify(version) + ',part:' + first + '};</script><style>html,body{overflow:hidden}#mmd-pero-shortlist-root{color:#382a21;-webkit-text-fill-color:#382a21}#mmd-pero-shortlist-frame{color-scheme:light}</style>';
const footer = '<div id="mmd-pero-shortlist-root"><iframe id="mmd-pero-shortlist-frame" title="คัดไว้สำหรับงานนี้ · MMD Privé" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" allow="clipboard-write" style="position:fixed;inset:0;width:100%;height:100vh;height:100dvh;border:0;display:block;background:#f4efe6;z-index:2147483000"></iframe></div><script>(function(){"use strict";var frame=document.getElementById("mmd-pero-shortlist-frame"),p=new URLSearchParams(location.hash.slice(1)),id=p.get("s"),token=null;try{if(/^[a-f0-9]{32}$/.test(id||""))token=sessionStorage.getItem("mmd-shortlist:"+id)}catch{}var access=token&&/^[A-Za-z0-9_-]{43}$/.test(token)?{id:id,token:token}:null;window.addEventListener("message",function(e){if(e.source!==frame.contentWindow||e.origin!==location.origin||!e.data)return;if(e.data.type==="mmd-shortlist-ready")frame.contentWindow.postMessage({type:"mmd-shortlist-access",access:access},location.origin);if(e.data.type==="mmd-shortlist-clear"){try{if(id)sessionStorage.removeItem("mmd-shortlist:"+id)}catch{}access=null}});var seed=window.__MMD_SHORTLIST_SOURCE__;if(!seed||seed.version!==' + JSON.stringify(version) + '){document.getElementById("mmd-pero-shortlist-root").textContent="กรุณาโหลดหน้าอีกครั้งค่ะ";return}frame.srcdoc=seed.part+' + second + ';delete window.__MMD_SHORTLIST_SOURCE__;})();</script>';
if (head.length > 50000) throw new Error("Webflow head exceeds 50,000 characters: " + head.length);
if (footer.length > 50000) throw new Error("Webflow footer exceeds 50,000 characters: " + footer.length);
await fs.writeFile(path.join(dir, "head.html"), head + "\n");
await fs.writeFile(path.join(dir, "footer.html"), footer + "\n");
await fs.writeFile(path.join(dir, "page.min.html"), html + "\n");
console.log(JSON.stringify({ headCharacters: head.length, footerCharacters: footer.length, pageCharacters: html.length }));
