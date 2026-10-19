import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import test from 'node:test';
import { assetManifest, buildConsoleEmbed } from '../../../scripts/build-model-console-atelier-embed.mjs';
import { buildLovableSkinEmbed } from '../../../scripts/build-my-model-lovable-skin-embed.mjs';

test('both surface manifests identify the shipped graphics and retain the shared accent budget', () => {
  let accents = 0;
  for (const surface of ['atelier', 'console-atelier']) {
    const manifest = JSON.parse(fs.readFileSync(new URL(`./${surface}/manifest.json`, import.meta.url)));
    for (const entry of manifest.files) {
      const bytes = fs.readFileSync(new URL(`./${surface}/${entry.file}`, import.meta.url));
      assert.equal(entry.bytes, bytes.length);
      assert.equal(entry.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
      if (entry.file === 'icons.svg') continue;
      accents += bytes.length;
      const svg = bytes.toString();
      assert.match(svg, /stroke="currentColor"/);
      assert.match(svg, /aria-hidden="true" focusable="false"/);
      assert.match(svg, /pointer-events:none/);
      assert.doesNotMatch(svg, /<(?:script|image|foreignObject|text|font)\b|\bon\w+\s*=|(?:href|src)\s*=|data:|url\(/i);
    }
  }
  assert.ok(accents <= 24576);
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('./console-atelier/manifest.json', import.meta.url))), assetManifest());
});

test('refreshed accents reach both bounded embeds without removing the LV9 client', () => {
  for (const [surface, embed] of [['atelier', buildLovableSkinEmbed()], ['console-atelier', buildConsoleEmbed()]]) {
    assert.ok(Buffer.byteLength(embed) < 50000);
    const manifest = JSON.parse(fs.readFileSync(new URL(`./${surface}/manifest.json`, import.meta.url)));
    for (const entry of manifest.files.filter(e => e.file !== 'icons.svg')) {
      const svg = fs.readFileSync(new URL(`./${surface}/${entry.file}`, import.meta.url), 'utf8');
      // Check geometry rather than quote style, which the minifier may change.
      for (const [, geometry] of svg.matchAll(/ d="([^"]+)"/g)) assert.ok(embed.includes(geometry), entry.file);
    }
    assert.match(embed, /\/v1\/model\/session\/travel/);
  }
});
