"""Manual protected admin-only code release. No build, config write, journal or business access."""
import importlib.util
import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

spec=importlib.util.spec_from_file_location('primitives',Path(__file__).with_name('refund-release-preserved.py'))
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
ROOT=r.root('admin-worker')
BASELINE='3ad8fc25-b3c4-4059-92b2-21510868049c'
DEPLOYMENT='83c232bb-82fc-4018-bad3-1a2ca933efb3'
JS_HASH='78788eb6898dca9856341b2db276c3f51c957044c5ee0152402d876fe008ec9a'
MAP_HASH='8f8ef8b9566e5fdbb45c581996dda02aa1fc8219dc8cbfc0649da1020a773586'
BASE_HASH='80dd781bcf3f29c08c2b2fedb1b362b9fe8ca8fce0eda4866f3dd7281adece16'
MAP_NAME='admin-login-hero-worker.js.map'
PIN={'bindings':'1bf7cf5c55d261a1dd80c2508c8082ecdd1a1d1cee405e6cae17c8fbf49c097e','settings':'05be6e629ec1b14f373363280a526933d71653cd4e0ac02ac84a6eb1d5cb53b7','schedules':'c35269605719c46cbc18afdc48f2a4e34c83fa3e2c80b6380833fcd0cb6404e0','routes':'d4ae00859e75100a0f097d34e062d68649f0a19194c7e3876564750cfd771a5f','lifecycle':'65147c1c08c305585a1beef91adfcba496946bbe76fb32a8f060e7dc34f0dee6'}

class Api(r.Api):
    def __call__(self,method,route,body=None,content_type=None,raw=False):
        suffix=route[len(ROOT):] if route.startswith(ROOT) else None
        reads=suffix in ['', '/content/v2','/settings','/schedules','/versions?per_page=100','/deployments?per_page=100'] or bool(suffix and re.fullmatch(r'/(versions|deployments)/[a-f0-9-]{36}',suffix))
        reads=reads or route in [f'/zones/{r.ZONE}/workers/routes',f'/accounts/{r.ACCOUNT}/r2/buckets/mmd-line-slip-evidence/lifecycle']
        r.require(method=='GET' and reads or method=='POST' and route in [ROOT+'/versions?bindings_inherit=strict',ROOT+'/deployments'],'outside admin-only code release scope')
        if route==ROOT+'/content/v2':
            r.require(raw,'raw map GET only')
            return r.snapshot.get(self.token,'admin-worker','/content/v2')
        if method=='POST' and route==ROOT+'/versions?bindings_inherit=strict':
            request=urllib.request.Request('https://api.cloudflare.com/client/v4'+route,data=body,headers={'Authorization':'Bearer '+self.token,'Content-Type':content_type},method='POST')
            try:
                with self.opener.open(request,timeout=90) as response:
                    data=response.read(r.snapshot.MAX_BYTES+1)
                    r.require(len(data)<=r.snapshot.MAX_BYTES,'version response exceeds limit')
                    payload=json.loads(data)
                    r.require(payload.get('success') is True,'upload unconfirmed')
                    return payload['result']
            except urllib.error.HTTPError as error:
                raise RuntimeError('Cloudflare version POST HTTP '+str(error.code)+'; no retry') from None
        return super().__call__(method,route,body,content_type,raw)

def infrastructure(api):
    settings=api('GET',ROOT+'/settings')
    routes=api('GET',f'/zones/{r.ZONE}/workers/routes')
    values={'bindings':r.digest(r.safe_bindings(settings['bindings'])),'settings':r.digest({k:v for k,v in settings.items() if k not in ['bindings','annotations']}),'schedules':r.digest(api('GET',ROOT+'/schedules')),'routes':r.digest(sorted([{k:x[k] for k in ['id','pattern','script']} for x in routes if x.get('script')=='admin-worker'],key=lambda x:x['pattern'])),'lifecycle':r.digest(api('GET',f'/accounts/{r.ACCOUNT}/r2/buckets/mmd-line-slip-evidence/lifecycle'))}
    r.require(values==PIN,'live infrastructure drift')
    return values

def active(api):
    return r.active(api,'admin-worker')

def artifacts(folder,reviewed):
    d=Path(folder)
    m=json.loads((d/'manifest.json').read_text())
    r.require(m['reviewed_source']==reviewed,'artifact reviewed source mismatch')
    r.require(m['compatible_sha256']==JS_HASH and m['compatible_map_sha256']==MAP_HASH,'artifact manifest hash mismatch')
    r.require(m['active_baseline']['version']==BASELINE,'wrong artifact baseline')
    for name,expected in [('worker.js',JS_HASH),(MAP_NAME,MAP_HASH)]:
        r.require(r.digest((d/name).read_bytes())==expected,'reviewed artifact bytes differ')
    return m

def map_semantics(value):
    v=r.semantic_map(value,'worker.js')
    if v['sourceRoot'] in ['',None]:v['sourceRoot']=None
    return v

