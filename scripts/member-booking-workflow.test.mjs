import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {bookingReleaseMain} from './member-booking-release-cli.mjs';
const workflow=readFileSync(new URL('../.github/workflows/deploy-member-booking-artifact.yml',import.meta.url),'utf8');
test('Booking workflow separates PR review from manual production release',()=>{const on=workflow.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1];assert.ok(on);assert.deepEqual([...on.matchAll(/^  ([a-z_]+):/gm)].map(m=>m[1]),['pull_request','workflow_dispatch']);assert.match(on,/default: false/);assert.doesNotMatch(on,/workflow_run|push:/);});
test('workflow reuses existing owner gate and Member deploy concurrency without bypass or cancellation',()=>{assert.match(workflow,/group:.*booking-artifact-review-.*deploy-member-pages-worker-production/);assert.match(workflow,/cancel-in-progress: false/);assert.match(workflow,/needs: owner-policy/);assert.match(workflow,/environment: member-pages-code-only-owner/);assert.doesNotMatch(workflow,/environment: member-booking-artifact-owner/);});
test('owner preflight has no Cloudflare secret and release inputs bind main SHA plus migration',()=>{const before=workflow.slice(workflow.indexOf('  owner-policy:'),workflow.indexOf('\n  release:'));assert.doesNotMatch(before,/CLOUDFLARE_API_TOKEN/);assert.match(before,/--verify-protection/);assert.match(before,/inputs\.approved_sha == github\.sha/);assert.match(before,/inputs\.approved_migration_tag == 'v6-member-booking-coordinator-20261102'/);assert.match(before,/github\.actor == 'mmdprive'/);assert.match(before,/github\.ref == 'refs\/heads\/main'/);});
test('reviewed release path has pinned external build tool, regression checks and safe receipt persistence',()=>{assert.match(workflow,/--prefix "\$RUNNER_TEMP\/booking-build-tools".*esbuild@0\.27\.3/);assert.match(workflow,/node --test member-pages-worker\/test\/liff-member-oauth-host-return\.test\.mjs scripts\/member-booking-release\.test\.mjs/);assert.match(workflow,/RELEASE_MODE: booking-artifact-with-migration/);assert.match(workflow,/--execute-approved/);assert.match(workflow,/if: always\(\)/);assert.match(workflow,/booking-release-\$\{\{ github\.run_id \}\}\.json/);assert.doesNotMatch(workflow,/wrangler (deploy|route|secret)|git (push|merge)|npm run deploy/);});
test('CLI refuses missing/unknown flags and wrong release mode before invoking provider',async()=>{await assert.rejects(bookingReleaseMain([],{}));await assert.rejects(bookingReleaseMain(['--deploy'],{}));await assert.rejects(bookingReleaseMain(['--execute-approved'],{RELEASE_MODE:'code-only',PRODUCTION_APPROVED:'true'}));});

test('workflow preserves runner-provided GitHub identity variables',()=>{assert.doesNotMatch(workflow,/^\s+GITHUB_[A-Z_]+:/m);});

test('retired SIGIL workflow cannot deploy on main or mutate production even if manually dispatched',()=>{
 const legacy=readFileSync(new URL('../.github/workflows/deploy-sigil-booking-worker.yml',import.meta.url),'utf8');
 const events=legacy.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1];assert.ok(events);
 assert.deepEqual([...events.matchAll(/^  ([a-z_]+):/gm)].map(m=>m[1]),['workflow_dispatch']);
 assert.doesNotMatch(legacy,/secrets\.|CLOUDFLARE_|wrangler|actions\/checkout|method:\s*['"]?(POST|PUT|PATCH|DELETE)/);
 assert.match(legacy,/exit 1/);assert.match(legacy,/deploy-member-booking-artifact\.yml/);
});

test('runtime-only SIGIL policy requires explicit owner input',()=>{assert.match(workflow,/APPROVED_SOURCE_MAP_POLICY/);assert.match(workflow,/inputs\.approved_source_map_policy == 'local-evidence-only-not-uploaded'/);});

test('PR review validates head guards and immutable historical artifacts without production credentials',()=>{
 const review=workflow.slice(workflow.indexOf('  review:'),workflow.indexOf('  owner-policy:'));
 assert.match(review,/if: github\.event_name == 'pull_request'/);
 assert.match(review,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
 assert.match(review,/persist-credentials: false/);
 assert.match(review,/contents: read/);
 assert.match(review,/member-booking-release\.test\.mjs/);
 assert.match(review,/buildSigilBooking/);
 assert.doesNotMatch(review,/secrets\.|CLOUDFLARE_|environment:|--execute-approved|--verify-protection|PRODUCTION_APPROVED/);
 const owner=workflow.slice(workflow.indexOf('  owner-policy:'),workflow.indexOf('\n  release:'));
 assert.match(owner,/if: github\.event_name == 'workflow_dispatch'/);
 const release=workflow.slice(workflow.indexOf('\n  release:'));
 assert.match(release,/needs: owner-policy/);
});


test('legacy artifact review stays pinned while PR-head workflow and owner guards remain mandatory',()=>{
 const review=workflow.slice(workflow.indexOf('  review:'),workflow.indexOf('  owner-policy:'));
 const headGuards=review.indexOf('name: Validate PR-head workflow and owner guards');
 const legacyCheckout=review.indexOf('name: Check out immutable legacy Booking source');
 assert.ok(headGuards>0 && legacyCheckout>headGuards);
 assert.match(review.slice(headGuards,legacyCheckout),/run: node --test scripts\/member-booking-workflow\.test\.mjs scripts\/member-booking-owner-approval\.test\.mjs scripts\/member-booking-route-inventory\.test\.mjs/);
 assert.match(review,/ref: b5b4c1744927551f93a94534fde7b99ef1c571b4\n          path: legacy-booking-source\n          persist-credentials: false/);
 assert.match(review,/run: cmp scripts\/member-booking-release-contract\.json legacy-booking-source\/scripts\/member-booking-release-contract\.json/);
 assert.match(review,/name: Run offline Booking and release guard regressions\n        working-directory: legacy-booking-source\n        run: node --test/);
 assert.match(review,/name: Verify pinned runtime bytes offline\n        working-directory: legacy-booking-source\n/);
 assert.doesNotMatch(review,/continue-on-error:|--test-skip-pattern|if:.*false|\|\| true/);
});
