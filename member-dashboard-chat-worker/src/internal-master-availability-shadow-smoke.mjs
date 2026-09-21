export const MASTER_AVAILABILITY_SHADOW_SMOKE_MODE = "publish_master_availability_shadow_smoke";

const URL = "https://admin-worker.local/v1/internal/sigil/availability-snapshot";
const MODEL_KEY = "mdl_pri_str_master";

function text(v){return String(v==null?"":v).trim();}

export async function runMasterAvailabilityShadowSmoke(env = {}) {
  const token = text(env.INTERNAL_TOKEN);
  if (!env.ADMIN_WORKER?.fetch || !token) {
    return { status: 503, payload: { ok:false, error:"admin_worker_binding_missing" } };
  }
  try {
    const response = await env.ADMIN_WORKER.fetch(new Request(URL,{
      method:"POST",
      headers:{
        authorization:`Bearer ${token}`,
        "content-type":"application/json",
        "x-mmd-internal-call":"true",
        "x-mmd-service-binding":"member-dashboard-chat-worker",
        "x-mmd-diagnostic":"master-availability-shadow-smoke"
      },
      body:JSON.stringify({
        model_key:MODEL_KEY,
        availability_state:"available_now",
        ttl_seconds:600
      })
    }));
    const body=await response.json().catch(()=>({}));
    return {
      status: response.status,
      payload: response.ok && body?.ok===true
        ? {
            ok:true,
            mode:MASTER_AVAILABILITY_SHADOW_SMOKE_MODE,
            shadow_only:true,
            customer_side_effects:false,
            model_key:MODEL_KEY,
            safe_availability_state:text(body.safe_availability_state),
            confidence:text(body.confidence),
            expires_at:text(body.expires_at)
          }
        : { ok:false, error:text(body?.error)||"availability_publish_failed" }
    };
  } catch {
    return { status:502, payload:{ok:false,error:"availability_publish_failed"} };
  }
}
