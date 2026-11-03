"""Owner-approved code-only release of PR3032's immutable reviewed artifacts.
No Worker rebuild, route/config/secret/storage/business write, or message probe.
"""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

ACCOUNT = "b176eda1172b741fd2e58904cc9d77c5"
ZONE = "2d62396174fa2ddadbbcd0e8cf0f3367"
REVIEWED = "59187649f3cdeb209f6b424303b03da765ec31b8"
ORDER = ["member-dashboard-chat-worker", "admin-worker"]
PIN = {
 "admin-worker": {"baseline": "e7bef51e-c819-468b-b34d-b192fac00f50", "name": "admin-login-hero-worker.js", "js": "6897285f8ae373cbe51e4b77691bdb208683867aed65f9295af5b0d454e63160", "map": "13d42314f42fe4aaca5d29637422490847770a5f97e007994d47373d733e3ea6", "bindings": "1bf7cf5c55d261a1dd80c2508c8082ecdd1a1d1cee405e6cae17c8fbf49c097e", "settings": "05be6e629ec1b14f373363280a526933d71653cd4e0ac02ac84a6eb1d5cb53b7", "schedules": "c35269605719c46cbc18afdc48f2a4e34c83fa3e2c80b6380833fcd0cb6404e0"},
 "member-dashboard-chat-worker": {"baseline": "e1598f73-ccad-4dc1-a441-c70004b68614", "name": "guide-notification-entry.js", "js": "a0414fb5356605698b9b2539573d66b1135111f00fcc01ed545d8df125c43956", "map": "7e1cd5af7b02294406886cd42318dbe3c0db0e53f470e8f2a42cdfd299ba3355", "bindings": "262269a706b58b37843d018e888c476806d7ca25e3453b16420cd1c1f3d81850", "settings": "b166a13c58bdd115b0ec2565de10f2aae23749baa2e9844277099d75f8e7623b", "schedules": "bcad77bbc0c1a80c251edecfe9d82cec2d9a51745ad4a15ba448ecc49ab91fc0"},
}
SOURCE_HASHES = {"admin-worker/src/refund-ops.js": "577945192a039e8d86beea5e340d5fb75fd04ebff5585998ef9180c2dfec48df", "admin-worker/src/refund-receipt-journal.js": "0f82d5f1a904e4b7a2ee6e2c85e3278743f9b9c0c0b97734a2d4d648b7a919e6", "member-dashboard-chat-worker/src/index.js": "cfb5830e244d850c333a255ea596467de444458f578e770f532380b962c1a25c"}
EXPECTED_ROUTES = "d45b8482bb5bc80efa103b22465a22c1b1acc1e9f59d8149e4b609ff0177d51e"
EXPECTED_LIFECYCLE = "65147c1c08c305585a1beef91adfcba496946bbe76fb32a8f060e7dc34f0dee6"
spec = importlib.util.spec_from_file_location("snapshot", Path(__file__).with_name("refund-read-live-baselines.py"))
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def canonical(value):
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: canonical(v) for k, v in value.items()}
    if isinstance(value, list):
        return [canonical(v) for v in value]
    return value


