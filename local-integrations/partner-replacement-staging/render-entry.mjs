import http from 'node:http';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { lstatSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFixtureDatabase, openFixtureStaging } from './staging.mjs';
import { participantApi } from './participant.mjs';

const mount = '/var/data/partner-replacement';
export function serveParticipant(api, origin, liffId) {
  const host = new URL(origin).host;
  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
      res.end(data);
    };
    try {
      if (req.headers.host !== host || !req.url.startsWith('/') || req.url.startsWith('//')) return send(403, '{}');
      if (req.method === 'GET' && req.url === '/healthz') return send(200, '{"ok":true}');
      const pathname = new URL(req.url,origin).pathname;
      if (liffId && req.method === 'GET' && (pathname === '/' || pathname === '/participant-ui.js')) {
        const page = pathname === '/';
        const template = readFileSync(new URL(page ? './participant.html' : './participant-ui.js',import.meta.url),'utf8');
        res.writeHead(200, {
          'Content-Type':page ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
          'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
          'Content-Security-Policy':"default-src 'self'; script-src 'self' https://static.line-scdn.net; connect-src 'self' https://api.line.me https://access.line.me https://liff.line.me; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        });
        return res.end(page ? template.replace('__DEVELOPING_LIFF_ID__',liffId) : template);
      }
      if (!['GET','POST'].includes(req.method)) return send(405, '{}');
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) return send(413, '{}');
        chunks.push(chunk);
      }
      const response = await api(new Request(origin + req.url, {
        method:req.method, headers:req.headers, body:req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      }));
      send(response.status, await response.text());
    } catch { send(503, '{"code":"staging_unavailable"}'); }
  });
}

export function openParticipantStore(path, config) {
  participantApi(config);
  const digest = createHash('sha256').update(JSON.stringify([config.origin, config.audience,
    Object.entries(config.bindings).sort(([a], [b]) => a.localeCompare(b))])).digest('hex');
  if (!existsSync(path)) createFixtureDatabase(path, { participantConfigDigest:digest });
  if (!lstatSync(path).isFile()) throw Error('Regular staging database required');
  const probe = new DatabaseSync(path, { readOnly:true });
  try {
    if (probe.prepare('SELECT digest FROM participant_config').get()?.digest !== digest)
      throw Error('Staging binding changed; review required');
  } finally { probe.close(); }
  return openFixtureStaging(path, { enabled:config.enabled });
}

function requirePersistentDisk() {
  if (realpathSync(mount) !== mount || !readFileSync('/proc/self/mountinfo', 'utf8')
      .split('\n').some(line => line.split(' ')[4] === mount)) throw Error('Dedicated persistent disk required');
  return mount;
}

export function openParticipantService(env, checkedDisk = requirePersistentDisk) {
  const hostname = env.RENDER_EXTERNAL_HOSTNAME;
  if (env.RENDER !== 'true' || !/^partner-replacement-staging(?:-[a-z0-9]+)?\.onrender\.com$/.test(hostname ?? ''))
    throw Error('Dedicated Render staging hostname required');
  const diskPath = checkedDisk();
  const origin = 'https://' + hostname;
  if (env.REPLACEMENT_STAGING_ENABLED !== 'true') {
    const closed = () => Response.json({ ok:false, code:'staging_gate_closed' }, { status:503 });
    return { server:serveParticipant(closed, origin), store:null };
  }
  const config = { origin, audience:env.REPLACEMENT_DEVELOPING_CHANNEL_ID,
    bindings:JSON.parse(env.REPLACEMENT_TEST_BINDINGS_JSON || '{}'), enabled:true };
  const liffId = env.REPLACEMENT_DEVELOPING_LIFF_ID;
  if (typeof liffId !== 'string' || !/^\d+-[A-Za-z0-9]+$/.test(liffId) || liffId.split('-')[0] !== config.audience)
    throw Error('Matching Developing LIFF ID required');
  const store = openParticipantStore(join(diskPath, 'replacement.sqlite'), config);
  return { server:serveParticipant(participantApi({ ...config, store }), origin, liffId), store };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { server, store } = openParticipantService(process.env);
  server.listen(Number(process.env.PORT) || 10000, '0.0.0.0');
  process.once('SIGTERM', () => server.close(() => store?.close()));
}
