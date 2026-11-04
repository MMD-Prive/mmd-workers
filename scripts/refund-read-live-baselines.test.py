import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("reader", Path(__file__).with_name("refund-read-live-baselines.py"))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class SnapshotContract(unittest.TestCase):
    def fake_get(self, token, worker, suffix):
        self.calls.append((worker, suffix))
        version, name = reader.EXPECTED[worker]
        if suffix.startswith("/deployments"):
            value = {"deployments": [{"id": "synthetic-deployment", "versions": [{"version_id": version, "percentage": 100}]}]}
        elif suffix.startswith("/versions/"):
            value = {"id": version, "resources": {"script": {"etag": "synthetic-etag", "handlers": ["fetch"], "named_handlers": []}}}
        else:
            parts = []
            for filename, body in [(name, "export default {};"), (name + ".map", '{}')]:
                parts.extend(["--fixture", f'Content-Disposition: form-data; name="{filename}"', "", body])
            parts.append("--fixture--")
            return "\r\n".join(parts).encode(), {"type": "multipart/form-data; boundary=fixture", "etag": '"synthetic-etag"'}
        return json.dumps({"success": True, "result": value}).encode(), {"type": "application/json", "etag": ""}

    def setUp(self):
        self.calls = []

    def test_verified_snapshot_has_no_credential_or_binding_values(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(reader, "get", self.fake_get):
            result = reader.snapshot("synthetic-credential-never-artifact", folder)
            self.assertEqual(len(result["workers"]), 2)
            self.assertTrue(all(w["etag_matched"] and w["stable"] for w in result["workers"]))
            for file in Path(folder).rglob("*"):
                if file.is_file():
                    self.assertNotIn("synthetic-credential-never-artifact", file.read_text())
            self.assertTrue(all(suffix in ["", "/deployments?per_page=1", "/versions/" + reader.EXPECTED[w][0]] for w, suffix in self.calls))

    def test_changed_live_allocation_denies_before_source_download(self):
        def changed(token, worker, suffix):
            body, headers = self.fake_get(token, worker, suffix)
            if suffix.startswith("/deployments"):
                value = json.loads(body)
                value["result"]["deployments"][0]["versions"][0]["percentage"] = 50
                body = json.dumps(value).encode()
            return body, headers
        with tempfile.TemporaryDirectory() as folder, patch.object(reader, "get", changed):
            with self.assertRaisesRegex(RuntimeError, "baseline moved"):
                reader.snapshot("synthetic", folder)
            self.assertFalse(any(suffix == "" for _, suffix in self.calls))
            self.assertEqual(list(Path(folder).rglob("*.js")), [])

    def test_wrong_etag_cannot_be_accepted_or_write_source(self):
        def wrong(token, worker, suffix):
            body, headers = self.fake_get(token, worker, suffix)
            if suffix == "":
                headers["etag"] = "other-version"
            return body, headers
        with tempfile.TemporaryDirectory() as folder, patch.object(reader, "get", wrong):
            with self.assertRaisesRegex(RuntimeError, "ETag"):
                reader.snapshot("synthetic", folder)
            self.assertEqual(list(Path(folder).rglob("*.js")), [])

    def test_path_traversal_and_unapproved_endpoint_are_rejected(self):
        body = b'--x\r\nContent-Disposition: form-data; name="../escape.js"\r\n\r\nx\r\n--x--\r\n'
        with self.assertRaisesRegex(RuntimeError, "unsafe module path"):
            reader.parts(body, {"type": "multipart/form-data; boundary=x"}, "worker.js")
        with self.assertRaisesRegex(RuntimeError, "unapproved"):
            reader.get("synthetic", "admin-worker", "/secrets")


if __name__ == "__main__":
    unittest.main()
