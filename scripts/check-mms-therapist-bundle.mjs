import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const bundlePath = process.argv[2];
assert.ok(bundlePath, 'pass the Wrangler dry-run bundle path');

// Node cannot import Cloudflare's runtime module. The stub is enough for a GET
// of the public Therapist shell; no service bindings or credentials are used.
const bundle = readFileSync(bundlePath, 'utf8');
const cloudflareImport = 'import { WorkerEntrypoint } from "cloudflare:workers";';
assert.ok(bundle.includes(cloudflareImport), 'expected Cloudflare Worker bundle');
const runnable = bundle.replace(cloudflareImport, 'class WorkerEntrypoint {}');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(runnable).toString('base64')}`);

const response = await worker.fetch(
  new Request('https://www.mmdbkk.com/male-massage/therapists/me'),
  { MMS_THERAPIST_UI_SOURCE: 'native' },
);
assert.equal(response.status, 200);
assert.equal(response.headers.get('x-mmd-ui-source'), 'mms-native-workspace-v1');

const html = await response.text();
assert.match(html, /id="availability"/);
assert.match(html, /id="coverage-zones"/);
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(inlineScripts.length, 1, 'expected one standalone browser script');

const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) elements.set(id, {
    children: [], dataset: {}, hidden: id === 'workspace', disabled: false,
    textContent: '', className: '', value: '', style: {},
    setAttribute() {}, append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
  });
  return elements.get(id);
};
const calls = [];
const context = {
  document: {
    getElementById: element,
    createElement: name => element(Symbol(name)),
    querySelectorAll: () => [],
    querySelector: () => ({ dataset: { login: 'false' } }),
  },
  fetch: async (url) => {
    calls.push(url);
    return Response.json({ ok: false, error: { code: 'THERAPIST_SESSION_REQUIRED' } }, { status: 401 });
  },
  Response, AbortController, setTimeout, clearTimeout, window: {},
  location: { assign() {} },
};

vm.runInNewContext(inlineScripts[0][1], context, { filename: 'mms-therapist-inline.js', timeout: 1000 });
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(calls, ['/male-massage/therapists/api/app/access']);
assert.equal(element('entry').hidden, false);
assert.match(element('notice').textContent, /ยืนยันผ่าน LINE/);
console.log('Bundled MY THERAPIST browser script starts and reaches the session gate.');
