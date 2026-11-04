import copy
import email.parser
import email.policy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
s=importlib.util.spec_from_file_location('release',Path(__file__).with_name('model-payout-overlay3041-release.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
CANDIDATE='11111111-1111-4111-8111-111111111111'

class Fake:
    def __init__(self,fault=None):
        self.fault=fault;self.calls=[];self.candidate=None
        self.base={'id':m.BASELINE,'number':1698,'resources':{'script_runtime':{'compatibility_date':'2026-01-01','usage_model':'standard','migration_tag':'keep'},'bindings':[{'name':'PRIVATE_TOKEN','type':'secret_text'},{'name':'BUCKET','type':'r2_bucket','bucket_name':'fixture'}],'script':{'etag':'base-etag','handlers':['fetch'],'named_handlers':[{'name':'RPC','handlers':['class']}]}}}
        self.deployment={'id':m.DEPLOYMENT,'versions':[{'version_id':m.BASELINE,'percentage':100}]}
    def __call__(self,method,route,body=None,content_type=None,raw=False):
        self.calls.append((method,route))
        if route==m.ROOT+'/deployments?per_page=100':return {'deployments':[copy.deepcopy(self.deployment)]}
        if route==m.ROOT+'/versions/'+m.BASELINE:return copy.deepcopy(self.base)
        if route==m.ROOT+'/versions/'+CANDIDATE:return copy.deepcopy(self.candidate)
        if route==m.ROOT+'/versions?per_page=100':
            rows=[self.candidate,self.base] if self.candidate else [self.base]
            if self.fault=='inactive-latest' and not self.candidate:rows=[{'id':'foreign'},self.base]
            if self.fault=='intervening' and self.candidate:rows=[self.candidate,{'id':'foreign'},self.base]
            return {'items':copy.deepcopy(rows)}
        if method=='POST' and route==m.ROOT+'/versions?bindings_inherit=strict':
            if self.fault=='upload-before':raise TimeoutError('fixture unknown')
            msg=email.parser.BytesParser(policy=email.policy.default).parsebytes(('Content-Type: '+content_type+'\r\n\r\n').encode()+body)
            parts={p.get_param('name',header='content-disposition'):p.get_payload(decode=True) for p in msg.iter_parts()};meta=json.loads(parts['metadata'])
            assert set(parts)=={'metadata','worker.js',m.MAP_NAME}
            assert meta['main_module']=='worker.js' and meta['bindings']==[{'name':'PRIVATE_TOKEN','type':'inherit'},{'name':'BUCKET','type':'inherit'}]
            assert not any(k in meta for k in ['migrations','exports','routes','secrets'])
            self.candidate=copy.deepcopy(self.base);self.candidate.update(id=CANDIDATE,number=1699,annotations=meta['annotations']);self.candidate['resources']['script']['etag']='candidate-etag'
            if self.fault=='config':self.candidate['resources']['bindings'][1]['bucket_name']='changed'
            if self.fault=='upload-after':raise TimeoutError('fixture acknowledgement lost')
            return {'id':CANDIDATE}
        if method=='POST' and route==m.ROOT+'/deployments':
            self.deployment={'id':'created-deployment','versions':body['versions'],'annotations':body['annotations']}
            if self.fault=='promotion-after':raise TimeoutError('fixture acknowledgement lost')
            return {'id':self.deployment['id']}
        if route==m.ROOT and raw:
            is_candidate=self.deployment['versions'][0]['version_id']==CANDIDATE
            source_map={'version':3,'sources':[],'sourcesContent':[],'names':[],'mappings':'','file':'worker.js','sourcesRoot':None}
            if self.fault=='bad-map':source_map['mappings']='AAAA'
            files=[('worker.js','application/javascript+module',b'export default {};' if is_candidate else b'baseline')]
            if is_candidate:files.append(('worker.js.map','application/source-map',json.dumps(source_map).encode()))
            payload,kind=m.r.multipart({},files);return payload,{'type':kind,'etag':'candidate-etag' if is_candidate else 'base-etag'}
        raise AssertionError('unexpected fake request '+method+' '+route)

class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.input=Path(self.tmp.name,'in');self.input.mkdir();self.out=Path(self.tmp.name,'out')
        code=b'export default {};';sm=b'{"version":3,"sources":[],"sourcesContent":[],"names":[],"mappings":"","file":"worker.js","sourceRoot":""}'
        (self.input/'worker.js').write_bytes(code);(self.input/m.MAP_NAME).write_bytes(sm)
        for name,value in [('JS_HASH',m.r.digest(code)),('MAP_HASH',m.r.digest(sm)),('BASE_HASH',m.r.digest(b'baseline'))]:
            p=patch.object(m,name,value);p.start();self.addCleanup(p.stop)
        (self.input/'manifest.json').write_text(json.dumps({'reviewed_source':'b'*40,'compatible_sha256':m.JS_HASH,'compatible_map_sha256':m.MAP_HASH,'active_baseline':{'version':m.BASELINE}}))
        p=patch.object(m,'infrastructure',lambda api:{'stable':True});p.start();self.addCleanup(p.stop)
    def run_release(self,api):return m.release(api,self.input,self.out,'a'*40,'b'*40)
    def test_exact_admin_code_map_inherit_and_100_readback(self):
        api=Fake();r=self.run_release(api);self.assertEqual(r['phase'],'verified');self.assertEqual([route for method,route in api.calls if method=='POST'],[m.ROOT+'/versions?bindings_inherit=strict',m.ROOT+'/deployments'])
    def test_unknown_after_commit_upload_and_promotion_never_reposted(self):
        for fault in ['upload-after','promotion-after']:
            api=Fake(fault);self.assertEqual(self.run_release(api)['phase'],'verified');self.assertEqual(sum(method=='POST' for method,_ in api.calls),2)
    def test_unknown_upload_no_match_stops_after_one_post(self):
        api=Fake('upload-before')
        with self.assertRaisesRegex(RuntimeError,'no POST retry'):self.run_release(api)
        self.assertEqual(sum(method=='POST' for method,_ in api.calls),1)
    def test_inactive_latest_blocks_all_posts(self):
        api=Fake('inactive-latest')
        with self.assertRaises(RuntimeError):self.run_release(api)
        self.assertFalse(any(method=='POST' for method,_ in api.calls))
    def test_intervening_or_config_change_cannot_promote(self):
        for fault in ['intervening','config']:
            api=Fake(fault)
            with self.assertRaises(RuntimeError):self.run_release(api)
            self.assertFalse(any(method=='POST' and route.endswith('/deployments') for method,route in api.calls))
    def test_wrong_artifact_has_zero_network_calls(self):
        (self.input/'worker.js').write_text('changed');api=Fake()
        with self.assertRaises(RuntimeError):self.run_release(api)
        self.assertEqual(api.calls,[])
    def test_bad_map_after_promote_stops_without_retry_or_rollback(self):
        api=Fake('bad-map')
        with self.assertRaisesRegex(RuntimeError,'map differs'):self.run_release(api)
        self.assertEqual(sum(method=='POST' for method,_ in api.calls),2);self.assertEqual(json.loads((self.out/'receipt.json').read_text())['phase'],'promoted')
    def test_gate_denies_pr_missing_approval_and_wrong_sha(self):
        for env in [{},{'PRODUCTION_APPROVED':'true','GITHUB_EVENT_NAME':'pull_request','GITHUB_REF':'refs/heads/main'}]:
            with self.assertRaises(RuntimeError):m.gate(env)
    def test_transport_denies_other_workers_config_and_business_paths_before_network(self):
        api=m.Api('fixture-token')
        for method,path in [('POST',m.r.root('member-dashboard-chat-worker')+'/versions'),('PATCH',m.ROOT+'/settings'),('POST',m.ROOT+'/secrets'),('DELETE',m.ROOT),('POST','/v1/admin/model-payout/adjustments')]:
            with self.assertRaisesRegex(RuntimeError,'admin-only'):api(method,path)
    def test_artifact_provenance_exact_repo_run_sha_and_id(self):
        env={'ARTIFACT_RUN_ID':'123','ARTIFACT_ID':'456','REVIEWED_SHA':'b'*40}
        run={'id':123,'head_sha':'b'*40,'conclusion':'success','path':'.github/workflows/model-payout-overlay3041.yml','repository':{'id':1121397236},'head_repository':{'id':1121397236}}
        artifact={'id':456,'name':'payout-overlay3041-candidate-'+'b'*40,'expired':False,'workflow_run':{'id':123,'head_sha':'b'*40}}
        def read(path):return {'artifacts':[artifact]} if path.endswith('/artifacts') else artifact if '/artifacts/' in path else run
        self.assertEqual(m.verify_artifact(env,read)['artifact_id'],456)
        artifact['workflow_run']['head_sha']='c'*40
        with self.assertRaises(RuntimeError):m.verify_artifact(env,read)

if __name__=='__main__':unittest.main()
