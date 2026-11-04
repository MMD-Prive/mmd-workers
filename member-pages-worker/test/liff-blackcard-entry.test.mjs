import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { handleLiffMemberShell } from '../src/liff-member-shell.js';

const html = await handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff?intent=status')).text();

test('public Black Card entry is outside the locked member profile, inside main', () => {
  const stack = [];
  const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  let found = 0;
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  for (const match of markup.matchAll(/<(\/?)([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const [, closing, rawTag, attrs] = match;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const index = stack.map(item => item.tag).lastIndexOf(tag);
      if (index >= 0) stack.length = index;
      continue;
    }
    if (/id="digital-blackcard-entry"/.test(attrs)) {
      found++;
      assert.ok(stack.some(item => item.tag === 'main'));
      assert.ok(!stack.some(item => /id="profile"/.test(item.attrs)), 'inert profile must not block public navigation');
    }
    if (!voidTags.has(tag) && !/\/$/.test(attrs)) stack.push({tag, attrs});
  }
  assert.equal(found, 1);
  assert.match(html, /id="digital-blackcard-entry"><a href="\/my-mmd\/payments\/blackcard"/);
  assert.match(html, /profile\.inert = true/);
  assert.match(html, /profile\.inert = false/);
});

test('entry follows home navigation while member reads stay gated during account resolution', () => {
  const start = html.indexOf('function showView(view, smooth = true)');
  const end = html.indexOf('showView(initialView, false)', start);
  for (const ready of [false, true]) {
    const entry = {hidden:false}, calls = [];
    const panels = Object.fromEntries(['home','history-panel','account'].map(id => [id, {id, setAttribute(){}}]));
    const scope = {
      document:{getElementById(id){return id === 'digital-blackcard-entry' ? entry : panels[id];},querySelectorAll(){return [];}},
      profileReady:ready, accountUI:{load(){calls.push('account');}},
      hydrateMemberHome(id){calls.push(id);}, window:{scrollTo(){},location:{assign(){}}},
    };
    runInNewContext(html.slice(start, end) + ';showView("history", false);', scope);
    assert.equal(entry.hidden, true);
    runInNewContext('showView("home", false)', scope);
    assert.equal(entry.hidden, false);
    if (!ready) assert.deepEqual(calls, []);
    else assert.deepEqual(calls, ['history','home']);
  }
});
