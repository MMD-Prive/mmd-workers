import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectChatMessage } from '../../shared/mms-chat-policy.mjs';

for (const text of [
  '0891234567', '๐๘๙ ๑๒๓ ๔๕๖๗', '０８９１２３４５６７', '08\u200b9-123-4567', '+66 89 123 4567',
  'ศูนย์แปดเก้าหนึ่งสองสามสี่ห้าหกเจ็ด', 'โทร 0 8 9 1 2 3 4 5 6 7',
  'id: @tamp.test', 'tamp@example.com', 'tamp [at] example [dot] com',
  'https://lin.ee/example', 'line://ti/p/example', 'www.instagram.com/test', 'bit.ly/test', 'https://example.test/redirect',
  'ขอไลน์หน่อยครับ', 'ไลน์ผม tamp', 'แลกเบอร์กัน', 'แอดไอจีได้ไหม', 'ขอช่องทางติดต่อหน่อย',
  'ทักส่วนตัวได้ไหม', 'นัดนอกรอบกัน', 'จองนอกระบบถูกกว่า', 'โอนตรงให้ผมได้', 'ไม่ต้องผ่าน MMS', 'ไม่เสียค่าคอม',
  'Add me on LINE', 'call my number', 'pay outside the app', 'book directly', '080', '1234567',
  'LINE ID tamp1234', 'ไอดีไลน์ tamp', 'แ อ ด ไ ล น์ หน่อย', 'ไปคุยในไลน์กัน', 'คุยทาง LINE ไหม',
  'ติดต่อกันเองได้ไหม', 'ขอช่องทางอื่น', 'ส่งบัญชีมา', 'tamp1234', 'tamp.name',
  'LINE: tamp', 'line=tamp', 'My LINE is tamp', 'L I N E: tamp',
]) test(`holds contact or offsite attempt: ${text}`, () => assert.ok(inspectChatMessage(text).code));

for (const text of [
  'สวัสดีครับ', 'คอร์ส Aroma 60 นาทีราคาเท่าไร', '90 นาที 1800 บาทได้ไหม', 'ถึงประมาณ 19:30 ได้ไหม',
  'อยู่สีลม รับงานไหมครับ', 'LINE โหลดค้างครับ', 'ไม่มี LINE ครับ', 'แชตตรงนี้สะดวกครับ',
  'ปรับคอร์สเป็น 120 นาทีได้ไหม', 'ตอนนี้ถึงแล้วครับ', 'ขอปรับเวลาเป็น 20:00', 'ขอดูรายละเอียดคอร์สหน่อย',
]) test(`allows service conversation: ${text}`, () => assert.equal(inspectChatMessage(text).code, null));

test('checks same-sender context across messages', () => {
  assert.ok(inspectChatMessage('ไลน์หน่อย', ['ขอ']).code);
  assert.ok(inspectChatMessage('ต่อด้วย 4567', ['เริ่มที่ 089', 'ถัดไป 123']).code);
  assert.ok(inspectChatMessage('ต่อด้วย 4567', ['คอร์ส 60 นาที 1500 บาท', 'เริ่มที่ 089', 'ถัดไป 123']).code);
  assert.equal(inspectChatMessage('คอร์ส 60 นาทีครับ', ['LINE โหลดค้าง']).code, null);
});
