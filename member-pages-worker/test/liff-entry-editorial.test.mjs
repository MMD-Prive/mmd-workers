import test from 'node:test';
import assert from 'node:assert/strict';
import {ENTRY_EDITORIAL_CSS,renderEditorialEntry} from '../src/liff-entry-editorial.js';
import {PUBLIC_PERSONAL_MAIN_IMAGES} from '../src/liff-personal-main-public-images.js';

test('signed-out editorial entry uses only approved Public portraits and preserves the single runtime-owned login action',()=>{
  const html=renderEditorialEntry();
  assert.equal((html.match(/id="intro-continue"/g)||[]).length,1);
  assert.equal((html.match(/data-entry-language=/g)||[]).length,3);
  assert.match(html,/<button id="intro-continue"[^>]*aria-expanded="false" disabled>/);
  assert.match(html,/id="intro-title"/);
  const images=[...html.matchAll(/<img src="([^"]+)" alt="([^"]+) · Companion"/g)];
  assert.deepEqual(images.map(x=>x[2]),['HIMA','HIRO','HIEI','HITO']);
  assert.deepEqual(images.map(x=>x[1]),['hima','hiro','hiei','hito'].map(id=>PUBLIC_PERSONAL_MAIN_IMAGES[id]));
  assert.match(ENTRY_EDITORIAL_CSS,/body\[data-brand-audience="private"\] #intro-screen \.entry-ed-photo::before/);
  assert.doesNotMatch(ENTRY_EDITORIAL_CSS,/data-world[^}]*entry-private-portrait/);
  assert.doesNotMatch(html,/data-pm-choice|data-pm-skip|onclick=|<script|<form|localStorage|sessionStorage/);
});

test('entry locales translate login, explanatory and privacy copy while retaining brand names and safe fallback',()=>{
 const th=renderEditorialEntry('th'),en=renderEditorialEntry('en'),zh=renderEditorialEntry('zh');
 assert.match(en,/data-entry-continue="Continue with LINE"/);assert.match(zh,/data-entry-continue="通过 LINE 登录"/);
 assert.match(en,/Stay signed in on this device for 30 days/);assert.match(zh,/此设备可保持登录状态 30 天/);
 assert.doesNotMatch(en,/ยืนยันผ่าน LINE|ทุกนัดหมาย|ออกจากระบบ/);assert.doesNotMatch(zh,/ยืนยันผ่าน LINE|ทุกนัดหมาย|ออกจากระบบ/);
 for(const html of [th,en,zh]){assert.match(html,/SĪGIL system/);assert.match(html,/Discreet by desire,<br>Elegance by choice/);assert.doesNotMatch(html,/M \/ M|entry-ed-star|entry-ed-index/);}
 assert.equal(renderEditorialEntry('unknown'),th);
});
