// Pure local preparation: caller supplies the baseline config. No deployment API.
export function bootstrapConfig(baseline, migrationTag) {
  if (baseline.name !== 'mms-worker' || baseline.main !== 'src/runtime-index-with-dispatch.js'
      || !/^v[0-9]+-mms-therapist-profile$/.test(migrationTag || '')) throw Error('BASELINE_REVIEW_REQUIRED');
  const config = structuredClone(baseline);
  if (!Array.isArray(config.durable_objects?.bindings) || !Array.isArray(config.migrations)
      || config.durable_objects.bindings.some(b => b.name === 'MMS_THERAPIST_PROFILES' || b.class_name === 'MmsTherapistProfileCoordinator')
      || config.migrations.some(m => m.tag === migrationTag || JSON.stringify(m).includes('MmsTherapistProfileCoordinator'))) throw Error('LIFECYCLE_CONFLICT');
  config.main = 'src/profile-bootstrap-entry.mjs';
  config.vars = {...config.vars, MMS_PROFILE_WRITES_PAUSED:'true'};
  config.durable_objects.bindings.push({name:'MMS_THERAPIST_PROFILES',class_name:'MmsTherapistProfileCoordinator'});
  config.migrations.push({tag:migrationTag,new_sqlite_classes:['MmsTherapistProfileCoordinator']});
  return config;
}

// Add these files to a separately recovered, verified baseline checkout only.
// Never copy this PR's business runtime into that checkout.
export const bootstrapEntry = `import runtime from './runtime-index-with-dispatch.js';
export * from './runtime-index-with-dispatch.js';
import {DurableObject} from 'cloudflare:workers';
import {profileWritePaused,profileWritePauseResponse} from './therapist-profile-write-pause.mjs';
export class MmsTherapistProfileCoordinator extends DurableObject {
  fetch() { return Response.json({ok:false,error:{code:'PROFILE_BOOTSTRAP_DORMANT'}},{status:503}); }
}
export default { ...runtime, fetch(request,env,ctx) {
  if(env.MMS_PROFILE_WRITES_PAUSED !== 'true') return Response.json({ok:false,error:{code:'BOOTSTRAP_PAUSE_REQUIRED'}},{status:503});
  return profileWritePaused(request,env) ? profileWritePauseResponse() : runtime.fetch(request,env,ctx);
}};
`;
