// Read-only profile UI on the established, serialized LIFF session lane.
export function createAccountView(root, request, expectedMemberRef = () => '', onSessionExpired = () => {}) {
  let generation = 0;
  function reset() { generation++; if (root) root.replaceChildren(); }
  async function load() {
    if (!root) return;
    const turn = ++generation;
    const doc = root.ownerDocument;
    const node = (tag, text) => { const n = doc.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
    const progress = node('progress'); progress.setAttribute('aria-label', 'กำลังอ่านโปรไฟล์');
    root.replaceChildren(progress);
    try {
      const response = await request('/api/member/app/profile', { credentials:'same-origin', cache:'no-store', headers:{accept:'application/json'} });
      if (turn !== generation) return;
      if (response.status === 401 || response.status === 403) { reset(); onSessionExpired(); return; }
      const data = await response.json();
      if (turn !== generation) return;
      if (!response.ok || !data || Array.isArray(data) || typeof data !== 'object' || data.ok === false) throw Error('profile_unavailable');
      const expected = expectedMemberRef();
      if (typeof expected !== 'string' || !expected || data.memberRef !== expected) {
        reset(); onSessionExpired(); return;
      }
      const rows = [['ชื่อ', data.displayName], ['สมาชิกตั้งแต่', data.memberSince]];
      if (data.emailSafeToDisplay === true) rows.push(['อีเมล', data.emailMasked]);
      if (data.phoneSafeToDisplay === true) rows.push(['โทรศัพท์', data.phoneMasked]);
      root.replaceChildren();
      for (const [label, value] of rows) {
        const row = node('div'); row.className = 'digital-account-row';
        row.append(node('span', label), node('strong', typeof value === 'string' && value.trim() ? value : '—')); root.append(row);
      }
    } catch {
      if (turn !== generation) return;
      const retry = node('button', 'ลองอีกครั้ง'); retry.type = 'button'; retry.addEventListener('click', load);
      root.replaceChildren(node('p', 'ยังอ่านโปรไฟล์ไม่ได้ครับ กรุณาลองอีกครั้ง'), retry);
    }
  }
  return {load, reset};
}
