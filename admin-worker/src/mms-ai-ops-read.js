import { readKenjiRuntimeControlVersions } from './kenji-control-actions.js';
import { readHypeTelegramRouterHealth } from './hype-telegram-router-health-read.js';

const HOME = '/internal/admin/mms';
const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const knownBoolean = (value) => typeof value === 'boolean' ? value : null;

// Every source is read-only. Never return records, LINE subjects, chat text,
// destination IDs or credential values to the advisory layer.
async function bounded(read, timeoutMs) {
  let timer;
  const controller = new AbortController();
  try {
    return await Promise.race([
      Promise.resolve().then(() => read(controller.signal)),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('source_timeout')); }, timeoutMs); }),
    ]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function readMms(env, path, signal) {
  if (!env.MMS_WORKER?.fetch) return null;
  const response = await env.MMS_WORKER.fetch(new Request('https://mms.internal' + path, { method: 'GET', signal }));
  if (!response.ok) return null;
  const body = await response.json();
  return body?.ok === true ? body : null;
}

async function readKenjiFlags(env, signal) {
  if (!env.MEMBER_DASHBOARD_CHAT_WORKER?.fetch || !env.INTERNAL_TOKEN) return null;
  const response = await env.MEMBER_DASHBOARD_CHAT_WORKER.fetch(new Request('https://member-dashboard-chat-worker.local/health', {
    method: 'GET', signal, headers: {
      authorization: `Bearer ${env.INTERNAL_TOKEN}`,
      'x-mmd-internal-call': 'true', 'x-mmd-service-binding': 'admin-worker',
    },
  }));
  if (!response.ok) return null;
  const body = await response.json();
  const flags = body?.kenji_runtime;
  return body?.ok === true && body.worker === 'member-dashboard-chat-worker' && flags?.schema === 'mmd.kenji_runtime_flags.v1'
    && ['line_auto_reply_enabled', 'model_reply_enabled', 'shadow_enabled'].every(key => typeof flags[key] === 'boolean') ? flags : null;
}

function countUnique(rows, key, predicate) {
  return new Set(rows.filter(predicate).map(row => row?.[key]).filter(id => typeof id === 'string' && id.trim())).size;
}

function source(data, valid) {
  return { available: Boolean(data && valid), complete: Boolean(data && valid && data.complete === true) };
}

function control(controls, scope) {
  const value = controls?.[scope];
  const valid = value && Number.isInteger(value.version) && value.version >= 0
    && typeof value.enabled === 'boolean' && (value.version > 0 || value.enabled === false);
  return valid ? { available: true, enabled: value.enabled, version: value.version, origin: value.version === 0 ? 'default' : 'recorded' }
    : { available: false, enabled: null, version: null, origin: 'unknown' };
}

