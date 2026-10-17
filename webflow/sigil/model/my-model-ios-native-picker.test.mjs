import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBundle } from '../../../scripts/build-my-model-workspace-bundle.mjs';

const source = fs.readFileSync(new URL('./dashboard-home-media-20261015.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./my-model-workspace-20261016.css', import.meta.url), 'utf8');
const bundle = buildBundle();
const media = bundle.match(/<script id="my-model-media-bundle-20261016">([\s\S]*?)<\/script>/)?.[1] || '';

test('Public and Private have native, full-width iOS tap surfaces', () => {
  for (const [label, input] of [
    ['Public', 'mmu-files'],
    ['Private', 'mmu-private-files'],
  ]) {
    assert.ok(source.includes('<label class="mmu-native-picker"><span>เลือกไฟล์ ' + label + '</span><input id="' + input + '" type="file"'));
    assert.match(source, new RegExp('id="' + input + '" type="file" multiple'));
  }
  assert.equal((source.match(/class="mmu-native-picker"/g) || []).length, 2);
  assert.match(css, /\.mmu-native-picker input\[type=file\]\{[^}]*position:absolute!important;[^}]*opacity:0!important;/);
  assert.match(css, /\.mmu-native-picker>span\{[^}]*color:#fff!important;/);
  assert.doesNotMatch(css, /\.mmu-native-picker input\[type=file\]\{[^}]*display:none/);
});

test('file selection never relies on a programmatic picker in a LINE WebView', () => {
  assert.doesNotMatch(source, /(?:input|privateInput)\.(?:click|showPicker)\s*\(/);
  assert.doesNotMatch(media, /(?:input|privateInput)\.(?:click|showPicker)\s*\(/);
  assert.match(source, /input\.addEventListener\('change'/);
  assert.match(source, /privateInput\.addEventListener\('change'/);
  assert.match(source, /button\.hidden=button\.disabled/);
  assert.match(source, /privateButton\.hidden=privateButton\.disabled/);
  assert.match(css, /:is\(#mmu-upload,#mmu-private-upload\)\[hidden\]\{display:none!important\}/);
});

test('native input is selection only; upload and approval remain protected', () => {
  assert.match(source, /<button id="mmu-upload" type="button" disabled hidden>/);
  assert.match(source, /<button id="mmu-private-upload" type="button" disabled hidden>/);
  assert.match(source, /button\.addEventListener\('click',async/);
  assert.match(source, /privateButton\.addEventListener\('click',async/);
  assert.match(source, /if\(!privateConsent\.checked\)throw new Error/);
  assert.match(source, /\/v1\/model\/media\/upload-url/);
  assert.match(source, /\/v1\/model\/media\/private-upload-plan/);
  assert.match(source, /MAX_BYTES=25\*1024\*1024/);
  assert.doesNotMatch(source, /supabase|localStorage|fetch\('https:\/\/api\.airtable/i);
});

test('bundle still single-mounts v4, parses and fits Webflow embed budget', () => {
  assert.match(media, /mmd-model-home-v4/);
  assert.match(media, /mmd:model-workspace-locked/);
  assert.match(media, /root\.remove\(\)/);
  for (const tag of bundle.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(tag[1]);
  assert.ok(Buffer.byteLength(bundle, 'utf8') < 50000);
});
