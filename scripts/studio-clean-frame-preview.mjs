// Local-only visual QA: no model data, external requests or production writes.
import http from "node:http";
import { readFile } from "node:fs/promises";

const studio = new URL("../webflow/internal/admin/studio/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("frames/clean-v1/manifest.json", studio), "utf8"));
const checker = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><defs><pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="#244456"/><rect width="50" height="50" fill="#52849b"/><rect x="50" y="50" width="50" height="50" fill="#52849b"/></pattern></defs><rect width="600" height="800" fill="url(#grid)"/><rect x="12" y="12" width="576" height="776" fill="none" stroke="#fff" stroke-width="8"/><text x="300" y="390" text-anchor="middle" fill="white" font-family="Arial" font-size="42">SOURCE PHOTO</text><text x="300" y="450" text-anchor="middle" fill="white" font-family="Arial" font-size="26">Whole image · no filters</text></svg>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Studio clean frames — local QA</title><style>body{margin:0;padding:24px;background:#171717;color:#eee;font:16px system-ui}h1{font-size:24px}p{max-width:900px}section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{min-width:0}h2{font-size:16px}.qa-card{width:100%}label{display:block;margin:20px 0}input{padding:8px;width:80px}@media(max-width:700px){body{padding:12px}section{grid-template-columns:1fr}}</style></head><body><h1>Studio clean frames · local QA</h1><p>Seven exact owner assets. Asset numbers 3–5 await owner mapping; no model classification is inferred. A synthetic source image checks photo visibility and full-image containment.</p><label>EMs / GWs Run Number <input id="run" value="007" maxlength="3" inputmode="numeric"></label><section>${manifest.assets.map(a => `<article><h2>Asset ${a.number} · ${a.field || "mapping pending"} · ${a.accent}</h2><div class="qa-card" id="frame-${a.number}"></div></article>`).join("")}</section><script src="/studio-clean-frame-renderer.js"></script><script>const assets=${JSON.stringify(manifest.assets)};function render(){for(const a of assets){window.MMDStudioCleanFrame.render(document.getElementById('frame-'+a.number),{...a,url:'/frames/clean-v1/'+a.asset_file},'url("/qa-source.svg")',{model:'TEST MODEL',height:'178',weight:'66',run:document.getElementById('run').value})}}render();document.getElementById('run').addEventListener('input',render);</script></body></html>`;

const allowed = new Map([
  ["/", { body: html, type: "text/html; charset=utf-8" }],
  ["/qa-source.svg", { body: checker, type: "image/svg+xml" }],
  ["/studio-clean-frame-renderer.js", { file: new URL("studio-clean-frame-renderer.js", studio), type: "application/javascript" }],
  ...manifest.assets.map(a => ["/frames/clean-v1/" + a.asset_file, { file: new URL("frames/clean-v1/" + a.asset_file, studio), type: "image/png" }]),
]);
const server = http.createServer(async (req, res) => {
  const asset = allowed.get(new URL(req.url, "http://127.0.0.1").pathname);
  if (!asset || !["GET", "HEAD"].includes(req.method)) { res.writeHead(404); res.end(); return; }
  try {
    const body = asset.body ?? await readFile(asset.file);
    res.writeHead(200, { "content-type": asset.type, "cache-control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch { res.writeHead(500); res.end(); }
});
server.listen(4179, "127.0.0.1", () => console.log("Studio frame QA: http://127.0.0.1:4179"));
