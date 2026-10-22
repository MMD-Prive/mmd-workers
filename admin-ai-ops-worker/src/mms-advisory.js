const STATUS = (value, on, off) => value === true ? on : value === false ? off : 'ยังตรวจไม่ได้';

// MMS summaries are built only from the authenticated, bounded projection.
// Never infer payment, dispatch success, delivery, or agent activation.
export function buildMmsAdvisory(read) {
  const data = read?.data;
  const next_actions = [];
  const anomalies = [];
  const verified = [];
  const brief = [];
  if (!read?.ok || data?.ok !== true || data?.schema !== 'mms_ai_ops_read_v1') {
    return { verified, next_actions, anomalies: [{ code: 'mms_read_unavailable', level: 'warning', text: 'ยังอ่านคิว MMS ไม่ได้ เปิดหน้า MMS แล้วอัปเดตอีกครั้งครับ' }], brief: ['ยังสรุปงาน MMS ล่าสุดไม่ได้'] };
  }
  for (const [key, label] of [['snapshot', 'ใบสมัครและคำขอจอง'], ['workspace', 'Therapist และงานในแอป']]) {
    const source = data.sources?.[key];
    if (source?.available === true) verified.push(label + (source.complete === true ? ' · อ่านครบ' : ' · อ่านได้บางส่วน'));
    if (source?.complete !== true) anomalies.push({ code: 'mms_' + key + '_incomplete', level: 'info', text: label + ' ยังอ่านไม่ครบ จำนวนที่เห็นอาจยังไม่ใช่ทั้งหมด' });
  }
  for (const item of Array.isArray(data.actions) ? data.actions : []) {
    if (!/^\/internal\/admin\/mms#(applications|therapists|prebookings)$/.test(item?.href || '') || !Number.isInteger(item.count) || item.count <= 0) continue;
    next_actions.push({ priority: next_actions.length + 1, action: 'mms_' + item.key, label: item.label + ' · ' + item.count + (item.partial ? ' (ที่อ่านได้)' : ''), href: item.href });
  }
  if (next_actions.length) brief.push('คิว MMS มี ' + next_actions.length + ' กลุ่มที่ควรดูต่อ เปิดจากปุ่มด้านล่างได้เลยครับ');
  else brief.push(data.sources?.snapshot?.complete === true && data.sources?.workspace?.complete === true ? 'ยังไม่มีรายการในคิว MMS ที่ต้องดูต่อ' : 'ข้อมูล MMS ยังไม่ครบ จึงยังสรุปว่าคิวว่างไม่ได้');
  brief.push('HENNA · LINE ' + STATUS(data.henna?.configured, 'ตั้งค่าแล้ว', 'ยังตั้งค่าไม่ครบ') + ' · ตอบอัตโนมัติ ' + STATUS(data.henna?.auto_reply_enabled, 'เปิด', 'ปิด'));
  brief.push('Kenji · LINE ' + STATUS(data.kenji?.line_auto_reply_enabled, 'เปิดตอบ', 'ปิดตอบ') + ' · ตัวหยุดการแก้ข้อมูล ' + STATUS(data.kenji?.mutations_kill_switch_active, 'ทำงาน', 'ไม่ทำงาน'));
  brief.push('สรุปจากจำนวนและสถานะใน MMS การส่งข้อความและการอนุมัติใช้หน้าทำงานจริง');
  return { verified, brief, anomalies, next_actions: next_actions.slice(0, 3) };
}
