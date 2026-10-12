import {pathToFileURL} from 'node:url';

export async function deployUploadedWorkerVersion({worker,version,account,token,fetcher=fetch}) {
  if (!/^[a-z0-9-]+$/.test(worker || '') || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(version || '') || !/^[0-9a-f]{32}$/i.test(account || '') || !token) throw Error('Deployment inputs are missing or invalid');
  const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}`;
  const call=async(path,init={})=>{
    const response=await fetcher(root+path,{...init,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},signal:AbortSignal.timeout(30000)});
    const data=await response.json().catch(()=>null);
    if(!response.ok || data?.success !== true) throw Error(`Cloudflare ${init.method || 'GET'} ${path} failed (${response.status})`);
    return data.result;
  };
  // Read the exact uploaded version; never infer a version from deployment history.
  const uploaded=await call(`/versions/${version}`);
  if(uploaded?.id !== version) throw Error('Uploaded version readback mismatch');
  const created=await call('/deployments',{method:'POST',body:JSON.stringify({strategy:'percentage',versions:[{version_id:version,percentage:100}]})});
  if(!/^[0-9a-f-]{36}$/i.test(created?.id || '')) throw Error('Deployment ID missing');
  const deployed=await call(`/deployments/${created.id}`);
  if(deployed?.id !== created.id || deployed.strategy !== 'percentage' || deployed.versions?.length !== 1 || deployed.versions[0].version_id !== version || deployed.versions[0].percentage !== 100) throw Error('Deployment readback mismatch');
  return {worker,version,deployment:created.id};
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result=await deployUploadedWorkerVersion({worker:process.argv[2],version:process.argv[3],account:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN});
    console.log(JSON.stringify({ok:true,...result}));
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
