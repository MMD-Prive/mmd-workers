"""GET-only pinned admin code snapshot; never accesses business storage or mutates resources."""
import importlib.util
import json
import hashlib
import os
from pathlib import Path
from datetime import datetime, timezone

VERSION = '801082ba-69db-4713-93cc-ffd7290987f3'
WORKER = 'admin-worker'
NAME = 'admin-login-hero-worker.js'
PHASE = 'start'
EXPECTED_JS = '32e7363a82297db746dc620ae0c2bf6b19164a5f78a5aa72320c25bdcec68926'
spec = importlib.util.spec_from_file_location('reader', Path(__file__).with_name('refund-read-live-baselines.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
reader.EXPECTED = {WORKER:(VERSION,NAME)}

def snapshot(token, output):
    global PHASE
    PHASE = 'allocation_before'
    before = reader.active(token,WORKER)
    PHASE = 'version_metadata'
    version = reader.api(token,WORKER,'/versions/'+VERSION)
    assert version.get('id') == VERSION, 'immutable version unavailable'
    etag = version['resources']['script']['etag'].strip('"')
    PHASE = 'main_module_get'
    raw, headers = reader.get(token,WORKER,'')
    PHASE = 'main_module_etag'
    assert headers['etag'].strip('"') == etag, 'source/version ETag mismatch'
    modules = reader.parts(raw,headers,NAME)
    map_read = 'included_in_main_response'
    if NAME+'.map' not in modules:
        PHASE = 'optional_map_get'
        try:
            raw, headers = reader.get(token,WORKER,'/content/v2')
            if headers['etag'].strip('"') != etag:
                map_read = 'map_etag_unavailable_or_mismatch'
            else:
                for name,data in reader.parts(raw,headers,NAME).items():
                    assert name not in modules or modules[name] == data, 'source content moved'
                    modules[name] = data
                map_read = 'map_received' if NAME+'.map' in modules else 'no_map_in_content_response'
        except RuntimeError:
            map_read = 'map_endpoint_unavailable'
    PHASE = 'allocation_after'
    assert reader.active(token,WORKER) == before, 'deployment changed during read'
    PHASE = 'main_module_hash'
    assert hashlib.sha256(modules[NAME]).hexdigest() == EXPECTED_JS, 'served JS differs from release receipt'
    records=[]
    for name,data in modules.items():
        target=Path(output,WORKER,name)
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(data)
        records.append({'name':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
    script=version['resources']['script']
    receipt={'at':datetime.now(timezone.utc).isoformat(),'method':'GET only','worker':WORKER,'version_id':VERSION,'deployment':before,'etag':etag,'etag_matched':True,'stable':True,'js_matches_release_receipt':True,'map_available':NAME+'.map' in modules,'map_read':map_read,'handlers':script.get('handlers',[]),'named_handlers':script.get('named_handlers',[]),'runtime':version['resources'].get('script_runtime',{}),'modules':records}
    Path(output,'snapshot.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt

if __name__ == '__main__':
    try:
        result=snapshot(os.environ['CLOUDFLARE_API_TOKEN'],'payout-admin-baseline')
        print(json.dumps(result))
    except Exception as error:
        Path('payout-admin-baseline').mkdir(exist_ok=True)
        Path('payout-admin-baseline/read-failure.json').write_text(json.dumps({'phase':PHASE,'error_class':type(error).__name__,'production_write_attempted':False})+'\n')
        raise SystemExit('Pinned admin source GET unverified at '+PHASE+' ('+type(error).__name__+'); no production write attempted') from None
