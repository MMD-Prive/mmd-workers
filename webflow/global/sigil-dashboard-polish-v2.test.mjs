import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DASHBOARD_POLISH_CSS } from './sigil-dashboard-polish-v2.mjs';

// Split selectors only at top-level commas, preserving :is() and :has().
function selectors(value) {
  let depth = 0, start = 0;
  const result = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(' || value[i] === '[') depth++;
    if (value[i] === ')' || value[i] === ']') depth--;
    if (value[i] === ',' && depth === 0) { result.push(value.slice(start, i).trim()); start = i + 1; }
  }
  result.push(value.slice(start).trim());
  return result;
}
test('every visual rule requires the internal theme and dashboard root, excluding MMS and other pages', () => {
  const css = DASHBOARD_POLISH_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/(?:^|[{}])\s*([^{}]+)\{/g)].map(m => m[1].trim()).filter(s => !s.startsWith('@'));
  assert.ok(rules.length > 50);
  for (const rule of rules) for (const selector of selectors(rule)) {
    assert.ok(selector.startsWith('html[data-sigil-internal-theme="silver-orange-v1"]'), selector);
    assert.ok(selector.includes('#adm27'), selector);
  }
});
test('module remains a single CSS export without operational JavaScript', () => {
  const source = readFileSync(new URL('./sigil-dashboard-polish-v2.mjs', import.meta.url), 'utf8');
  const withoutComments = source.replace(/\/\/[^\n]*/g, '').trim();
  assert.match(withoutComments, /^export const DASHBOARD_POLISH_CSS = String\.raw`[\s\S]*`;$/);
  assert.ok(!DASHBOARD_POLISH_CSS.includes('${'));
  assert.ok(!/\b(?:display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none)/.test(DASHBOARD_POLISH_CSS.slice(DASHBOARD_POLISH_CSS.indexOf('/* Dashboard-only cascade protection'))));
});
function luminance(hex) {
  const channels = hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
}
test('text remains AA-readable on white, button states and disabled surfaces', () => {
  for (const [fg,bg] of [['545c66','ffffff'],['272b30','fed7aa'],['272b30','fdba74'],['272b30','fb923c'],['545c66','edf0f3'],['7c3b0b','fff7ed']]) {
    const a=luminance(fg), b=luminance(bg);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5, `${fg} on ${bg}`);
  }
});
