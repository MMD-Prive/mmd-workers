import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { mountConsoleHero } from './model-console-hero.mjs';
import { buildConsoleDeclineEmbed, buildConsoleEmbed } from '../../../scripts/build-model-console-atelier-embed.mjs';

test('Hero mount is idempotent and preserves existing Console nodes and controls', () => {
  const dom = new JSDOM('<html lang="th"><body><section id="sigil-model-console-v3"><div class="smcv3-shell"><header class="smcv3-head"></header><div data-view="error"><button>Retry</button></div></div></section></body></html>');
  try {
    const doc = dom.window.document;
    const error = doc.querySelector('[data-view="error"]');
    const head = doc.querySelector('.smcv3-head');
    head.innerHTML = '<button data-lang="en">EN</button><span data-chip>Loading</span>';
    const language = head.querySelector('button');
    let languageClicks = 0;
    language.addEventListener('click', () => languageClicks++);
    const button = error.querySelector('button');
    let clicks = 0;
    button.addEventListener('click', () => clicks++);
    const hero = mountConsoleHero(doc);
    assert.equal(mountConsoleHero(doc), hero);
    assert.equal(doc.querySelectorAll('[data-ca-hero]').length, 1);
    assert.equal(doc.querySelector('#sigil-model-console-v3').firstElementChild, hero);
    assert.equal(hero.querySelector('.smcv3-head'), head);
    assert.equal(hero.querySelector('[data-lang="en"]'), language);
    language.click();
    assert.equal(languageClicks, 1);
    assert.equal(doc.querySelector('[data-view="error"]'), error);
    button.click();
    assert.equal(clicks, 1);
    assert.equal(hero.querySelector('img').alt, '');
    assert.match(hero.querySelector('h2').textContent, /ติดตามงาน/);
  } finally { dom.window.close(); }
});

test('Hero follows the existing document language without adding another language control', async () => {
  const dom = new JSDOM('<html lang="en"><body><section id="sigil-model-console-v3"><div class="smcv3-shell"></div></section></body></html>');
  try {
    const hero = mountConsoleHero(dom.window.document);
    assert.equal(hero.querySelector('h2').textContent, 'Your work. One clear view.');
    dom.window.document.documentElement.lang = 'zh-CN';
    await Promise.resolve();
    assert.equal(hero.querySelector('h2').textContent, '工作进展，一目了然');
    assert.equal(hero.querySelector('button,a,input,form'), null);
  } finally { dom.window.close(); }
});

test('Missing Console shell is a no-op; Hero ships in the theme embed within its budget', () => {
  const dom = new JSDOM('<main>Unrelated page</main>');
  try { assert.equal(mountConsoleHero(dom.window.document), null); }
  finally { dom.window.close(); }
  const theme = buildConsoleDeclineEmbed();
  const runtime = buildConsoleEmbed();
  assert.ok(Buffer.byteLength(theme) < 50000);
  assert.ok(Buffer.byteLength(runtime) < 50000);
  assert.match(theme, /6abe1dcae59e7e03c06d950b/);
  assert.doesNotMatch(runtime, /smcv3-hero-title/);
  for (const [, code] of theme.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(code);
});