def digest(value):
    if not isinstance(value, bytes):
        value = json.dumps(canonical(value), sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    return hashlib.sha256(value).hexdigest()


def safe_bindings(bindings):
    return sorted([{"name": b["name"], "type": b["type"], "value_not_compared": True}
        if "secret" in b["type"] or re.search("TOKEN|SECRET|CREDENTIAL|PASSWORD|BEARER|KEY", b["name"], re.I)
        else b for b in bindings], key=lambda b: b["name"])


class Api:
    def __init__(self, token, routes_token=None, r2_token=None):
        require(bool(token), "existing Cloudflare credential missing")
        self.token = token
        self.routes_token = routes_token
        self.r2_token = r2_token
        self.opener = urllib.request.build_opener(snapshot.NoRedirect())

    def __call__(self, method, route, body=None, content_type=None, raw=False):
        roots = [f"/accounts/{ACCOUNT}/workers/scripts/{w}" for w in PIN]
        allowed_read = route in [f"/zones/{ZONE}/workers/routes", f"/accounts/{ACCOUNT}/r2/buckets/mmd-line-slip-evidence/lifecycle"]
        for root in roots:
            suffix = route[len(root):] if route.startswith(root) else None
            if suffix is not None:
                allowed_read |= suffix in ["", "/settings", "/schedules", "/deployments?per_page=100", "/versions?per_page=100"] or bool(re.fullmatch(r"/(?:versions|deployments)/[a-f0-9-]{36}", suffix))
        allowed_write = route in [r + s for r in roots for s in ["/versions", "/deployments"]]
        require(method == "GET" and allowed_read or method == "POST" and allowed_write, "outside code-only API scope")
        role, credential = "worker", self.token
        if route.startswith(f"/zones/{ZONE}/"):
            role, credential = "routes-read", self.routes_token
        elif route.startswith(f"/accounts/{ACCOUNT}/r2/"):
            role, credential = "lifecycle-read", self.r2_token
        require(bool(credential), "existing " + role + " credential unavailable")
        headers = {"Authorization": "Bearer " + credential}
        if body is not None:
            if not isinstance(body, bytes):
                body = json.dumps(body).encode()
            headers["Content-Type"] = content_type or "application/json"
        request = urllib.request.Request("https://api.cloudflare.com/client/v4" + route, data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=90) as response:
                data = response.read(snapshot.MAX_BYTES + 1)
                require(len(data) <= snapshot.MAX_BYTES, "response exceeds size limit")
                if raw:
                    return data, {"type": response.headers.get("Content-Type", ""), "etag": response.headers.get("ETag", "")}
                payload = json.loads(data)
                require(payload.get("success") is True, "Cloudflare operation not confirmed")
                return payload["result"]
        except urllib.error.HTTPError as error:
            try:
                codes = [e.get('code') for e in json.loads(error.read()).get('errors', [])]
            except Exception:
                codes = []
            raise RuntimeError(f"Cloudflare {method} {role} HTTP {error.code} codes={codes}; no write retry") from None


def root(worker):
    return f"/accounts/{ACCOUNT}/workers/scripts/{worker}"


def active(api, worker):
    rows = api("GET", root(worker) + "/deployments?per_page=100")["deployments"]
    require(bool(rows), "active deployment unavailable")
    require(len(rows[0]["versions"]) == 1 and rows[0]["versions"][0]["percentage"] == 100, "allocation changed")
    return rows[0]


def infrastructure(api):
    result = {}
    for worker in ORDER:
        settings = api("GET", root(worker) + "/settings")
        other = {k: v for k, v in settings.items() if k not in ["bindings", "annotations"]}
        result[worker] = {"bindings": digest(safe_bindings(settings["bindings"])), "settings": digest(other), "schedules": digest(api("GET", root(worker) + "/schedules"))}
        for key in result[worker]:
            require(result[worker][key] == PIN[worker][key], "live configuration drift: " + worker + "/" + key)
    routes = api("GET", f"/zones/{ZONE}/workers/routes")
    routes = sorted([{k: r[k] for k in ["id", "pattern", "script"]} for r in routes if r.get("script") in PIN], key=lambda r: r["pattern"])
    result["routes"] = digest(routes)
    result["lifecycle"] = digest(api("GET", f"/accounts/{ACCOUNT}/r2/buckets/mmd-line-slip-evidence/lifecycle"))
    require(result["routes"] == EXPECTED_ROUTES, "route ownership drift")
    require(result["lifecycle"] == EXPECTED_LIFECYCLE, "journal lifecycle drift")
    return result


def configuration(version):
    resources = version["resources"]
    runtime = copy.deepcopy(resources["script_runtime"])
    runtime.setdefault("compatibility_flags", [])
    script = resources["script"]
    named = sorted([{"name": h["name"], "handlers": sorted(h["handlers"])} for h in script.get("named_handlers", [])], key=lambda h: h["name"])
    return {"runtime": runtime, "bindings": safe_bindings(resources["bindings"]), "handlers": sorted(script["handlers"]), "named_handlers": named}


def multipart(metadata, files):
    boundary = "MMD3032_" + uuid.uuid4().hex
    pieces = []
    for name, kind, body in [("metadata", "application/json", json.dumps(metadata).encode()), *files]:
        disposition = f'name="{name}"' + ('' if name == 'metadata' else f'; filename="{name}"')
        pieces.append((f'--{boundary}\r\nContent-Disposition: form-data; {disposition}\r\nContent-Type: {kind}\r\n\r\n').encode() + body + b"\r\n")
    return b"".join(pieces) + ("--" + boundary + "--\r\n").encode(), "multipart/form-data; boundary=" + boundary


def artifacts(folder):
    manifest = json.loads(Path(folder, "preserved-manifest.json").read_text())
    require(manifest["source_commit"] == REVIEWED, "wrong reviewed artifact source")
    for worker, pin in PIN.items():
        for suffix, key in [("", "js"), (".map", "map")]:
            require(digest(Path(folder, worker, pin["name"] + suffix).read_bytes()) == pin[key], "reviewed artifact hash mismatch")
    return manifest


def semantic_map(value):
    return {k: value.get(k) for k in ["version", "file", "sources", "sourcesContent", "names", "mappings"]} | {"sourceRoot": value.get("sourceRoot", value.get("sourcesRoot"))}


def release(api, worker, folder, receipt_dir, merge_sha, peer_version=None):
    require(worker in PIN, "unapproved worker")
    require(bool(re.fullmatch(r"[a-f0-9]{40}", merge_sha)), "exact approved merge SHA required")
    artifacts(folder)
    pin = PIN[worker]
    marker = f"PR3032 artifact={pin['js']} reviewed={REVIEWED} merge={merge_sha} worker={worker}"
    out = Path(receipt_dir)
    out.mkdir(parents=True, exist_ok=True)
    receipt = {"worker": worker, "merge_sha": merge_sha, "reviewed_sha": REVIEWED, "marker": marker, "baseline": pin["baseline"], "js_sha256": pin["js"], "map_upload_sha256": pin["map"], "phase": "preflight", "business_writes": 0, "real_messages": 0}
    def checkpoint(**updates):
        receipt.update(updates)
        Path(out, "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    checkpoint(at=datetime.now(timezone.utc).isoformat())
    try:
        before = infrastructure(api)
        peer = ORDER[1] if worker == ORDER[0] else ORDER[0]
        expected_peer = PIN[peer]["baseline"] if worker == ORDER[0] else peer_version
        require(bool(expected_peer), "verified LINE version required before admin")
        require(active(api, peer)["versions"][0]["version_id"] == expected_peer, "peer baseline drift")
        baseline = api("GET", root(worker) + "/versions/" + pin["baseline"])
        versions = api("GET", root(worker) + "/versions?per_page=100")["items"]
        matches = [v for v in versions if v.get("annotations", {}).get("workers/message") == marker]
        require(len(matches) <= 1, "ambiguous prior upload; no replay")
        candidate = api("GET", root(worker) + "/versions/" + matches[0]["id"]) if matches else None
        current = active(api, worker)
        require(current["versions"][0]["version_id"] in [pin["baseline"], candidate["id"] if candidate else None], "active baseline drift")
        if candidate is None:
            # Script-version inherit defaults to latest, not active. This check
            # prevents inheriting an unrelated inactive upload or its secrets.
            require(versions and versions[0]["id"] == pin["baseline"], "latest upload is not the live baseline")
            require(active(api, worker)["id"] == current["id"], "deployment drift before upload")
            settings = api("GET", root(worker) + "/settings")
            metadata = {"main_module": pin["name"], "compatibility_date": settings["compatibility_date"], "compatibility_flags": settings.get("compatibility_flags", []), "usage_model": settings["usage_model"], "bindings": [{"name": b["name"], "type": "inherit"} for b in baseline["resources"]["bindings"]], "annotations": {"workers/message": marker, "workers/commit_sha": REVIEWED, "workers/tag": "mmd3032-" + pin["js"][:12]}}
            files = [(pin["name"], "application/javascript+module", Path(folder, worker, pin["name"]).read_bytes()), (pin["name"] + ".map", "application/source-map", Path(folder, worker, pin["name"] + ".map").read_bytes())]
            body, kind = multipart(metadata, files)
            checkpoint(phase="upload_intent")
            try:
                uploaded = api("POST", root(worker) + "/versions", body, kind)
                candidate = api("GET", root(worker) + "/versions/" + uploaded["id"])
            except Exception as error:
                checkpoint(upload_error=str(error) if isinstance(error, RuntimeError) else 'upload acknowledgement unavailable')
                found = api("GET", root(worker) + "/versions?per_page=100")["items"]
                found = [v for v in found if v.get("annotations", {}).get("workers/message") == marker]
                require(len(found) == 1, "upload outcome unresolved; no POST retry")
                candidate = api("GET", root(worker) + "/versions/" + found[0]["id"])
        checkpoint(phase="uploaded", version_id=candidate["id"], version_number=candidate.get("number"))
        require(configuration(candidate) == configuration(baseline), "candidate configuration/interface mismatch; no promotion")
        require(candidate.get("annotations", {}).get("workers/message") == marker, "candidate provenance mismatch")
        require(infrastructure(api) == before, "infrastructure changed during upload")
        now = active(api, worker)
        if now["versions"][0]["version_id"] != candidate["id"]:
            require(now["id"] == current["id"], "baseline moved before promotion")
            checkpoint(phase="promotion_intent")
            deployment_marker = "Promote " + marker
            try:
                created = api("POST", root(worker) + "/deployments", {"strategy": "percentage", "versions": [{"version_id": candidate["id"], "percentage": 100}], "annotations": {"workers/message": deployment_marker}})
                created_id = created["id"]
            except Exception as error:
                checkpoint(promotion_error=str(error) if isinstance(error, RuntimeError) else 'promotion acknowledgement unavailable')
                rows = api("GET", root(worker) + "/deployments?per_page=100")["deployments"]
                rows = [d for d in rows if d.get("annotations", {}).get("workers/message") == deployment_marker and d["versions"] == [{"version_id": candidate["id"], "percentage": 100}]]
                require(len(rows) == 1, "promotion outcome unresolved; no POST retry")
                created_id = rows[0]["id"]
            # Collection readback is authoritative even if detail GET returns 404.
            exact = [d for d in api("GET", root(worker) + "/deployments?per_page=100")["deployments"] if d["id"] == created_id]
            require(len(exact) == 1, "exact created deployment unavailable")
            now = active(api, worker)
            require(now["id"] == created_id, "created deployment is not active")
        require(now["versions"] == [{"version_id": candidate["id"], "percentage": 100}], "allocation mismatch")
        checkpoint(phase="promoted", deployment_id=now["id"])
        raw, headers = api("GET", root(worker), raw=True)
        require(headers["etag"].strip('"') == candidate["resources"]["script"]["etag"], "live download not tied to exact new version")
        parts = snapshot.parts(raw, headers, pin["name"])
        require(digest(parts[pin["name"]]) == pin["js"], "active JS differs from approved artifact")
        require(semantic_map(json.loads(parts[pin["name"] + ".map"])) == semantic_map(json.loads(Path(folder, worker, pin["name"] + ".map").read_text())), "active source map semantic mismatch")
        for name, data in parts.items():
            target = out / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        require(infrastructure(api) == before, "post-release infrastructure drift")
        require(active(api, worker)["id"] == now["id"], "deployment moved during final readback")
        require(active(api, peer)["versions"][0]["version_id"] == expected_peer, "peer changed during release")
        checkpoint(phase="verified", code_readback_exact=True, map_readback_semantic_equal=True, map_readback_sha256=digest(parts[pin["name"] + ".map"]), configuration_preserved=True, routes_preserved=True, schedules_preserved=True, lifecycle_preserved=True, all_interfaces_preserved=True, completed_at=datetime.now(timezone.utc).isoformat())
        return receipt
    except Exception as error:
        checkpoint(failed_at=datetime.now(timezone.utc).isoformat(), outcome="STOPPED_NO_WRITE_RETRY", error_code=str(error) if isinstance(error, RuntimeError) else "release verification unavailable")
        raise


if __name__ == "__main__":
    try:
        require(os.environ.get("PRODUCTION_APPROVED") == "true", "explicit owner production approval required")
        require(os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch" and os.environ.get("GITHUB_REF") == "refs/heads/main", "manual main release required")
        require(os.environ.get("APPROVED_SHA") == os.environ.get("GITHUB_SHA"), "approved main SHA differs")
        require(bool(os.environ.get("APPROVAL_REF", "").strip()), "owner approval reference missing")
        for file, expected in SOURCE_HASHES.items():
            require(digest(Path(file).read_bytes()) == expected, "reviewed production source changed")
        require(subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == os.environ["APPROVED_SHA"], "checkout differs from approval")
        token = re.sub(r"[\r\n\u2028\u2029]", "", os.environ.get("CLOUDFLARE_API_TOKEN", "")).strip()
        worker = os.environ.get("TARGET_WORKER")
        clean = lambda name: re.sub(r"[\r\n\u2028\u2029]", "", os.environ.get(name, "")).strip()
        result = release(Api(token, clean("CLOUDFLARE_ROUTES_API_TOKEN"), clean("CLOUDFLARE_R2_API_TOKEN")), worker, "refund-preserved-input", "refund-release/" + worker, os.environ["APPROVED_SHA"], os.environ.get("PEER_VERSION"))
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as output:
                output.write("version=" + result["version_id"] + "\n")
        print(json.dumps({k: result[k] for k in ["worker", "version_id", "version_number", "deployment_id", "phase", "js_sha256"]}))
    except Exception as error:
        raise SystemExit(str(error) if isinstance(error, RuntimeError) else "release stopped; inspect the safe receipt, do not replay writes") from None
