import { DurableObject } from "cloudflare:workers";
import { AirtableCampaignMutationStore } from "./campaign-airtable-store.js";
import { executeMutationGate, GateError } from "./campaign-mutation-core.js";
import { AirtablePaymentTruthStore, PaymentTruthError } from "./campaign-payment-truth.js";
import { isPrivatePromotionRequest } from "./campaign-auth.js";

const VERIFY_PATH = "/v1/internal/campaign-payments/verify";
const APPLY_PATH = "/v1/internal/campaign-benefits/apply";

export async function handleCampaignInternalRoute(request, env) {
  const url = new URL(request.url);
  if (![VERIFY_PATH, APPLY_PATH].includes(url.pathname) || request.method !== "POST") return null;
  if (url.hostname !== "payments-worker.local") return null;
  if (!(await isPrivatePromotionRequest(request, env))) return response({ ok:false,error:"forbidden" },403);
  try {
    const body = await request.json();
    if (url.pathname === VERIFY_PATH) {
      const store = env.CAMPAIGN_PAYMENT_TRUTH_STORE || new AirtablePaymentTruthStore(env);
      return response({ ok:true, ...(await store.verify(body)) });
    }
    if (!env.CAMPAIGN_MUTATION_COORDINATOR?.getByName) return response({ok:false,error:"campaign_mutation_coordinator_missing"},503);
    return env.CAMPAIGN_MUTATION_COORDINATOR.getByName(`claim:${String(body.claimId||"")}`).fetch(
      new Request("https://campaign-mutation.local/apply",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}));
  } catch (error) {
    const status = error instanceof PaymentTruthError ? error.status : error instanceof GateError ? 400 : 503;
    return response({ok:false,error:error.code||"campaign_internal_error"},status);
  }
}

export class CampaignMutationCoordinator extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.queue=Promise.resolve();}
  async fetch(request){let release;const turn=new Promise((resolve)=>{release=resolve;});const previous=this.queue;this.queue=turn;await previous;
    try{const input=await request.json();const store=this.env.CAMPAIGN_MUTATION_STORE||new AirtableCampaignMutationStore(this.env);
      const result=await executeMutationGate(input,store);return response(result,result.ok?200:409);
    }catch(error){const status=error instanceof GateError?400:503;return response({ok:false,status:"failed",error:error.code||"campaign_mutation_failed",results:[]},status);}
    finally{release();}}
}

function response(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