export async function readMmsAiOps(env = {}, {
  readControls = readKenjiRuntimeControlVersions,
  readRouter = readHypeTelegramRouterHealth,
  timeoutMs = 6500,
} = {}) {
  const [snapshot, workspace, health, controls, router, flags] = await Promise.all([
    bounded(signal => readMms(env, '/internal/mms/admin/snapshot', signal), timeoutMs),
    bounded(signal => readMms(env, '/internal/mms/admin/workspace', signal), timeoutMs),
    bounded(signal => readMms(env, '/health', signal), timeoutMs),
    bounded(() => readControls(env), timeoutMs),
    bounded(() => readRouter(env, { probe: false }), timeoutMs),
    bounded(signal => readKenjiFlags(env, signal), timeoutMs),
  ]);
  const runtimeControls = Object.fromEntries(['line_oa_auto_reply', 'model_keyword_auto_reply', 'all_kenji_mutations']
    .map(scope => [scope, control(controls, scope)]));
  const sources = {
    snapshot: source(snapshot, Array.isArray(snapshot?.applications) && Array.isArray(snapshot?.prebookings)),
    workspace: source(workspace, Array.isArray(workspace?.therapists) && Array.isArray(workspace?.jobs)),
    henna: { available: health?.worker === 'mms-worker' && health?.bindings?.line?.persona === 'HENNA' },
    kenji_controls: { available: Object.values(runtimeControls).every(value => value.available) },
    kenji_runtime: { available: flags !== null },
    telegram: { available: router?.available === true },
  };
  const queue = {
    applications: sources.snapshot.available ? countUnique(snapshot.applications, 'application_id', row => ['submitted', 'under review'].includes(normalize(row.status))) : null,
    prebookings: sources.snapshot.available ? countUnique(snapshot.prebookings, 'prebooking_id', row => ['draft', 'submitted', 'matching', 'options ready'].includes(normalize(row.status))) : null,
    needs_coordination: sources.snapshot.available ? countUnique(snapshot.prebookings, 'prebooking_id', row => normalize(row.status) === 'pending coordination') : null,
    therapist_access: sources.workspace.available ? countUnique(workspace.therapists, 'therapist_id', row => normalize(row.status) === 'active' && row.can_open === false) : null,
    available_therapists: sources.workspace.available ? countUnique(workspace.therapists, 'therapist_id', row => row.can_open === true && normalize(row.availability_status) === 'available' && row.matching_enabled === true) : null,
    // Count all production jobs by status. An unknown job state is never
    // silently treated as finished, nor does a test job become real workload.
    production_jobs: sources.workspace.available ? countUnique(workspace.jobs, 'job_id', row => row.is_test === false) : null,
  };
  const actions = [
    ['needs_coordination', 'คำขอที่ต้องช่วยประสาน', 'prebookings', 'snapshot'],
    ['therapist_access', 'Therapist ที่ยังเข้าแอปไม่ได้', 'therapists', 'workspace'],
    ['applications', 'ใบสมัครที่รอดูต่อ', 'applications', 'snapshot'],
    ['prebookings', 'คำขอจองที่ยังต้องประสาน', 'prebookings', 'snapshot'],
  ].filter(([key]) => queue[key] > 0).map(([key, label, tab, origin]) => ({
    key, label, count: queue[key], partial: !sources[origin].complete, href: HOME + '#' + tab,
  }));
  const line = sources.henna.available ? health.bindings.line : {};
  const lanes = ['mms_applications', 'mms_ops'].map(key => {
    const lane = sources.telegram.available ? router.lanes?.find(item => item.key === key) : null;
    return {
      key,
      status: lane ? (['configured', 'partial', 'unavailable', 'degraded'].includes(lane.status) ? lane.status : 'unknown') : 'unknown',
      destination_configured: lane ? knownBoolean(lane.destination_configured) : null,
      service_auth_configured: lane ? knownBoolean(lane.service_auth_configured) : null,
    };
  });
  return {
    ok: true, schema: 'mms_ai_ops_read_v1', checked_at: new Date().toISOString(),
    mode: 'read_only', summary_method: 'canonical_counts_and_rules',
    sources, queue, actions,
    kenji: {
      // The canonical LINE control is a kill switch, not the separate Worker
      // activation flags read separately from the authenticated runtime health.
      line_auto_reply_enabled: knownBoolean(flags?.line_auto_reply_enabled),
      model_reply_enabled: knownBoolean(flags?.model_reply_enabled),
      shadow_enabled: knownBoolean(flags?.shadow_enabled),
      line_reply_kill_switch_active: runtimeControls.line_oa_auto_reply.enabled,
      model_reply_kill_switch_active: runtimeControls.model_keyword_auto_reply.enabled,
      mutations_kill_switch_active: runtimeControls.all_kenji_mutations.enabled,
      runtime_controls: runtimeControls,
    },
    henna: {
      configured: knownBoolean(line.configured), auto_reply_enabled: knownBoolean(line.auto_reply_enabled),
      handoff_binding_configured: sources.henna.available ? knownBoolean(health.bindings.telegram) : null,
      lanes, delivery_verified: false,
    },
  };
}
