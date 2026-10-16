import {pathToFileURL} from 'node:url';
const ACCOUNT='b176eda1172b741fd2e58904cc9d77c5';
const WORKER='member-pages-worker';
export async function configureCms(env,fetcher=fetch){
 const cms=env.WEBFLOW_CMS_TOKEN?.trim(),cf=env.CLOUDFLARE_API_TOKEN?.trim(),expected=env.EXPECTED_WORKER_VERSION?.trim();
 if(!cms||!cf||!expected)throw Error('required_configuration_missing');
 const base=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${WORKER}`;
 async function cloud(path,options={}){const r=await fetcher(base+path,{...options,headers:{Authorization:`Bearer ${cf}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),redirect:'error'});const d=await r.json().catch(()=>null);if(!r.ok||d?.success!==true)throw Error('cloudflare_configuration_failed');return d.result;}
 const deployments=await cloud('/deployments');const versions=deployments.deployments?.[0]?.versions;
 if(versions?.length!==1||versions[0].percentage!==100||versions[0].version_id!==expected)throw Error('worker_version_changed');
 const r=await fetcher('https://api.webflow.com/v2/collections/6ad1c108b1deb34b49019a10/items/live?limit=1',{headers:{Authorization:`Bearer ${cms}`,accept:'application/json'},signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!r.ok){await r.body?.cancel();throw Error('webflow_cms_read_not_authorized');}const data=await r.json().catch(()=>null);if(!Array.isArray(data?.items))throw Error('webflow_cms_read_invalid');
 await cloud('/secrets',{method:'PUT',body:JSON.stringify({name:'WEBFLOW_CMS_TOKEN',type:'secret_text',text:cms})});
 const settings=await cloud('/settings');if(!settings.bindings?.some(x=>x.name==='WEBFLOW_CMS_TOKEN'&&x.type==='secret_text'))throw Error('secret_binding_readback_failed');
 return {worker:WORKER,binding:'WEBFLOW_CMS_TOKEN',configured:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){configureCms(process.env).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('CMS configuration failed. Check required secrets, expected version and CMS read permission. Secret values are never printed.');process.exitCode=1;});}
