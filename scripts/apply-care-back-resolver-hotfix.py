from pathlib import Path

source = Path("member-pages-worker/src/liff-identity-foundation.js")
s = source.read_text()

if 'const MEMBER_RESOLVER_TIMEOUT_MS = 5000;' not in s:
    raise SystemExit("member resolver timeout constant changed unexpectedly")
s = s.replace('const MEMBER_RESOLVER_TIMEOUT_MS = 5000;', 'const MEMBER_RESOLVER_TIMEOUT_MS = 8000;', 1)

start_marker = '  const identityKey = await keyedDigest(env, `identity:${verified.sub}`);'
end_marker = '  const pending = existing.exists ? null : await getOrCreatePendingIdentity(env, identityKey);'
start = s.find(start_marker)
end = s.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("handleStart resolver block changed unexpectedly")
end += len(end_marker)
new_block = "\n".join([
    '  const identityKey = await keyedDigest(env, `identity:${verified.sub}`);',
    '  const memberState = await resolveMemberIdentity(env, verified.sub);',
    '  if (!memberState.ok) {',
    '    return json({ ok: false, error: { code: "MEMBER_RESOLUTION_FAILED", message: "Member identity could not be resolved safely." } }, 503);',
    '  }',
    '',
    '  const pending = memberState.exists ? null : await getOrCreatePendingIdentity(env, identityKey);',
])
s = s[:start] + new_block + s[end:]

replacements = {
    'member_exists: existing.exists,': 'member_exists: memberState.exists,',
    'member_id: memberProfile?.member_id || null,': 'member_id: memberState.member_id || null,',
    'member_profile: memberProfile?.profile || null,': 'member_profile: memberState.profile || null,',
    'next_screen_key: liffIntent === "unknown" ? "start_intent" : nextScreenForIntent(liffIntent, existing.exists),': 'next_screen_key: liffIntent === "unknown" ? "start_intent" : nextScreenForIntent(liffIntent, memberState.exists),',
}
for old, new in replacements.items():
    if old not in s:
        raise SystemExit(f"expected source expression missing: {old}")
    s = s.replace(old, new, 1)

marker = 'async function resolveExistingMember(env, lineUserId) {'
helper = "\n".join([
    'async function resolveMemberIdentity(env, lineUserId) {',
    '  const resolver = env.MEMBER_STATUS_RESOLVER;',
    '  const resolverSecret = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");',
    '  if (!resolver?.fetch || resolverSecret.length < 32) return { ok: false, exists: false };',
    '  const startedAt = Date.now();',
    '  const controller = new AbortController();',
    '  const timeout = setTimeout(() => controller.abort(), Number(env.LIFF_MEMBER_RESOLVER_TIMEOUT_MS || MEMBER_RESOLVER_TIMEOUT_MS));',
    '  try {',
    '    const response = await resolver.fetch(new Request(`https://mmd-auth-worker.internal${MEMBER_PROFILE_RESOLVER_PATH}`, {',
    '      method: "POST",',
    '      headers: {',
    '        "content-type": "application/json",',
    '        [MEMBER_RESOLVER_SECRET_HEADER]: resolverSecret,',
    '      },',
    '      body: JSON.stringify({ line_user_id: lineUserId, purpose: MEMBER_PROFILE_RESOLVER_PURPOSE }),',
    '      signal: controller.signal,',
    '    }));',
    '    const payload = await response.json().catch(() => null);',
    '    const data = payload?.data && typeof payload.data === "object" ? payload.data : null;',
    '    if (!response.ok || payload?.ok === false || !data || typeof data.member_exists !== "boolean") {',
    '      console.warn({',
    '        event: "member_profile_resolver_failure",',
    '        stage: "member_profile_read",',
    '        failure_class: response.status >= 500 ? "upstream_5xx" : "invalid_response",',
    '        status: response.status,',
    '        duration_ms: Math.max(0, Date.now() - startedAt),',
    '      });',
    '      return { ok: false, exists: false };',
    '    }',
    '    if (data.member_exists !== true) return { ok: true, exists: false, member_id: null, profile: null };',
    '    if (!data.member_id || !data.profile) {',
    '      console.warn({',
    '        event: "member_profile_resolver_failure",',
    '        stage: "member_profile_read",',
    '        failure_class: "malformed_member_profile",',
    '        status: response.status,',
    '        duration_ms: Math.max(0, Date.now() - startedAt),',
    '      });',
    '      return { ok: false, exists: false };',
    '    }',
    '    return {',
    '      ok: true,',
    '      exists: true,',
    '      member_id: String(data.member_id).trim().slice(0, 160),',
    '      profile: safeMemberProfile(data.profile),',
    '    };',
    '  } catch (error) {',
    '    console.warn({',
    '      event: "member_profile_resolver_failure",',
    '      stage: "member_profile_read",',
    '      failure_class: error?.name === "AbortError" ? "timeout" : "request_failure",',
    '      status: null,',
    '      duration_ms: Math.max(0, Date.now() - startedAt),',
    '    });',
    '    return { ok: false, exists: false };',
    '  } finally {',
    '    clearTimeout(timeout);',
    '  }',
    '}',
    '',
])
if marker not in s:
    raise SystemExit("resolveExistingMember marker missing")
