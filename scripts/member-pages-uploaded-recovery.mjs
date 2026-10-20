// Review-only inspector for the single orphaned startup version. No CLI, credentials,
// upload, promotion, deletion, retries or modification of the existing release path.
import {createHash} from 'node:crypto';
import {ROOT, VERSION_ROOT, ZONE, CODE_ONLY_SOURCE_SHA, activeVersion,
  versionConfiguration, versionAnnotations} from './member-pages-code-only-release.mjs';

export const RECOVERY_TARGET = Object.freeze({
  run:39488159580,
  original_release_sha:'0dc4903ae5eea5519e87e2d7e07f8cf196bbdf60',
  source_sha:CODE_ONLY_SOURCE_SHA,
  uploaded_version:'eef80a0c-afb7-4abc-bd91-6b02f5440d02',
  baseline_version:'74af4c9a-d361-4ef7-a4d9-159f1c5c80ab',
  baseline_deployment:'6ad58301-05a5-4856-ad32-a268ae6a2688',
  bundle_sha256:'ef46ed111dc97acb4391635cafc9cf2f8918c903aee85b7e9bb65172dacd45f4',
});
const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;
const canonical=x=>JSON.stringify(sort(x));
const ordered=x=>[...x].sort((a,b)=>canonical(a).localeCompare(canonical(b)));
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const requireEvidence=(ok)=>{if(!ok)throw Error('evidence mismatch');};

export async function inspectUploadedRecovery(io) {
  let stage='ORIGINAL_RECEIPT_CHECK';
  const read=(path,query)=>io.read(path,{method:'GET',...(query?{query}:{})});
  try {
    // These are caller-supplied evidence, not proof of original artifact authenticity.
    // Even complete matches produce REVIEW_ONLY, never permission to mutate.
    const r=io.originalReceipt,t=RECOVERY_TARGET;
    requireEvidence(r?.phase==='stopped'&&r.stopped_after==='uploaded-not-promoted'&&
      r.worker==='member-pages-worker'&&r.release_sha===t.original_release_sha&&
      r.source_sha===t.source_sha&&r.uploaded_version===t.uploaded_version&&
      r.baseline_version===t.baseline_version&&r.baseline_deployment===t.baseline_deployment&&
      r.bundle_sha256===t.bundle_sha256&&
      ['configuration_digest','settings_digest','boundary_digest'].every(k=>hex(r[k])));
    stage='ACTIVE_BASELINE_CHECK';
    const deployment=(await read(ROOT+'/deployments'))?.deployments?.[0];
    requireEvidence(deployment?.id===t.baseline_deployment&&activeVersion(deployment)===t.baseline_version);
    stage='UPLOADED_ORDER_CHECK';
    const versions=(await read(ROOT+'/versions'))?.items;
    requireEvidence(versions?.[0]?.id===t.uploaded_version&&versions?.[1]?.id===t.baseline_version);
    stage='RECOVERY_CONFIG_CHECK';
    const baseline=await read(ROOT+'/versions/'+t.baseline_version);
    const uploaded=await read(ROOT+'/versions/'+t.uploaded_version);
    requireEvidence(baseline?.id===t.baseline_version&&uploaded?.id===t.uploaded_version);
    requireEvidence(digest(versionConfiguration(baseline))===r.configuration_digest&&
      digest(versionConfiguration(uploaded))===r.configuration_digest);
    stage='RECOVERY_ANNOTATION_CHECK';
    const annotationVersion=await read(VERSION_ROOT+'/'+t.uploaded_version);
    requireEvidence(annotationVersion?.id===t.uploaded_version);
    const annotations=versionAnnotations(annotationVersion);
    requireEvidence(annotations?.['workers/commit_sha']===t.source_sha&&
      annotations?.['workers/message']===`member-pages code-only source-sha=${t.source_sha}`);
    stage='RECOVERY_SETTINGS_CHECK';
    requireEvidence(digest(await read(ROOT+'/script-settings'))===r.settings_digest);
    stage='RECOVERY_BOUNDARY_CHECK';
    const schedules=await read(ROOT+'/schedules');
    requireEvidence(Array.isArray(schedules?.schedules));
    const boundary={routes:ordered(await read(`/zones/${ZONE}/workers/routes`)),
      schedules:ordered(schedules.schedules),subdomain:await read(ROOT+'/subdomain')};
    requireEvidence(digest(boundary)===r.boundary_digest);
    stage='RECOVERY_ARTIFACT_CHECK';
    verifyRecoveryArtifact(await read(VERSION_ROOT+'/'+t.uploaded_version,{include:'modules'}),t);
    // A successful GET/hash match still does not authorize any production mutation.
    return {state:'REVIEW_ONLY',can_promote:false,readback_matches:true,
      uploaded_version:t.uploaded_version,source_sha:t.source_sha,
      artifact_bytes_match:true,missing:['ORIGINAL_RUN_ARTIFACT_AUTHENTICITY',
        'FRESH_OWNER_APPROVAL','APPROVED_RECOVERY_EXECUTOR'],overall_phase:'OPEN'};
  } catch {
    // Return only fixed stage/code; never error text or raw provider/caller evidence.
    return {state:'BLOCKED',can_promote:false,stage,code:'RECOVERY_EVIDENCE_UNVERIFIED',overall_phase:'OPEN'};
  }
}

// Generic byte validator is independently fixture-tested. The inspector above always
// passes the immutable, exact production target, never caller-supplied expected hashes.
export function verifyRecoveryArtifact(version,target) {
  requireEvidence(version?.id===target.uploaded_version&&version.main_module==='worker.js'&&
    Array.isArray(version.modules)&&version.modules.length===1&&hex(target.bundle_sha256));
  const m=version.modules[0];
  requireEvidence(m?.name==='worker.js'&&m.content_type==='application/javascript+module'&&
    typeof m.content_base64==='string'&&m.content_base64.length>0&&m.content_base64.length<=16_000_000);
  const bytes=Buffer.from(m.content_base64,'base64');
  requireEvidence(bytes.byteLength>0&&bytes.toString('base64')===m.content_base64);
  requireEvidence(createHash('sha256').update(bytes).digest('hex')===target.bundle_sha256);
  return true;
}
