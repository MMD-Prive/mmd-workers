// Minimal patch against the deployed Worker; never rebuild from a truncated API response.
export const EXPECTED_SHA256 = '58f9676c9966cd11b46ac3cd1396dd7c6c4b525005ef337601a66bcdfaf6b57f';

export function patchDocsNavigation(source) {
  const oldLink = 'href="/internal/ceo/documents"';
  if (source.split(oldLink).length !== 3) throw new Error('Owner navigation changed; review before patching');
  const anchor = "    const path = url.pathname;";
  if (source.split(anchor).length !== 2) throw new Error('Archive router changed; review before patching');
  const access = `
    if (path === '/docs/access' || path === '/docs/access/') {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD'}});
      const nonce = random(16);
      const page = start(nonce, 'ขอรหัสเอกสาร · MMD MEMORY') + '<p>MMD MEMORY</p><h1>ขอรหัสเอกสารใหม่</h1><h2>เอกสารที่ได้รับจาก MMD</h2><p>ติดต่อกลับในแชตเดิมที่ MMD ส่งรหัสให้ แจ้งชื่อเอกสารที่ต้องการและว่ารหัสหมดอายุหรือเปิดไม่ได้ เพื่อให้ทีมตรวจสิทธิ์และออกลิงก์ที่ตรงกับคุณ</p><p>หน้านี้ไม่ได้ออกหรือต่ออายุรหัสให้อัตโนมัติ</p><h2>คู่มือ MY MODEL</h2><p>หากต้องการอ่านคู่มือ MY MODEL ให้ส่งคำขอผ่านหน้าคู่มือ แล้วรอการอนุมัติจากเปอร์</p><p><a href="/docs/guide">ขออ่านคู่มือ MY MODEL</a></p><p><a href="/docs/my-mmd-features">กลับไปตรวจรหัสเอกสารเดิม</a></p><p><a href="/docs/">กลับคลังเอกสาร</a></p></main></body></html>';
      const response = html(page, nonce);
      return request.method === 'HEAD' ? new Response(null, {status:response.status,headers:response.headers}) : response;
    }
`;
  return source.replaceAll(oldLink, 'href="/internal/ceo/dashboard"').replace(anchor, anchor + access);
}
