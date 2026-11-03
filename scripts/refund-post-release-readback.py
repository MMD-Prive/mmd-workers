"""GET-only attestation of already promoted immutable Refund artifacts."""
import importlib.util
import json
import os
from pathlib import Path

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('refund-release-preserved.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
versions = {'admin-worker': '19ef3bee-c154-41a0-abef-2543ac09a2a9', 'member-dashboard-chat-worker': '428fde80-3778-4a63-a719-5ebd85333a59'}
release.snapshot.EXPECTED = {w: (v, release.PIN[w]['name']) for w, v in versions.items()}
release.artifacts('refund-preserved-input')
receipt = release.snapshot.snapshot(os.environ['CLOUDFLARE_API_TOKEN'], 'refund-served-readback')
checks = []
for worker, pin in release.PIN.items():
    expected = Path('refund-preserved-input', worker, pin['name'])
    served = Path('refund-served-readback', worker, pin['name'])
    release.require(release.digest(served.read_bytes()) == pin['js'], 'active JS mismatch')
    a = json.loads(Path(str(expected) + '.map').read_text())
    b = json.loads(Path(str(served) + '.map').read_text())
    fields = {k: a.get(k) == b.get(k) for k in sorted(set(a) | set(b))}
    same = release.semantic_map(a, pin['name']) == release.semantic_map(b, pin['name'])
    checks.append({'worker': worker, 'version': versions[worker], 'js_sha256': pin['js'], 'map_upload_sha256': pin['map'], 'map_served_sha256': release.digest(Path(str(served) + '.map').read_bytes()), 'raw_fields_equal': fields, 'expected_file': a.get('file'), 'served_file': b.get('file'), 'semantic_equal': same})
Path('refund-served-readback/attestation.json').write_text(json.dumps({'snapshot': receipt, 'checks': checks}, indent=2) + '\n')
print(json.dumps(checks, indent=2))
release.require(all(c['semantic_equal'] for c in checks), 'source map mismatch remains')
