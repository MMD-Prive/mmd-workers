import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationalJobList } from './src/dashboard-worker.js';

const record = (id, date, status = 'confirmed', time = '18:00') => ({ id, fields: { session_id: id, job_date: date, status, start_time: time } });

test('daily home excludes terminal and past jobs, retaining today and future in Bangkok', () => {
  const jobs = buildOperationalJobList([
    record('past', '2026-10-13'), record('today', '2026-10-14'), record('future', '2026-10-15'),
    ...['cancelled', 'completed', 'finished', 'voided', 'rejected'].map((state) => record(state, '2026-10-14', state)),
    record('undated', ''),
  ], new Date('2026-10-13T18:00:00Z'));
  assert.deepEqual(jobs.map((job) => job.id), ['today', 'future']);
  assert.equal(jobs[0].href, '/internal/admin/jobs/all?session_id=today');
});

test('counts can use the full loaded daily set before the six-row display limit', () => {
  const records = [record('old', '2026-10-13'), ...Array.from({ length: 9 }, (_, i) => record('today_' + i, '2026-10-14'))];
  assert.equal(buildOperationalJobList(records, new Date('2026-10-14T02:00:00Z')).length, 9);
});
