import copy
import email.parser
import email.policy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("release", Path(__file__).with_name("refund-release-preserved.py"))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class FakeApi:
    def __init__(self, fault=None):
        self.fault, self.calls, self.candidate = fault, [], None
        self.worker = r.ORDER[0]
        self.baseline = {"id": r.PIN[self.worker]["baseline"], "number": 1, "annotations": {}, "resources": {"script_runtime": {"compatibility_date": "2026-01-01", "usage_model": "standard", "migration_tag": "unchanged"}, "bindings": [{"name": "PRIVATE_TOKEN", "type": "secret_text"}, {"name": "BUCKET", "type": "r2_bucket", "bucket_name": "fixture"}], "script": {"etag": "fixture-etag", "handlers": ["fetch"], "named_handlers": []}}}
        self.deployment = {"id": "old-deployment", "versions": [{"version_id": self.baseline["id"], "percentage": 100}]}
        self.other = {"id": "other-deployment", "versions": [{"version_id": r.PIN[r.ORDER[1]]["baseline"], "percentage": 100}]}

    def __call__(self, method, route, body=None, content_type=None, raw=False):
        self.calls.append((method, route))
        own = r.root(self.worker)
        if route == r.root(r.ORDER[1]) + "/deployments?per_page=100":
            return {"deployments": [copy.deepcopy(self.other)]}
        if method == "GET" and route == own + "/deployments?per_page=100":
            return {"deployments": [copy.deepcopy(self.deployment)]}
        if method == "GET" and route == own + "/versions/" + self.baseline["id"]:
            return copy.deepcopy(self.baseline)
        if method == "GET" and route == own + "/versions/candidate":
            return copy.deepcopy(self.candidate)
        if method == "GET" and route == own + "/versions?per_page=100":
            versions = [self.candidate or self.baseline]
            if self.fault == "inactive-latest":
                versions = [{"id": "unrelated-inactive", "annotations": {}}]
            return {"items": copy.deepcopy(versions)}
        if method == "GET" and route == own + "/settings":
            return {"compatibility_date": "2026-01-01", "compatibility_flags": [], "usage_model": "standard"}
        if method == "POST" and route == own + "/versions":
            message = email.parser.BytesParser(policy=email.policy.default).parsebytes(("Content-Type: " + content_type + "\r\n\r\n").encode() + body)
            metadata = json.loads(next(p.get_payload(decode=True) for p in message.iter_parts() if p.get_param("name", header="content-disposition") == "metadata"))
            assert metadata["bindings"] == [{"name": "PRIVATE_TOKEN", "type": "inherit"}, {"name": "BUCKET", "type": "inherit"}]
            assert "migrations" not in metadata
            assert b"real-secret-value" not in body
            self.candidate = copy.deepcopy(self.baseline)
            self.candidate.update(id="candidate", number=2, annotations=metadata["annotations"])
            if self.fault == "config-change":
                self.candidate["resources"]["bindings"][1]["bucket_name"] = "wrong-bucket"
            if self.fault == "upload-timeout-after-commit":
                raise TimeoutError("synthetic lost acknowledgement")
            return copy.deepcopy(self.candidate)
        if method == "POST" and route == own + "/deployments":
            self.deployment = {"id": "created-deployment", "versions": body["versions"], "annotations": body["annotations"]}
            if self.fault == "promotion-timeout-after-commit":
                raise TimeoutError("synthetic lost acknowledgement")
            return copy.deepcopy(self.deployment)
        if method == "GET" and route == own and raw:
            files = [(r.PIN[self.worker]["name"], "application/javascript+module", b"export default {};"), (r.PIN[self.worker]["name"] + ".map", "application/source-map", json.dumps({"version": 3, "sources": [], "names": [], "mappings": "", "sourcesRoot": None}).encode())]
            payload, kind = r.multipart({}, files)
            return payload, {"type": kind, "etag": "fixture-etag"}
        raise AssertionError("unexpected API call: " + method + " " + route)


class ReleaseContract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name, "input")
        self.output = Path(self.temp.name, "receipt")
        self.folder.mkdir()
        (self.folder / "preserved-manifest.json").write_text(json.dumps({"source_commit": r.REVIEWED}))
        pins = copy.deepcopy(r.PIN)
        for worker, pin in pins.items():
            target = self.folder / worker
            target.mkdir()
            code, source_map = b"export default {};", b'{"version":3,"sources":[],"names":[],"mappings":""}'
            (target / pin["name"]).write_bytes(code)
            (target / (pin["name"] + ".map")).write_bytes(source_map)
            pin["js"], pin["map"] = r.digest(code), r.digest(source_map)
        self.patch = patch.object(r, "PIN", pins)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.infra = patch.object(r, "infrastructure", lambda api: {"stable": True})
        self.infra.start()
        self.addCleanup(self.infra.stop)

    def run_release(self, api):
        return r.release(api, r.ORDER[0], self.folder, self.output, "a" * 40)

    def test_release_preserves_bindings_and_map_semantics(self):
        api = FakeApi()
        result = self.run_release(api)
        self.assertEqual(result["phase"], "verified")
        self.assertTrue(result["configuration_preserved"])
        self.assertEqual([route for method, route in api.calls if method == "POST"], [r.root(r.ORDER[0]) + "/versions", r.root(r.ORDER[0]) + "/deployments"])

    def test_upload_after_commit_timeout_reconciles_without_repeating_post(self):
        api = FakeApi("upload-timeout-after-commit")
        self.assertEqual(self.run_release(api)["phase"], "verified")
        self.assertEqual(sum(m == "POST" and p.endswith("/versions") for m, p in api.calls), 1)

    def test_promotion_after_commit_timeout_uses_exact_collection_no_replay(self):
        api = FakeApi("promotion-timeout-after-commit")
        self.assertEqual(self.run_release(api)["deployment_id"], "created-deployment")
        self.assertEqual(sum(m == "POST" and p.endswith("/deployments") for m, p in api.calls), 1)

    def test_inactive_latest_must_not_supply_inherited_secrets(self):
        api = FakeApi("inactive-latest")
        with self.assertRaisesRegex(RuntimeError, "latest upload"):
            self.run_release(api)
        self.assertFalse(any(m == "POST" for m, _ in api.calls))

    def test_changed_candidate_stays_inactive(self):
        api = FakeApi("config-change")
        with self.assertRaisesRegex(RuntimeError, "configuration/interface"):
            self.run_release(api)
        self.assertFalse(any(m == "POST" and p.endswith("/deployments") for m, p in api.calls))

    def test_tampered_artifact_cannot_write(self):
        api = FakeApi()
        file = self.folder / r.ORDER[0] / r.PIN[r.ORDER[0]]["name"]
        file.write_text("tampered")
        with self.assertRaisesRegex(RuntimeError, "hash mismatch"):
            self.run_release(api)
        self.assertEqual(api.calls, [])

    def test_routes_settings_secrets_and_business_posts_are_not_transport_capabilities(self):
        api = r.Api("synthetic")
        for route in [r.root(r.ORDER[0]) + "/settings", r.root(r.ORDER[0]) + "/secrets", "/anything-business"]:
            with self.assertRaisesRegex(RuntimeError, "outside code-only"):
                api("POST", route, {})


if __name__ == "__main__":
    unittest.main()
