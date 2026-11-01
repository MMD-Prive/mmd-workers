// Customer display projection only. Protected APIs keep their existing entitlement gates.
const TIERS = Object.freeze({
  mmd_member: ['public', 'MMD Member'], public_member: ['public', 'MMD Member'], public_membership: ['public', 'MMD Member'], member_690: ['public', 'MMD Member'],
  elite: ['public', 'Elite'], public_elite: ['public', 'Elite'], red_card: ['public', 'Red Card'], redcard: ['public', 'Red Card'], public_red_card: ['public', 'Red Card'],
  standard: ['sigil', 'Standard'], standard_package: ['sigil', 'Standard'], private_standard: ['sigil', 'Standard'],
  premium: ['sigil', 'Premium'], premium_package: ['sigil', 'Premium'], private_premium: ['sigil', 'Premium'],
  guest_pass: ['sigil', 'Guest Pass'], trial_guest_pass: ['sigil', 'Guest Pass'], '7days': ['sigil', 'Guest Pass'],
  vip: ['sigil', 'VIP'], blackcard: ['sigil', 'Black Card'], black_card: ['sigil', 'Black Card'],
});
export function memberWorldForPackage(code) { return TIERS[String(code || '').toLowerCase().replace(/[ -]+/g, '_')] || null; }
export function checkingMemberWorlds() { return { schema: 'member_worlds_v1', public: { state: 'checking', tier: null, expiresAt: null }, sigil: { state: 'checking', tier: null, expiresAt: null } }; }
export function projectMemberWorlds(packages, { status = 'checking', today = '', blocked = false } = {}) {
  const result = checkingMemberWorlds();
  if (status !== 'verified' || !Array.isArray(packages)) return result;
  for (const world of ['public', 'sigil']) {
    const rows = packages.filter(p => memberWorldForPackage(p.code)?.[0] === world);
    if (!rows.length) { result[world] = { state: 'none', tier: null, expiresAt: null }; continue; }
    // Resolve independently per world; never let a new Public purchase replace SIGIL.
    if (rows.length > 1 && rows.some(p => !Number.isFinite(p.created_at))) continue;
    const newest = Math.max(...rows.map(p => p.created_at ?? 0));
    const winners = rows.filter(p => (p.created_at ?? 0) === newest);
    if (winners.length !== 1) continue;
    const p = winners[0], tier = memberWorldForPackage(p.code)[1];
    if (tier === 'Black Card' && p.customer_visible_black_card !== true) continue;
    let state = ['active', 'grace', 'expired', 'cancelled', 'refunded'].includes(p.status) ? p.status : 'checking';
    if (p.start_date && today && p.start_date > today) state = 'checking';
    if (state === 'active' && p.end_date && today && p.end_date < today) state = 'expired';
    if (blocked) state = 'restricted';
    result[world] = { state, tier, expiresAt: p.end_date || null };
  }
  return result;
}
export function serializeMemberWorlds(input) {
  const result = checkingMemberWorlds();
  if (input?.schema !== result.schema) return result;
  for (const world of ['public', 'sigil']) {
    const row = input[world];
    const allowed = world === 'public' ? ['MMD Member', 'Elite', 'Red Card'] : ['Guest Pass', 'Standard', 'Premium', 'VIP', 'Black Card'];
    if (!row || !['checking', 'none', 'active', 'grace', 'expired', 'cancelled', 'refunded', 'restricted'].includes(row.state)) continue;
    if (row.tier !== null && !allowed.includes(row.tier)) continue;
    if (row.state !== 'checking' && row.state !== 'none' && !row.tier) continue;
    result[world] = { state: row.state, tier: row.tier, expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(String(row.expiresAt || '')) ? row.expiresAt : null };
  }
  return result;
}
