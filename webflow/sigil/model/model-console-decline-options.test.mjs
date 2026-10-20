import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { openModelDecline } from './model-console-decline-options.mjs';
test('calendar offers at most three slots, prevents double submit and retains failed input', async () => {
  const dom = new JSDOM('<section><div data-primary-actions></div></section>');
  const old = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    let calls=0, resolve;
    const root=document.querySelector('section');
    openModelDecline(root, () => {calls++; return new Promise(r=>resolve=r);});
    openModelDecline(root, () => {throw Error('duplicate form');});
    assert.equal(root.querySelectorAll('form').length,1);
    const form=root.querySelector('form'), add=form.querySelector('button');
    add.click(); add.click(); add.click();
    assert.equal(form.querySelectorAll('input').length,3);
    assert.equal(add.disabled,true);
    const input=form.querySelector('input');
    input.value='2099-10-22T12:00';
    const submit=()=>form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    submit(); submit();
    assert.equal(calls,1);
    resolve(false); await new Promise(r=>setTimeout(r,0));
    assert.equal(input.value,'2099-10-22T12:00');
    assert.match(form.querySelector('[role=status]').textContent,/ยังไม่บันทึก/);
    form.querySelectorAll('button')[2].click();
    assert.equal(root.querySelector('form'),null);
  } finally {globalThis.document=old; dom.window.close();}
});
