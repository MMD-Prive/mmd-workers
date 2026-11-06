import {readRecentProfileAnchor} from './kenji-line-conversation-history.mjs';

const URLS = Object.freeze({
  public: 'https://mmdbkk.com/profiles',
  ems: 'https://www.mmdbkk.com/my-mmd/ems',
  gws: 'https://www.mmdbkk.com/my-mmd/gws',
});

export function currentProfileQuery(event) {
  if (event?.type !== 'message' || event.message?.type !== 'text' || event.source?.type !== 'user') return null;
  const raw = String(event.message.text || '').normalize('NFKC').trim();
  if (!raw || raw.length > 100) return null;
  const explicit = /^(?:ขอดู(?:โปรไฟล์)?|ดูโปรไฟล์|show (?:me )?(?:the )?profile (?:of )?)\s*(.+)$/iu.exec(raw);
  const name = explicit ? explicit[1].replace(/(?:\s+)?(?:ครับ|ค่ะ|คะ|หน่อย)[?？]?$/u, '').trim() : raw;
  const word = /^[\p{L}\p{M}][\p{L}\p{M}\p{N}_-]*(?: [\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}_-]*){0,3}$/u;
  if (name.length < 2 || name.length > 64 || !word.test(name) || (!explicit && name.includes(' '))) return null;
  return {name, explicit: Boolean(explicit)};
}

export function isProfileFollowup(event) {
  return event?.source?.type === 'user' && event.type === 'message' && event.message?.type === 'text' &&
    /^(?:คนนี้|ขอดูเพิ่ม|ขอดูรูปเพิ่ม|ดูรูปเพิ่มได้ไหม)(?:\s*(?:ครับ|ค่ะ|คะ|หน่อย))?[?？]?$/u.test(String(event.message.text || '').normalize('NFKC').trim());
}

export async function resolveProfileLinkReply(env, event, {now = Date.now(), readAnchor = readRecentProfileAnchor} = {}) {
  const followup = isProfileFollowup(event);
  const userId = event?.source?.userId;
  if (!/^(true|1|yes|on)$/i.test(String(env.LINE_KENJI_MODEL_ACCESS_ENABLED)) ||
      !/^U[a-f0-9]{32}$/i.test(userId || '') || !env.ADMIN_WORKER?.fetch || !env.INTERNAL_TOKEN) return null;
  const reply = (text, anchor = false) => ({text, intent:'approved_command', reply_source:'category_profile_link',
    model_attempted:false, ...(anchor && !followup ? {cta_type:'profile_anchor'} : {})});
  const clarify = () => reply('หมายถึงนายแบบคนไหนครับ พิมพ์ชื่อทำงานหรือรหัสอีกครั้งได้เลยครับ');
  const previous = followup ? await readAnchor(env,event,now) : null;
  const query = followup
    ? (previous && !isProfileFollowup({...event,message:{...event.message,text:previous}})
        ? currentProfileQuery({...event,message:{...event.message,text:previous}}) : null)
    : currentProfileQuery(event);
  if (!query) return followup ? clarify() : null;
  let payload;
  try {
    const response = await env.ADMIN_WORKER.fetch(new Request('https://admin-worker.local/v1/internal/kenji/model-access', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2500),
      headers: {authorization: `Bearer ${env.INTERNAL_TOKEN}`, 'content-type': 'application/json',
        'x-mmd-internal-call': 'true', 'x-mmd-service-binding': 'member-dashboard-chat-worker'},
      body: JSON.stringify({line_user_id: userId, query: query.name, purpose: 'profile_link'}),
    }));
    if (response.ok) payload = await response.json();
  } catch { /* No authority to return a protected link. */ }
  if (payload?.ok === true && payload.status === 'clarification') return reply('ขอชื่อทำงานหรือรหัสนายแบบให้ชัดอีกนิดครับ จะได้ส่งลิงก์ให้ถูกคน');
  const route = payload?.ok === true && payload.status === 'profile_link' && Object.hasOwn(URLS, payload.destination)
    ? payload.destination : null;
  if (route === 'ems' || route === 'gws') return reply(`เปิดอัลบั้มใน My MMD ได้ที่ ${URLS[route]} ครับ หน้าปลายทางจะตรวจสิทธิ์บัญชีอีกครั้ง`, true);
  if (route === 'public' || (!followup && query.explicit)) return reply(`ดูโปรไฟล์ที่เปิดให้ชมได้ที่ ${URLS.public} ครับ ถ้าไม่เจอคนที่สนใจ ฝากให้เปอร์ช่วยดูต่อได้ครับ`, route === 'public');
  if (followup) return clarify();
  return null;
}
