export function claimDispatchJobWinner(sql, jobId, therapistId, now) {
  sql.exec(
    `UPDATE dispatch_jobs
     SET state='ACCEPTED', winner_therapist_id=?, accepted_at=?, version=version+1, updated_at=?
     WHERE job_id=? AND winner_therapist_id IS NULL`,
    therapistId,
    now,
    now,
    jobId,
  );
  return sql.exec(
    "SELECT winner_therapist_id FROM dispatch_jobs WHERE job_id=?",
    jobId,
  ).toArray()[0]?.winner_therapist_id || null;
}
