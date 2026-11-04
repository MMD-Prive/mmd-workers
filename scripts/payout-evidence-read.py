"""Pinned GET-only code snapshot for PR3054. No refresh, business storage or writes."""
import importlib.util, json, os, hashlib
from pathlib import Path
from datetime import datetime, timezone

spec = importlib.util.spec_from_file_location('reader', Path(__file__).with_name('refund-read-live-baselines.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
PINS = {
    'admin-worker': ('aa9aad5e-977c-43ef-8063-24d10e40eedd', '78788eb6898dca9856341b2db276c3f51c957044c5ee0152402d876fe008ec9a'),
    'payments-worker': ('f05c4a1c-e4e4-4a91-8160-5ee3743cb7b9', 'eec3f26d0bff7e0bb2b06ebfc03420aef14579a238bad21b5e6bd33287eadb83'),
}
reader.EXPECTED = {w: (v, 'worker.js') for w, (v, _) in PINS.items()}

def snapshot(token, output):
    assert token, 'read credential unavailable'
    receipt = {'at': datetime.now(timezone.utc).isoformat(), 'method': 'GET only', 'workers': []}
    for worker, (version_id, digest) in PINS.items():
        before = reader.active(token, worker)
        version = reader.api(token, worker, '/versions/' + version_id)
        assert version['id'] == version_id
        etag = version['resources']['script']['etag'].strip('"')
        modules = {}
        for suffix in ('', '/content/v2'):
            body, headers = reader.get(token, worker, suffix)
            assert headers['etag'].strip('"') == etag, 'response ETag does not match pinned version'
            for name, data in reader.parts(body, headers, 'worker.js').items():
                assert name not in modules or modules[name] == data, 'source moved'
                modules[name] = data
        assert reader.active(token, worker) == before, 'allocation moved'
        assert hashlib.sha256(modules['worker.js']).hexdigest() == digest, 'unexpected live source'
        maps = [name for name in modules if name.endswith('.map')]
        if worker == 'admin-worker':
            assert maps == ['admin-login-hero-worker.js.map'], 'admin original map required'
            assert hashlib.sha256(modules[maps[0]]).hexdigest() == 'b880e59336a6d637a85bee6dc8225ed235489c0e654811ce2de948e894314b9c'
        else:
            assert not maps, 'payments provenance changed; inspect before changing pins'
        records = []
        for name, data in modules.items():
            target = Path(output, worker, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            records.append({'name': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
        receipt['workers'].append({'worker': worker, 'version_id': version_id, 'deployment': before,
            'etag': etag, 'etag_matched': True, 'stable': True, 'map_available': bool(maps),
            'modules': records, 'runtime': version['resources'].get('script_runtime', {}),
            'handlers': version['resources']['script'].get('handlers', []),
            'named_handlers': version['resources']['script'].get('named_handlers', [])})
    Path(output, 'snapshot.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return receipt

if __name__ == '__main__':
    try:
        result = snapshot(os.environ.get('CLOUDFLARE_API_TOKEN', ''), 'payout-evidence-baseline')
        print(json.dumps({'verified': True, 'workers': [{'worker': w['worker'], 'version': w['version_id'], 'etag_matched': True, 'map_available': w['map_available']} for w in result['workers']]}))
    except Exception as error:
        # Never print upstream bodies, credential values, headers or raw payloads.
        raise SystemExit('Pinned GET snapshot NOT_PROVEN (' + type(error).__name__ + '); no production writes') from None
