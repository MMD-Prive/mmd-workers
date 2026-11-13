// Read-only projection of existing owner edit evidence. Not an action gate,
// offer generation, delivery receipt, or replacement for a durable writer fence.
// Acknowledged means timestamps after the edit, not a generation-bound approval.
const CONTRACT = 'mmd_job_update_v1';
const fields = {
  note: ['note', 'fldEcDkF7CH9VixWM'], notes: ['notes', 'fldwl9Gs5tYlXG5ls'],
  model: ['model_name', 'flddVz6eoWRHrzIQr'],
  customer: ['customer_ack_at', 'fldJSS5GNN7quJwa8'],
  modelAck: ['model_ack_at', 'fldFgkHXivIAThfDz'],
};
const read = (row, names) => names.map(key => row[key]).find(value => value !== undefined && value !== null);
const text = value => typeof value === 'string' ? value.trim() : '';
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const review = () => ({ contract: CONTRACT, state: 'review_required', changed_at: null });

export function projectJobUpdate(record) {
  const row = record?.fields || {};
  const lines = [read(row, fields.note), read(row, fields.notes)].flatMap(value => text(value).split('\n'))
    .map(line => line.trim()).filter(line => line.startsWith('[MMD JOB EDIT v1]'));
  if (!lines.length) return null;
  const events = [];
  for (const line of new Set(lines)) {
    let event;
    try { event = JSON.parse(line.slice('[MMD JOB EDIT v1]'.length).trim()); } catch { return review(); }
    if (!event || !/^[-\w]{16,80}$/.test(event.request_id || '') || !iso(event.at) || !text(event.model_name)) return review();
    events.push(event);
  }
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const latest = events[0];
  if (events.some(event => Date.parse(event.at) === Date.parse(latest.at) && event.request_id !== latest.request_id)
    || text(latest.model_name) !== text(read(row, fields.model))) return review();
  const changedAt = iso(latest.at);
  const acknowledged = names => { const at = iso(read(row, names)); return at !== null && Date.parse(at) >= Date.parse(changedAt); };
  const customer = acknowledged(fields.customer), model = acknowledged(fields.modelAck);
  return {
    contract: CONTRACT,
    state: !customer ? 'awaiting_customer' : !model ? 'awaiting_model' : 'acknowledged',
    changed_at: changedAt,
  };
}
