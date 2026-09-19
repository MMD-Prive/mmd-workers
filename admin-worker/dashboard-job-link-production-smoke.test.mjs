import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeDashboardJobLinks } from './src/job-orchestrator-owner-ops-wrapper.js';

test('production dashboard cards resolve only to published admin job surfaces', () => {
  const projected = canonicalizeDashboardJobLinks({
    ok: true,
    jobs: [
      { id: 'EMs20-Rossi', job_date: '2026-09-16', href: '/internal/admin/jobs/sess_ems20' },
      { id: 'EMs22-Whisp', job_date: '2026-09-17', href: '/internal/admin/jobs/sess_ems22' },
      { id: 'Book-IE', job_date: '2026-09-17', href: '/internal/admin/jobs/sess_book_ie' },
    ],
  });

  assert.deepEqual(projected.jobs.map((job) => job.href), [
    '/internal/admin/jobs/all?date=2026-09-16',
    '/internal/admin/jobs/all?date=2026-09-17',
    '/internal/admin/jobs/all?date=2026-09-17',
  ]);
  assert.equal(projected.jobs.some((job) => /^\/internal\/admin\/jobs\/sess_/.test(job.href)), false);
});
