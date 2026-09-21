import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(directory, name), "utf8");
const write = (name, value) => writeFileSync(join(directory, name), value);

const html = read("terms.html").trim();
const css = read("terms.css").trim();
const javascript = read("terms.js").trim();
const previousFooter = read("page-footer.html");
const faviconMarker = '<script>\n(function(){\n  var svg=';
const faviconStart = previousFooter.lastIndexOf(faviconMarker);

if (faviconStart < 0) {
  throw new Error("SĪGIL favicon script was not found in page-footer.html");
}

const favicon = previousFooter.slice(faviconStart).trim();
const head = [
  '<meta name="robots" content="noindex,nofollow">',
  '<meta name="theme-color" content="#0c0d0d">',
  '<style id="sigil-partner-terms-v7-css">',
  css,
  '</style>'
].join("\n");
const footer = `<script>\n${javascript}\n</script>\n${favicon}`;
const preview = [
  '<!doctype html>',
  '<html lang="th">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>SĪGIL Partner Terms · V4 Preview</title>',
  '<style>html,body{margin:0;padding:0;background:#0c0d0d}</style>',
  head,
  '</head>',
  '<body>',
  html,
  footer,
  '</body>',
  '</html>',
  ''
].join("\n");

write("page-head.html", `${head}\n`);
write("page-footer.html", `${footer}\n`);
write("preview.html", preview);

console.log(JSON.stringify({
  html: html.length,
  css: css.length,
  javascript: javascript.length,
  head: head.length,
  footer: footer.length
}));
