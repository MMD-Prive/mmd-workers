"""Parse both configs to catch TOML table scoping and the release binding owner."""
import pathlib
import tomllib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent

class BlackCardConfigTest(unittest.TestCase):
    def test_release_binding_and_existing_payment_vars(self):
        config = tomllib.loads((ROOT / 'wrangler.merged.toml').read_text())
        self.assertEqual(config['main'], 'index.session-paid-projection-wrapper.js')
        self.assertEqual(config['triggers']['crons'], ['*/5 * * * *'])
        bindings = [b for b in config['d1_databases'] if b['binding'] == 'BLACKCARD_DB']
        self.assertEqual(bindings, [{
            'binding': 'BLACKCARD_DB', 'database_name': 'mmd-blackcard-companion-preferences',
            'database_id': '18880ae8-2bf6-4c6a-8cc0-70c5d998324d', 'migrations_dir': 'migrations',
        }])
        self.assertNotIn('BLACKCARD_SALES_ENABLED', config['vars'])
        self.assertNotIn('BLACKCARD_PREFERENCE_RETENTION_DAYS', config['vars'])
        self.assertIn('wrangler.merged.toml', (ROOT.parent / '.github/workflows/deploy-payments-worker.yml').read_text())
        for name in ['wrangler.toml', 'wrangler.merged.toml']:
            parsed = tomllib.loads((ROOT / name).read_text())
            for key in ['ALLOWED_ORIGINS', 'AT_PAYMENTS__PAYMENT_REF', 'AT_PAYMENTS__VERIFICATION_STATUS']:
                self.assertIn(key, parsed['vars'], f'{name}: {key} escaped vars table')
            for item in parsed.get('d1_databases', []):
                self.assertFalse(any(key.startswith('AT_') or key == 'ALLOWED_ORIGINS' for key in item))

if __name__ == '__main__':
    unittest.main()
