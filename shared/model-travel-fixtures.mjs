// Synthetic fixtures only; no production credentials or records.
export class TravelTestBucket {
  objects = new Map(); serial = 0;
  async get(key) {
    const item = this.objects.get(key); if (!item) return null;
    const bytes = Buffer.from(item.bytes);
    return { ...item, size: bytes.length, json: async () => JSON.parse(bytes.toString()), text: async () => bytes.toString(), body: new Uint8Array(bytes) };
  }
  async head(key) { return this.get(key); }
  async put(key, value, options = {}) {
    const old = this.objects.get(key), condition = options.onlyIf;
    if ((condition?.etagMatches && old?.etag !== condition.etagMatches) || (condition?.etagDoesNotMatch === '*' && old)) return null;
    const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
    const next = { key, bytes, etag: String(++this.serial), customMetadata: options.customMetadata || {}, httpMetadata: options.httpMetadata || {} };
    this.objects.set(key, next); return { etag: next.etag };
  }
  async delete(key) { this.objects.delete(key); }
}
export const MODEL = 'recModel123';
export function travelFixture() {
  const record = { id: 'recSession123', fields: { session_id: 'sess_FIXTURE', 'Canonical Model': [MODEL], line_user_id: 'U1234567890abcdef1234567890abcdef', member_id: 'recMember123', model_session_state: 'en_route' } };
  const env = { PRIVATE_MODEL_MEDIA: new TravelTestBucket(), AIRTABLE_API_KEY: 'test-key', AIRTABLE_BASE_ID: 'app-test', AIRTABLE_TABLE_SESSIONS: 'Sessions', AIRTABLE_TABLE_JOBS: 'Jobs', MODEL_SESSION_SIGNING_SECRET: 'test-model-secret', ALLOWED_ORIGINS: 'https://mmdbkk.com',
    AIRTABLE_HTTP: { async fetch(request) {
      const table = new URL(request.url).pathname.split('/').at(-1);
      return Response.json({ records: table === 'Jobs' ? [{ id: 'recJob', fields: { session_id: record.fields.session_id, events_json: JSON.stringify([{ event: 'eta_update', ts: new Date().toISOString(), eta_minutes: 85 }]) } }] : [structuredClone(record)] });
    } },
  };
  return { record, env };
}
export const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7LooooA//2Q==', 'base64');