def release(api,folder,outdir,merge_sha,reviewed):
    r.require(bool(re.fullmatch('[a-f0-9]{40}',merge_sha)) and bool(re.fullmatch('[a-f0-9]{40}',reviewed)),'full approved source SHAs required')
    manifest=artifacts(folder,reviewed)
    out=Path(outdir);out.mkdir(parents=True,exist_ok=True)
    marker=f'PAYOUT3041 artifact={JS_HASH} reviewed={reviewed} merge={merge_sha}'
    receipt={'worker':'admin-worker','baseline':BASELINE,'reviewed_source':reviewed,'merge_sha':merge_sha,'js_sha256':JS_HASH,'map_sha256':MAP_HASH,'phase':'preflight','business_writes':0,'real_messages':0}
    def save(**change):
        receipt.update(change);(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    save(at=datetime.now(timezone.utc).isoformat())
    try:
        before=infrastructure(api)
        baseline=api('GET',ROOT+'/versions/'+BASELINE)
        rows=api('GET',ROOT+'/versions?per_page=100')['items']
        matches=[v for v in rows if v.get('annotations',{}).get('workers/message')==marker]
        r.require(len(matches)<=1,'ambiguous upload; no replay')
        candidate=api('GET',ROOT+'/versions/'+matches[0]['id']) if matches else None
        current=active(api)
        r.require(current['versions']==[{'version_id':BASELINE,'percentage':100}] or candidate and current['versions']==[{'version_id':candidate['id'],'percentage':100}],'active baseline drift')
        if candidate is None:
            r.require(current['id']==DEPLOYMENT and rows and rows[0]['id']==BASELINE,'baseline/latest changed before upload')
            raw,headers=api('GET',ROOT,raw=True)
            r.require(headers['etag'].strip('"')==baseline['resources']['script']['etag'],'baseline ETag mismatch')
            parts=r.snapshot.parts(raw,headers,'worker.js')
            r.require(r.digest(parts['worker.js'])==BASE_HASH,'current live bytes differ from reviewed baseline')
            r.require(active(api)['id']==DEPLOYMENT,'deployment moved before upload')
            metadata={'main_module':'worker.js','compatibility_date':baseline['resources']['script_runtime']['compatibility_date'],'compatibility_flags':baseline['resources']['script_runtime'].get('compatibility_flags',[]),'usage_model':baseline['resources']['script_runtime']['usage_model'],'bindings':[{'name':b['name'],'type':'inherit'} for b in baseline['resources']['bindings']],'annotations':{'workers/message':marker,'workers/commit_sha':reviewed,'workers/tag':'payout-'+JS_HASH[:12]}}
            body,kind=r.multipart(metadata,[('worker.js','application/javascript+module',Path(folder,'worker.js').read_bytes()),(MAP_NAME,'application/source-map',Path(folder,MAP_NAME).read_bytes())])
            save(phase='upload_intent')
            try:
                uploaded=api('POST',ROOT+'/versions?bindings_inherit=strict',body,kind)
                candidate=api('GET',ROOT+'/versions/'+uploaded['id'])
            except Exception:
                found=[v for v in api('GET',ROOT+'/versions?per_page=100')['items'] if v.get('annotations',{}).get('workers/message')==marker]
                r.require(len(found)==1,'upload outcome unknown; no POST retry')
                candidate=api('GET',ROOT+'/versions/'+found[0]['id'])
        save(phase='uploaded',version_id=candidate['id'],version_number=candidate.get('number'))
        r.require(r.configuration(candidate)==r.configuration(baseline),'configuration or interface differs; no promotion')
        r.require(candidate.get('annotations',{}).get('workers/message')==marker,'candidate provenance mismatch')
        latest=api('GET',ROOT+'/versions?per_page=100')['items']
        r.require(len(latest)>=2 and latest[0]['id']==candidate['id'] and latest[1]['id']==BASELINE,'intervening upload; inherited secrets cannot be proven unchanged')
        r.require(infrastructure(api)==before,'infrastructure moved')
        now=active(api)
        if now['versions']!=[{'version_id':candidate['id'],'percentage':100}]:
            r.require(now['id']==current['id']==DEPLOYMENT,'baseline moved before promotion')
            save(phase='promotion_intent')
            promotion='Promote '+marker
            try:
                created=api('POST',ROOT+'/deployments',{'strategy':'percentage','versions':[{'version_id':candidate['id'],'percentage':100}],'annotations':{'workers/message':promotion}})
                created_id=created['id']
            except Exception:
                found=[d for d in api('GET',ROOT+'/deployments?per_page=100')['deployments'] if d.get('annotations',{}).get('workers/message')==promotion and d['versions']==[{'version_id':candidate['id'],'percentage':100}]]
                r.require(len(found)==1,'promotion outcome unknown; no POST retry');created_id=found[0]['id']
            now=active(api);r.require(now['id']==created_id,'exact created deployment not active')
        r.require(now['versions']==[{'version_id':candidate['id'],'percentage':100}],'allocation mismatch')
        save(phase='promoted',deployment_id=now['id'])
        raw,headers=api('GET',ROOT,raw=True)
        r.require(headers['etag'].strip('"')==candidate['resources']['script']['etag'],'served version ETag mismatch')
        parts=r.snapshot.parts(raw,headers,'worker.js')
        if not any(n.endswith('.map') for n in parts):
            raw,h=api('GET',ROOT+'/content/v2',raw=True)
            r.require(h['etag'].strip('"')==headers['etag'].strip('"'),'map ETag mismatch')
            for n,b in r.snapshot.parts(raw,h,'worker.js').items():
                r.require(n not in parts or parts[n]==b,'conflicting served source');parts[n]=b
        for name,data in parts.items():(out/name).write_bytes(data)
        r.require(r.digest(parts['worker.js'])==JS_HASH,'served JS hash mismatch')
        maps=[b for n,b in parts.items() if n.endswith('.map')]
        r.require(len(maps)==1 and map_semantics(json.loads(maps[0]))==map_semantics(json.loads(Path(folder,MAP_NAME).read_text())),'served map differs')
        r.require(infrastructure(api)==before and active(api)['id']==now['id'],'final infrastructure/deployment drift')
        save(phase='verified',code_readback_exact=True,map_readback_semantic_equal=True,map_readback_sha256=r.digest(maps[0]),configuration_preserved=True,journal_lifecycle_preserved=True,completed_at=datetime.now(timezone.utc).isoformat())
        return receipt
    except Exception:
        save(outcome='STOPPED_NO_WRITE_RETRY',failed_at=datetime.now(timezone.utc).isoformat())
        raise

def gate(env):
    r.require(env.get('PRODUCTION_APPROVED')=='true' and env.get('GITHUB_EVENT_NAME')=='workflow_dispatch' and env.get('GITHUB_REF')=='refs/heads/main','explicit protected manual main approval required')
    r.require(env.get('APPROVED_SHA')==env.get('GITHUB_SHA') and re.fullmatch('[a-f0-9]{40}',env.get('APPROVED_SHA','')),'approved main SHA mismatch')
    r.require(bool(env.get('APPROVAL_REF','').strip()),'approval reference required')
    for name in ['ARTIFACT_RUN_ID','ARTIFACT_ID']:r.require(bool(re.fullmatch('[0-9]+',env.get(name,''))),'exact artifact identifiers required')
    r.require(bool(re.fullmatch('[a-f0-9]{40}',env.get('REVIEWED_SHA',''))),'exact artifact reviewed SHA required')

def verify_artifact(env,read=None):
    if read is None:
        def read(path):
            return json.loads(subprocess.check_output(['gh','api',path],text=True))
    repo='repos/MMD-Prive/mmd-workers'
    run=read(repo+'/actions/runs/'+env['ARTIFACT_RUN_ID'])
    artifact=read(repo+'/actions/artifacts/'+env['ARTIFACT_ID'])
    name='payout-overlay3041-candidate-'+env['REVIEWED_SHA']
    r.require(run.get('head_sha')==env['REVIEWED_SHA'] and run.get('conclusion')=='success' and run.get('path')=='.github/workflows/model-payout-overlay3041.yml','artifact CI provenance mismatch')
    r.require(all(run.get(k,{}).get('id')==1121397236 for k in ['repository','head_repository']),'foreign artifact repository')
    r.require(artifact.get('name')==name and artifact.get('expired') is False and artifact.get('workflow_run',{}).get('id')==int(env['ARTIFACT_RUN_ID']) and artifact.get('workflow_run',{}).get('head_sha')==env['REVIEWED_SHA'],'artifact identity mismatch')
    artifacts=read(repo+'/actions/runs/'+env['ARTIFACT_RUN_ID']+'/artifacts')['artifacts']
    r.require([a['id'] for a in artifacts if a.get('name')==name]==[int(env['ARTIFACT_ID'])],'artifact name does not resolve exact approved ID')
    return {'artifact_id':artifact['id'],'run_id':run['id'],'reviewed_sha':env['REVIEWED_SHA']}

if __name__=='__main__':
    try:
        gate(os.environ)
        verify_artifact(os.environ)
        r.require(subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==os.environ['APPROVED_SHA'],'checkout SHA mismatch')
        clean=lambda n:re.sub(r'[\r\n\u2028\u2029]','',os.environ.get(n,'')).strip()
        result=release(Api(clean('CLOUDFLARE_API_TOKEN'),clean('CLOUDFLARE_ROUTES_API_TOKEN'),clean('CLOUDFLARE_R2_API_TOKEN')),'payout-compatible','payout-compatible-release',os.environ['APPROVED_SHA'],os.environ['REVIEWED_SHA'])
        print(json.dumps({k:result[k] for k in ['worker','version_id','version_number','deployment_id','phase','js_sha256']}))
    except Exception as error:
        raise SystemExit(str(error) if isinstance(error,RuntimeError) else 'Code-only release unverified; inspect receipt; never replay unknown effects') from None
