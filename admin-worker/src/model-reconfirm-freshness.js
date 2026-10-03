// Shared by the owner-reviewed writer and the product sender. No chat text is a command.
export const RECONFIRM_REVISION_MARKER = "[MMD Reconfirm Revision v1] ";
const clean = v => typeof v === "string" ? v.trim() : "";
const pick = (f, name, id) => f[id] ?? f[name] ?? null;
export function reconfirmSnapshot(fields = {}) {
  return {
    job_date: pick(fields,"job_date","fldpnqoIsUMfN7y3c"),
    start_time: pick(fields,"start_time","fldBeG0FkWwa8kgnp"),
    end_time: pick(fields,"end_time","fldiDSz0wW9Ct9I3P"),
    location_name: pick(fields,"location_name","fldIiRpaxoafjTkFt"),
    google_map_url: pick(fields,"google_map_url","fldoUDQ8sH93idPx0"),
    model: pick(fields,"Canonical Model","fldrXQAyOMPCvbOaY"),
    client: pick(fields,"Client","fld6P6if0vDZCeV0C"),
  };
}
export async function reconfirmRevision(snapshot) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(snapshot)));
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function revisionAuditLine(fields, { request_id, actor_ref, resolved_at }) {
  const snapshot = reconfirmSnapshot(fields);
  return RECONFIRM_REVISION_MARKER + JSON.stringify({ revision: await reconfirmRevision(snapshot),
    snapshot, source: "owner_reviewed_customer_change", request_id, actor_ref, resolved_at });
}
export function latestRevisionEvidence(fields = {}) {
  const notes = clean(pick(fields,"notes","fldwl9Gs5tYlXG5ls"));
  const lines = notes.split("\n").filter(l=>l.startsWith(RECONFIRM_REVISION_MARKER));
  const evidence = [];
  try {
    for (const line of lines) {
      const e=JSON.parse(line.slice(RECONFIRM_REVISION_MARKER.length));
      if(e.source!=="owner_reviewed_customer_change" || !clean(e.request_id) || !clean(e.actor_ref)
        || !Number.isFinite(Date.parse(e.resolved_at)) || !/^[a-f0-9]{64}$/.test(e.revision) || !e.snapshot) return { error:"revision_evidence_invalid" };
      evidence.push(e);
    }
  } catch { return { error:"revision_evidence_invalid" }; }
  evidence.sort((a,b)=>Date.parse(b.resolved_at)-Date.parse(a.resolved_at));
  if(evidence.length>1 && evidence[0].resolved_at===evidence[1].resolved_at && evidence[0].revision!==evidence[1].revision)
    return {error:"revision_evidence_conflicting"};
  // Free-text manual changes are audit material, never executable authority.
  if(!evidence.length && /\[SCHEDULE UPDATE /.test(notes)) return {error:"manual_revision_requires_review"};
  return { evidence:evidence[0] || null };
}

// A blank ACK is unknown; reminder/overdue require evidence of a delivered notice.
export async function checkReconfirmFreshness(env, record, { now, readChanges }) {
  const f=record.fields || {}, snapshot=reconfirmSnapshot(f), latest=latestRevisionEvidence(f);
  if(latest.error) return {action:"review_required",reason:latest.error};
  const revision=await reconfirmRevision(snapshot);
  if(latest.evidence && (latest.evidence.revision!==revision || await reconfirmRevision(latest.evidence.snapshot)!==revision))
    return {action:"review_required",reason:"canonical_revision_conflict"};
  let changes;
  try {changes=await readChanges();} catch {return {action:"review_required",reason:"resolution_source_unavailable"};}
  if(!Array.isArray(changes)) return {action:"review_required",reason:"resolution_source_unavailable"};
  const ids=new Set(), requests=new Set();
  for(const r of changes) {
    const c=r.fields || {}, id=c.fldWMwebmHhyVQLzW;
    if(!r.id||ids.has(r.id)||!id||requests.has(id)||c.fldMD3Fhu0ibDmjk0!==f.session_id
      || JSON.stringify(c.fldbL2Ya44l6xEYe1)!==JSON.stringify([record.id]))
      return {action:"review_required",reason:"resolution_source_ambiguous"};
    ids.add(r.id);requests.add(id);
    if(!["time_change","date_change","location_change","reschedule","cancellation","remark"].includes(c.fldxg0WIVCmxtdRCF))
      return {action:"review_required",reason:"resolution_type_unknown"};
    if(!["pending_review","approved","applied","rejected","withdrawn"].includes(c.fldcBkBS70bWBgI8A))
      return {action:"review_required",reason:"resolution_state_unknown"};
    if(c.fldxg0WIVCmxtdRCF!=="remark" && ["pending_review","approved"].includes(c.fldcBkBS70bWBgI8A))
      return {action:"review_required",reason:c.fldcBkBS70bWBgI8A==="approved"?"resolution_application_pending":"awaiting_customer_choice_or_review"};
    if(c.fldxg0WIVCmxtdRCF!=="remark" && c.fldcBkBS70bWBgI8A==="applied") {
      const at=Date.parse(c.fldnnAWYmA0U1q8nX);
      if(!Number.isFinite(at)||at>now||!latest.evidence || at>Date.parse(latest.evidence.resolved_at))
        return {action:"review_required",reason:"resolution_revision_unreconciled"};
    }
  }
  if(latest.evidence && !changes.some(r=>r.fields?.fldWMwebmHhyVQLzW===latest.evidence.request_id
    && r.fields?.fldcBkBS70bWBgI8A==="applied" && r.fields?.fld8O7RW6UmzbfBKU===latest.evidence.actor_ref
    && Date.parse(r.fields?.fldnnAWYmA0U1q8nX)===Date.parse(latest.evidence.resolved_at)))
    return {action:"review_required",reason:"resolution_provenance_unverified"};
  const date=clean(snapshot.job_date), start=Date.parse(snapshot.start_time), end=Date.parse(snapshot.end_time);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start
    || new Date(start+7*3600000).toISOString().slice(0,10)!==date)
    return {action:"review_required",reason:"canonical_schedule_invalid"};
  return {action:"current",revision,resolved_at:latest.evidence?.resolved_at || null};
}
