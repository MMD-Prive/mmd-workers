import importlib.util, hashlib, tempfile, unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('subject', Path(__file__).with_name('payout-evidence-read.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class ReaderContract(unittest.TestCase):
    def setUp(self):
        self.original = (m.PINS, m.reader.active, m.reader.api, m.reader.get, m.reader.parts)
        self.calls = []
        self.version = 'synthetic-version'
        self.body = b'export default {fetch(){return new Response("fixture")}};'
        m.PINS = {'payments-worker': (self.version, hashlib.sha256(self.body).hexdigest())}
        m.reader.active = lambda token, worker: {'id': 'synthetic-deployment', 'versions': [{'version_id': self.version, 'percentage': 100}]}
        m.reader.api = lambda token, worker, suffix: {'id': self.version, 'resources': {'script': {'etag': 'synthetic-etag'}}}
        def get(token, worker, suffix):
            self.assertEqual(worker, 'payments-worker')
            self.assertIn(suffix, ('', '/content/v2'))
            self.calls.append(suffix)
            return self.body, {'etag': 'synthetic-etag'}
        m.reader.get = get
        m.reader.parts = lambda body, headers, name: {name: body}
    def tearDown(self):
        m.PINS, m.reader.active, m.reader.api, m.reader.get, m.reader.parts = self.original
    def run_snapshot(self):
        with tempfile.TemporaryDirectory() as folder:
            return m.snapshot('fixture-only', folder)
    def test_missing_original_map_is_explicit_not_fabricated(self):
        result = self.run_snapshot()
        self.assertFalse(result['workers'][0]['map_available'])
        self.assertTrue(result['workers'][0]['etag_matched'])
        self.assertEqual(self.calls, ['', '/content/v2'])
    def test_etag_mismatch_denies(self):
        m.reader.get = lambda *args: (self.body, {'etag': 'other-etag'})
        with self.assertRaises(AssertionError): self.run_snapshot()
    def test_source_hash_mismatch_denies(self):
        self.body += b'changed'
        with self.assertRaises(AssertionError): self.run_snapshot()
    def test_allocation_change_denies(self):
        count = 0
        def active(*args):
            nonlocal count
            count += 1
            return {'id': str(count)}
        m.reader.active = active
        with self.assertRaises(AssertionError): self.run_snapshot()
    def test_wrong_immutable_version_denies(self):
        m.reader.api = lambda *args: {'id': 'other-version'}
        with self.assertRaises(AssertionError): self.run_snapshot()
if __name__ == '__main__': unittest.main()
