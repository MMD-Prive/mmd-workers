// Local-only fixture preview. Never imports production credentials or writes records.
import fs from 'node:fs';
import http from 'node:http';
import { buildConsoleEmbed } from './build-model-console-atelier-embed.mjs';
const input = process.argv[2];
if (!input) throw new Error('Supply a locally captured, unauthenticated Console shell');
const live = fs.readFileSync(input, 'utf8');
const start = live.indexOf('<section id="sigil-model-console-v3"');
const end = live.indexOf('<div class="w-embed"><style>', start);
if (start < 0 || end < 0) throw new Error('Console shell boundary changed');
const markup = live.slice(start, end);
const styles = [...live.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map(m => m[0]).join('\n');
const links = [...live.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/gi)].map(m => m[0]).join('\n');
const runtime = fs.readFileSync(new URL('../webflow/sigil/model/model-console-v3-i18n.js', import.meta.url), 'utf8');
const next = { confirmed: ['start_travel'], en_route: ['mark_arrived'], nearby: ['mark_arrived'], arrived: ['mark_met_customer'], final_payment_confirmed: ['start_work'], work_started: ['mark_work_finished'], work_finished: ['confirm_separated'] };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4187');
  const context = new URL(req.headers.referer || url);
  if (url.pathname === '/v1/model/session/current') {
    const state = context.searchParams.get('state') || 'confirmed';
    res.setHeader('content-type', 'application/json');
    if (state === 'error' || state === 'unauthorized') {
      res.statusCode = state === 'error' ? 503 : 401;
      res.end(JSON.stringify({ ok: false, error: state === 'error' ? 'unavailable' : 'model_session_required' })); return;
    }
    res.end(JSON.stringify({ ok: true, session: state === 'empty' ? null : {
      session_id: 'sess_LOCAL_FIXTURE_ONLY', normalized_state: state, state,
      model_work_lane: ({ public: 'public_model', private: 'private_model' })[context.searchParams.get('lane')] || '', allowed_actions: next[state] || [],
      job_type: 'LOCAL FIXTURE · ไม่ใช่งานจริง', start_time: '2026-11-01T11:00:00+07:00',
      location_name: 'สถานที่จำลองสำหรับตรวจ UI', pay_model_thb: null,
    } })); return;
  }
  if (url.pathname.startsWith('/v1/')) { res.writeHead(405); res.end('No production writes; preview only'); return; }
  const bundle = url.searchParams.has('before') ? '<script>' + runtime + '</script>' : buildConsoleEmbed();
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="th"><head><meta name="viewport" content="width=device-width, initial-scale=1">' + links + styles + '</head><body>' + markup + bundle + '</body></html>');
}).listen(4187, '127.0.0.1', () => console.log('Local fixture preview http://127.0.0.1:4187/'));