s = s.replace(marker, helper + marker, 1)
source.write_text(s)

wrangler = Path("member-pages-worker/wrangler.toml")
w = wrangler.read_text()
if w.count('LIFF_MEMBER_RESOLVER_TIMEOUT_MS = "5000"') != 2:
    raise SystemExit("unexpected member resolver timeout config count")
w = w.replace('LIFF_MEMBER_RESOLVER_TIMEOUT_MS = "5000"', 'LIFF_MEMBER_RESOLVER_TIMEOUT_MS = "8000"')
wrangler.write_text(w)

test = Path("member-pages-worker/test/liff-identity-foundation.test.mjs")
t = test.read_text()

legacy_assertion = '    assert.equal(memberResolver.calls[0].purpose, "liff_identity_resolution");'
replacement_assertion = '\n'.join([
    '    assert.equal(memberResolver.calls.length, 1);',
    '    assert.equal(memberResolver.calls[0]._path, "/__internal/member-profile/read");',
    '    assert.equal(memberResolver.calls[0].purpose, "liff_member_profile_read");',
])
if legacy_assertion not in t:
    raise SystemExit("legacy resolver expectation missing")
t = t.replace(legacy_assertion, replacement_assertion, 1)

test_marker = '  it("valid LINE token succeeds, sets secure session cookie, and returns no raw token", async () => {'
addition = "\n".join([
    '  it("resolves LIFF start with one member-profile resolver call and no duplicate status lookup", async () => {',
    '    const memberResolver = resolver({',
    '      member_exists: true,',
    '      mmd_member_id: "MMD-SINGLE-LOOKUP",',
    '      profile: {',
    '        display_name: "Single Lookup Member",',
    '        tier: "Standard",',
    '        membership_status: "active",',
    '        points: 120,',
    '        history_window: { from: "2025-08-10", to: "2026-08-10", timezone: "Asia/Bangkok" },',
    '        history: [],',
    '      },',
    '    });',
    '    const runtime = env({ MEMBER_STATUS_RESOLVER: memberResolver });',
    '    const started = await start(runtime);',
    '    assert.equal(started.response.status, 200);',
    '    assert.equal(memberResolver.calls.length, 1);',
    '    assert.equal(memberResolver.calls[0]._path, "/__internal/member-profile/read");',
    '    assert.equal(memberResolver.calls[0].purpose, "liff_member_profile_read");',
    '  });',
    '',
    '  it("uses the same single profile contract for an unknown LINE identity", async () => {',
    '    const memberResolver = resolver({ member_exists: false });',
    '    const runtime = env({ MEMBER_STATUS_RESOLVER: memberResolver });',
    '    const started = await start(runtime);',
    '    assert.equal(started.response.status, 200);',
    '    assert.equal(started.payload.data.identity_state, "pending_identity");',
    '    assert.equal(memberResolver.calls.length, 1);',
    '    assert.equal(memberResolver.calls[0]._path, "/__internal/member-profile/read");',
    '  });',
    '',
])
if test_marker not in t:
    raise SystemExit("test insertion marker missing")
t = t.replace(test_marker, addition + test_marker, 1)
test.write_text(t)

print("resolver hotfix patch applied")
