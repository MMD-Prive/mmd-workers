import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildModelKeywordReply,
  findModelKeywordMatch,
  isModelScopeAllowed,
  normalizeMemberAccess,
  resolveModelKeywordRequest
} from '../src/kenji-model-keyword.js';

const profile = {
  id: 'rec-profile',
  fields: {
    model_key: 'EMs04 - Sin M',
    folder_name: 'EMs04 - Sin M',
    working_name: 'Sin M',
    search_aliases: 'EMs04, Sin',
    customer_safe_info: 'ศิลปินและนักร้องที่มีผลงานเพลง บุคลิกเป็นกันเองและดูแลตัวเองดีครับ',
    customer_safe_remark: 'หากสนใจ ผมช่วยประสานขั้นตอนถัดไปกับ MMD ให้ได้ครับ',
    private_admin_note: 'PRIVATE RATE PN 17500',
    model_tier: 'EMs',
    allowed_customer_scope: ['VIP', 'SVIP', 'Black Card', '#Potential'],
    status: 'Active'
  }
};

test('matches the folder/model key before aliases', () => {
  const match = findModelKeywordMatch([profile], 'ขอข้อมูล EMs04 - Sin M');
  assert.equal(match.profile.model_key, 'EMs04 - Sin M');
});

test('expired members receive no photo or price permission', () => {
  const access = normalizeMemberAccess([{
    fields: {
      'Membership Status': 'Expired',
      'Membership Tier': 'VIP',
      'Membership Expiry': '2025-01-01'
    }
  }], Date.parse('2026-08-28T00:00:00Z'));
  const reply = buildModelKeywordReply({ profile, access, priceRequested: true });
  assert.equal(access.status, 'expired');
  assert.equal(reply.send_image, false);
  assert.equal(reply.send_price, false);
  assert.match(reply.text, /หมดอายุ/);
  assert.doesNotMatch(reply.text, /17500|17,500|PRIVATE/);
});

test('EMs scope is denied to a normal active member and allowed to VIP', () => {
  const active = normalizeMemberAccess([{ fields: { 'Membership Status': 'Active', 'Membership Tier': 'Member' } }]);
  const vip = normalizeMemberAccess([{ fields: { 'Membership Status': 'Active', 'Membership Tier': 'VIP' } }]);
  assert.equal(isModelScopeAllowed(profile, active), false);
  assert.equal(isModelScopeAllowed(profile, vip), true);
});

test('customer-safe reply never exposes rate, private note, or image URL', () => {
  const access = normalizeMemberAccess([{ fields: { 'Membership Status': 'Active', 'Membership Tier': 'VIP' } }]);
  const reply = buildModelKeywordReply({ profile, access, priceRequested: true });
  assert.equal(reply.send_image, false);
  assert.equal(reply.send_price, false);
  assert.match(reply.text, /ศิลปิน/);
  assert.match(reply.text, /ให้เปอร์ตรวจ/);
  assert.doesNotMatch(reply.text, /17500|17,500|PRIVATE|https?:\\/\\//);
});

test('third model query becomes a burst handoff without exposing model data', () => {
  const access = normalizeMemberAccess([{ fields: { 'Membership Status': 'Active', 'Membership Tier': 'VIP' } }]);
  const reply = buildModelKeywordReply({ profile, access, recentQueryCount: 3 });
  assert.equal(reply.burst, true);
  assert.equal(reply.handoff_required, true);
  assert.match(reply.text, /เลือกคนที่ถูกใจที่สุดมา 3 คน/);
  assert.doesNotMatch(reply.text, /ศิลปิน|17500/);
});

test('resolver reads only active profiles and member access records', async () => {
  const calls = [];
  const responseFor = (url) => {
    calls.push(String(url));
    if (String(url).includes('tblk0NqOj3NM5tEjs')) {
      return { records: [{ id: 'rec-profile', fields: { ...profile.fields, status: 'Active' } }] };
    }
    if (String(url).includes('tblgWc5VRon5o8Mhk')) {
      return { records: [{ id: 'rec-member', fields: { 'Membership Status': 'Active', 'Membership Tier': 'VIP' } }] };
    }
    return { records: [] };
  };
  const result = await resolveModelKeywordRequest({
    env: {
      AIRTABLE_BASE_ID: 'app-test',
      AIRTABLE_API_KEY: 'test-token',
      LINE_KENJI_MODEL_KEYWORD_ENABLED: 'true'
    },
    text: 'Sin M ขอรายละเอียดและราคา',
    lineUserId: 'U-test',
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => responseFor(url)
    })
  });
  assert.equal(result.matched, true);
  assert.equal(result.access.status, 'active');
  assert.equal(result.reply.send_image, false);
  assert.equal(result.reply.send_price, false);
  assert.doesNotMatch(result.reply.text, /17500|17,500|PRIVATE/);
  assert.equal(calls.length, 3);
});
