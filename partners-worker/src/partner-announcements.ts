// Partner recruitment announcements. One conditional document write owns each
// announcement and its proposals, so closing and proposing cannot race apart.
export type AnnouncementActor = { id: string; name: string; owner: boolean };
export type CandidateSnapshot = { model_id: string; model_name: string; asset_id: string; asset_name: string };
type RecordData = Record<string, any>;
export type AnnouncementContext = {
  bucket: R2Bucket;
  actor: AnnouncementActor;
  candidate: (partnerId: string, modelId: string, assetId: string) => Promise<CandidateSnapshot>;
};
const prefix = 'partner-announcements/v1/';
const idPattern = /^[a-zA-Z0-9_-]{16,80}$/;
const states = new Set(['draft', 'open', 'paused', 'closed', 'filled']);
const decisions = new Set(['submitted', 'more_information', 'selected', 'rejected', 'withdrawn']);
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('ข้อมูลไม่ครบหรือยาวเกินกำหนด');
  return value.trim();
}
function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000000) fail('กรุณาระบุจำนวนเงินให้ถูกต้อง');
  return Math.round(value * 100) / 100;
}
function instant(value: unknown): string {
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail('กรุณาระบุวันเวลาพร้อมเขตเวลา');
  return new Date(value).toISOString();
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !idPattern.test(value)) fail('รหัสรายการไม่ถูกต้อง');
  return value;
}
function effectiveStatus(doc: RecordData): string {
  return doc.status === 'open' && Date.parse(doc.deadline) <= Date.now() ? 'expired' : doc.status;
}
function visible(doc: RecordData, actor: AnnouncementActor): boolean {
  return actor.owner || (doc.status !== 'draft' && (doc.audience === 'all_active' || doc.partner_ids.includes(actor.id)));
}
function project(doc: RecordData, revision: string, actor: AnnouncementActor): RecordData {
  const own = doc.proposals.filter((p: RecordData) => actor.owner || p.partner_id === actor.id);
  const { proposals, audit, create_input, private_details, partner_ids, ...brief } = doc;
  return { ...brief, status: effectiveStatus(doc), revision, proposals: own.map(({ input, ...proposal }: RecordData) => proposal),
    private_details: actor.owner || own.some((p: RecordData) => p.status === 'selected') ? private_details : undefined,
    ...(actor.owner ? { audit, partner_ids } : {}) };
}
function normalizeBrief(body: RecordData): RecordData {
  if (!states.has(body.status) || !['model_net', 'total'].includes(body.budget_basis)) fail('สถานะหรือประเภทเงินไม่ถูกต้อง');
  if (!['all_active', 'selected_partners'].includes(body.audience)) fail('กรุณาเลือกกลุ่ม Partner ที่เห็นประกาศ');
  const partnerIds = body.partner_ids || [];
  if (!Array.isArray(partnerIds) || partnerIds.length > 200 || partnerIds.some(id => typeof id !== 'string' || !/^rec[A-Za-z0-9]{14,24}$/.test(id))) fail('รายชื่อ Partner ไม่ถูกต้อง');
  if (body.audience === 'selected_partners' && !partnerIds.length) fail('กรุณาระบุ Partner ที่เห็นประกาศ');
  const start = instant(body.start_at), end = instant(body.end_at), deadline = instant(body.deadline);
  if (Date.parse(end) <= Date.parse(start) || Date.parse(deadline) > Date.parse(start)) fail('ตรวจเวลาสิ้นสุดงานและวันปิดรับ');
  if (body.status === 'open' && Date.parse(deadline) <= Date.now()) fail('วันปิดรับผ่านไปแล้ว');
  if (!Number.isInteger(body.required_count) || body.required_count < 1 || body.required_count > 100) fail('จำนวนคนต้องอยู่ระหว่าง 1–100');
  const min = amount(body.budget_min), max = amount(body.budget_max);
  if (max < min) fail('งบสูงสุดต้องไม่น้อยกว่างบต่ำสุด');
  return {
    title: text(body.title, 160, true), brief: text(body.brief, 4000, true), category: text(body.category, 80, true),
    area: text(body.area, 160, true), requirements: text(body.requirements, 2000, true),
    start_at: start, end_at: end, deadline, required_count: body.required_count,
    budget_min: min, budget_max: max, budget_basis: body.budget_basis,
    travel_terms: text(body.travel_terms, 600, true), partner_fee_terms: text(body.partner_fee_terms, 600, true),
    private_details: text(body.private_details || '', 3000), status: body.status,
    audience: body.audience, partner_ids: [...new Set(partnerIds)]
  };
}
async function readBody(request: Request): Promise<RecordData> {
  const raw = await request.text();
  if (raw.length > 32000) fail('ข้อมูลเกินขนาดที่รองรับ', 413);
  let body;
  try { body = JSON.parse(raw); } catch { fail('ข้อมูลคำขอไม่ถูกต้อง'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('ข้อมูลคำขอไม่ถูกต้อง');
  return body;
}
async function load(bucket: R2Bucket, id: string) {
  const object = await bucket.get(prefix + identifier(id) + '.json');
  if (!object) fail('ไม่พบประกาศ', 404);
  return { doc: await object.json<RecordData>(), revision: object.etag };
}
function event(doc: RecordData, actor: AnnouncementActor, action: string, proposalId?: string) {
  doc.updated_at = new Date().toISOString();
  doc.audit.push({ at: doc.updated_at, actor_id: actor.id, action, proposal_id: proposalId });
}
async function save(ctx: AnnouncementContext, doc: RecordData, revision: string | null) {
  const data = JSON.stringify(doc);
  if (data.length > 2000000) fail('รายการนี้มีข้อมูลจำนวนมาก กรุณาปิดประกาศและเปิดรอบใหม่', 409);
  const result = await ctx.bucket.put(prefix + doc.id + '.json', data, {
    onlyIf: revision ? { etagMatches: revision } : { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json' }
  });
  if (!result) fail('ข้อมูลเปลี่ยนระหว่างทำรายการ กรุณาโหลดประกาศล่าสุดแล้วลองอีกครั้ง', 409);
  return { ok: true, announcement: project(doc, result.etag, ctx.actor) };
}
function currentRevision(body: RecordData, revision: string) {
  if (body.revision !== revision) fail('รายละเอียดเปลี่ยน กรุณาอ่านประกาศล่าสุดก่อนส่ง', 409);
}
export async function handleAnnouncements(request: Request, ctx: AnnouncementContext): Promise<Response> {
  try {
    const url = new URL(request.url), action = url.pathname.split('/').pop()!;
    const result = await dispatch(request, ctx, action, url);
    return Response.json(result, { headers: { 'cache-control': 'no-store, private', 'referrer-policy': 'no-referrer' } });
  } catch (error) {
    const known = error instanceof Error && 'status' in error;
    return Response.json({ ok: false, error: { code: 'announcement_error', message: known ? error.message : 'โหลดหรือบันทึกประกาศไม่สำเร็จ กรุณาลองอีกครั้ง' } },
      { status: known ? Number(error.status) : 503, headers: { 'cache-control': 'no-store, private' } });
  }
}
async function dispatch(request: Request, ctx: AnnouncementContext, action: string, url: URL): Promise<RecordData> {
  const { actor, bucket } = ctx;
  if (action === 'preferences' && !actor.owner) {
    const key = 'partner-announcement-preferences/v1/' + actor.id + '.json';
    const stored = await bucket.get(key);
    const preferences = stored ? await stored.json<RecordData>() : { category: '', area: '', budget_min: null, enabled: false, seen_at: null };
    if (request.method === 'GET') return { ok: true, preferences, revision: stored?.etag || null };
    if (request.method !== 'POST') fail('ไม่รองรับคำขอนี้', 405);
    const input = await readBody(request);
    if (input.revision !== (stored?.etag || null)) fail('การติดตามเปลี่ยนจากอีกอุปกรณ์ กรุณาโหลดใหม่', 409);
    if (typeof input.enabled !== 'boolean') fail('กรุณาเลือกการติดตาม');
    const next = { category: text(input.category || '', 80), area: text(input.area || '', 160), budget_min: input.budget_min === null ? null : amount(input.budget_min), enabled: input.enabled, seen_at: input.mark_read === true ? new Date().toISOString() : preferences.seen_at };
    const result = await bucket.put(key, JSON.stringify(next), { onlyIf: stored ? { etagMatches: stored.etag } : { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } });
    if (!result) fail('ข้อมูลการติดตามเปลี่ยน กรุณาโหลดใหม่', 409);
    return { ok: true, preferences: next, revision: result.etag };
  }
  if (action === 'announcements' && request.method === 'GET') {
    const list = await bucket.list({ prefix, limit: 50, cursor: url.searchParams.get('cursor') || undefined });
    const rows = [];
    // Read sequentially and return only card data; private briefs and image notes
    // belong to the scoped detail endpoint, not a large list response.
    for (const object of list.objects) {
      const stored = await bucket.get(object.key);
      if (!stored) continue;
      const doc = await stored.json<RecordData>();
      if (!visible(doc, actor)) continue;
      const item = project(doc, stored.etag, actor);
      rows.push({ id: item.id, revision: item.revision, title: item.title, category: item.category, area: item.area,
        start_at: item.start_at, end_at: item.end_at, deadline: item.deadline, required_count: item.required_count,
        budget_min: item.budget_min, budget_max: item.budget_max, budget_basis: item.budget_basis, status: item.status,
        created_at: item.created_at, updated_at: item.updated_at, brief_updated_at: item.brief_updated_at,
        proposals: item.proposals.map((p: RecordData) => ({ id: p.id, model_id: p.model_id, model_name: p.model_name, status: p.status, updated_at: p.updated_at })) });
    }
    return { ok: true, announcements: rows, next_cursor: list.truncated ? list.cursor : null };
  }
  if (action === 'detail' && request.method === 'GET') {
    const { doc, revision } = await load(bucket, url.searchParams.get('id') || '');
    if (!visible(doc, actor)) fail('ไม่พบประกาศที่เปิดให้บัญชีนี้ดู', 404);
    return { ok: true, announcement: project(doc, revision, actor) };
  }
  if (request.method !== 'POST') fail('ไม่รองรับคำขอนี้', 405);
  const body = await readBody(request);
  if (actor.owner && action === 'save') {
    const input = normalizeBrief(body);
    const id = identifier(body.id);
    if (!Object.hasOwn(body, 'revision')) fail('กรุณาโหลดข้อมูลก่อนบันทึก', 409);
    if (body.revision === null) {
      const existing = await bucket.get(prefix + id + '.json');
      if (existing) {
        const doc = await existing.json<RecordData>();
        if (doc.create_input === JSON.stringify(input)) return { ok: true, announcement: project(doc, existing.etag, actor) };
        fail('รหัสประกาศถูกใช้แล้ว', 409);
      }
      if (input.status === 'filled') fail('กรุณาเลือกคนก่อนปิดแบบครบจำนวน');
      const now = new Date().toISOString();
      const doc = { ...input, id, created_at: now, updated_at: now, brief_updated_at: now, create_input: JSON.stringify(input), proposals: [], audit: [] };
      event(doc, actor, 'created');
      return save(ctx, doc, null);
    }
    const { doc, revision } = await load(bucket, id);
    currentRevision(body, revision);
    if (doc.proposals.length && input.status === 'draft') fail('ประกาศที่มีข้อเสนอแล้วให้พักรับหรือปิดรับแทนกลับเป็นร่าง', 409);
    const selected = doc.proposals.filter((p: RecordData) => p.status === 'selected').length;
    if (input.required_count < selected) fail('จำนวนที่ต้องการน้อยกว่าคนที่เลือกแล้ว', 409);
    if (input.status === 'filled' && selected < input.required_count) fail('จำนวนคนที่เลือกยังไม่ครบ', 409);
    // Existing submitters retain access to their submitted brief and decision.
    if (doc.proposals.length && (input.audience !== doc.audience || JSON.stringify(input.partner_ids) !== JSON.stringify(doc.partner_ids))) fail('ประกาศที่มีผู้เสนอแล้วต้องคงกลุ่มผู้รับเดิม', 409);
    Object.assign(doc, input);
    if (selected >= doc.required_count && doc.status === 'open') doc.status = 'filled';
    doc.brief_updated_at = new Date().toISOString();
    event(doc, actor, 'updated');
    return save(ctx, doc, revision);
  }
  const { doc, revision } = await load(bucket, identifier(body.id));
  if (!visible(doc, actor)) fail('ไม่พบประกาศที่เปิดให้บัญชีนี้ดู', 404);
  if (!actor.owner && action === 'propose') {
    const modelId = text(body.model_id, 80, true), assetId = text(body.asset_id, 80, true);
    if (body.share_with_mmd !== true || body.photo_current !== true) fail('กรุณายืนยันรูปปัจจุบันและการส่งข้อมูลให้ MMD');
    if (!['confirmed', 'checking'].includes(body.availability)) fail('กรุณาระบุสถานะการสอบถามคิว');
    const input = { model_id: modelId, asset_id: assetId, rate: amount(body.rate), availability: body.availability, note: text(body.note || '', 2000) };
    const old = doc.proposals.find((p: RecordData) => p.partner_id === actor.id && p.model_id === modelId);
    const snapshot = await ctx.candidate(actor.id, modelId, assetId);
    if (old && old.status !== 'more_information' && old.input === JSON.stringify(input)) return { ok: true, announcement: project(doc, revision, actor) };
    currentRevision(body, revision);
    if (effectiveStatus(doc) !== 'open') fail('ประกาศนี้ปิดรับแล้ว', 409);
    if (old && old.status !== 'more_information') fail('ส่งนายแบบคนนี้แล้ว กรุณาดูผลในรายการที่เสนอ', 409);
    if (!old && doc.proposals.length >= 500) fail('ประกาศนี้รับข้อมูลครบจำนวนแล้ว', 409);
    const proposal = { ...old, ...snapshot, ...input, id: old?.id || crypto.randomUUID(), partner_id: actor.id, partner_name: actor.name,
      status: 'submitted', input: JSON.stringify(input), note: input.note, updated_at: new Date().toISOString(), submitted_at: old?.submitted_at || new Date().toISOString(), decision_note: old?.decision_note || '' };
    if (old) Object.assign(old, proposal); else doc.proposals.push(proposal);
    event(doc, actor, old ? 'resubmitted' : 'submitted', proposal.id);
    return save(ctx, doc, revision);
  }
  if (actor.owner && action === 'decision') {
    if (!decisions.has(body.status) || ['submitted', 'withdrawn'].includes(body.status)) fail('ผลพิจารณาไม่ถูกต้อง');
    const proposal = doc.proposals.find((p: RecordData) => p.id === body.proposal_id);
    if (!proposal) fail('ไม่พบรายการที่เสนอ', 404);
    const note = text(body.decision_note || '', 1200, body.status === 'more_information');
    if (proposal.status === body.status && proposal.decision_note === note) return { ok: true, announcement: project(doc, revision, actor) };
    currentRevision(body, revision);
    if (proposal.status === 'selected' || proposal.status === 'withdrawn') fail('รายการนี้สิ้นสุดการพิจารณาแล้ว', 409);
    if (body.status === 'selected') {
      if (effectiveStatus(doc) !== 'open') fail('เปิดรับประกาศก่อนเลือกนายแบบ', 409);
      await ctx.candidate(proposal.partner_id, proposal.model_id, proposal.asset_id);
      if (doc.proposals.some((p: RecordData) => p.model_id === proposal.model_id && p.status === 'selected')) fail('เลือกนายแบบคนนี้แล้ว', 409);
      if (doc.proposals.filter((p: RecordData) => p.status === 'selected').length >= doc.required_count) fail('เลือกครบจำนวนแล้ว', 409);
    }
    proposal.status = body.status; proposal.decision_note = note; proposal.updated_at = new Date().toISOString();
    if (doc.proposals.filter((p: RecordData) => p.status === 'selected').length >= doc.required_count) doc.status = 'filled';
    event(doc, actor, body.status, proposal.id);
    return save(ctx, doc, revision);
  }
  fail('ไม่รองรับคำขอนี้', 404);
}
