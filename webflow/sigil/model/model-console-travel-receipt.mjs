const ACTION_PATH = '/v1/model/session/action';

function travelReceiptCopy(win, delivered) {
  let lang = 'th';
  try {
    const url = new URL(win.location.href);
    lang = (url.searchParams.get('lang') || win.localStorage?.getItem('mmd_sigil_lang') || 'th').toLowerCase();
  } catch {}

  if (lang === 'en' || lang.startsWith('en-')) {
    return delivered
      ? 'Travel started · LINE accepted the customer notice'
      : 'Travel saved · LINE notice is not confirmed';
  }
  if (lang === 'zh' || lang.startsWith('zh-')) {
    return delivered
      ? '已开始出发 · LINE 已接受客户通知'
      : '已记录出发 · 尚未确认 LINE 通知';
  }
  return delivered
    ? 'เริ่มเดินทางแล้ว · LINE รับคำขอแจ้งลูกค้าแล้วครับ'
    : 'บันทึกการเดินทางแล้ว · ยังยืนยันการแจ้ง LINE ไม่ได้ครับ';
}

export function installModelTravelReceiptNotice(win = window, doc = document) {
  if (!win || win.__mmdTravelReceiptNoticeInstalled || typeof win.fetch !== 'function') return false;

  const originalFetch = win.fetch;
  win.__mmdTravelReceiptNoticeInstalled = true;
  win.fetch = async function travelReceiptFetch(input, init) {
    let isStartTravel = false;
    try {
      const requestUrl = new URL(input instanceof Request ? input.url : input, win.location.href);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (requestUrl.origin === win.location.origin && requestUrl.pathname === ACTION_PATH && method === 'POST') {
        isStartTravel = JSON.parse(typeof init?.body === 'string' ? init.body : '{}')?.action === 'start_travel';
      }
    } catch {}

    const response = await originalFetch.call(this, input, init);
    if (!isStartTravel || !response.ok) return response;

    const payload = await response.clone().json().catch(() => null);
    if (payload?.ok !== true) return response;

    const message = travelReceiptCopy(win, payload?.notification?.delivered === true);
    win.setTimeout(() => {
      const toast = doc.querySelector('[data-toast]');
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add('is-show');
    }, 0);
    return response;
  };
  return true;
}
