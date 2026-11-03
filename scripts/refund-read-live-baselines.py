"""GET-only immutable Worker source snapshot. Never uploads or reads business storage."""
import email.parser
import email.policy
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone

ACCOUNT = "b176eda1172b741fd2e58904cc9d77c5"
EXPECTED = {
    "admin-worker": ("e7bef51e-c819-468b-b34d-b192fac00f50", "admin-login-hero-worker.js"),
    "member-dashboard-chat-worker": ("e1598f73-ccad-4dc1-a441-c70004b68614", "guide-notification-entry.js"),
}
MAX_BYTES = 128 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError("Cloudflare source read redirected; no credential forwarded")


def get(token, worker, suffix):
    # Static host/account/workers; no caller-supplied URL or non-GET method.
    if worker not in EXPECTED or suffix not in {
        "", "/content/v2", "/deployments?per_page=1", "/versions/" + EXPECTED[worker][0]
    }:
        raise RuntimeError("unapproved source-read path")
    request = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{worker}{suffix}",
        method="GET", headers={"Authorization": "Bearer " + token},
    )
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=90) as response:
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise RuntimeError("source snapshot exceeds local size limit")
            return body, {"type": response.headers.get("Content-Type", ""),
                          "etag": response.headers.get("ETag", "")}
    except urllib.error.HTTPError as error:
        # Never print headers, credentials, upstream body or redirect URLs.
        raise RuntimeError(f"Cloudflare source GET rejected: HTTP {error.code}") from None


def api(token, worker, suffix):
    data = json.loads(get(token, worker, suffix)[0])
    if data.get("success") is not True:
        raise RuntimeError("Cloudflare metadata read not confirmed")
    return data["result"]


def active(token, worker):
    rows = api(token, worker, "/deployments?per_page=1").get("deployments", [])
    if not rows or rows[0].get("versions") != [{"version_id": EXPECTED[worker][0], "percentage": 100}]:
        raise RuntimeError("live baseline moved or allocation is ambiguous")
    return {"id": rows[0]["id"], "versions": rows[0]["versions"]}


def parts(body, headers, default_name):
    if "multipart/" not in headers["type"]:
        if "javascript" not in headers["type"]:
            raise RuntimeError("source response is not JavaScript/multipart")
        return {default_name: body}
    prefix = ("Content-Type: " + headers["type"] + "\r\nMIME-Version: 1.0\r\n\r\n").encode()
    message = email.parser.BytesParser(policy=email.policy.default).parsebytes(prefix + body)
    result = {}
    for part in message.iter_parts():
        name = part.get_filename() or part.get_param("name", header="content-disposition")
        if not name or name == "metadata":
            continue
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts or "\\" in name:
            raise RuntimeError("unsafe module path")
        if name in result:
            raise RuntimeError("duplicate module identity")
        result[name] = part.get_payload(decode=True)
    if not result:
        raise RuntimeError("empty Worker source response")
    return result


def snapshot(token, output):
    if not token:
        raise RuntimeError("read credential unavailable")
    receipt = {"at": datetime.now(timezone.utc).isoformat(), "method": "GET only", "workers": []}
    for worker, (version_id, default_name) in EXPECTED.items():
        before = active(token, worker)
        version = api(token, worker, "/versions/" + version_id)
        if version.get("id") != version_id:
            raise RuntimeError("exact version metadata missing")
        script = version["resources"]["script"]
        body, headers = get(token, worker, "")
        expected_etag = script.get("etag", "").strip('"')
        observed_etag = headers["etag"].strip('"')
        if not expected_etag or observed_etag != expected_etag:
            raise RuntimeError("download ETag does not prove the active immutable version")
        modules = parts(body, headers, default_name)
        if not any(name.endswith(".map") for name in modules):
            extra_body, extra_headers = get(token, worker, "/content/v2")
            if extra_headers["etag"].strip('"') != expected_etag:
                raise RuntimeError("source-map response ETag differs from the pinned version")
            for name, data in parts(extra_body, extra_headers, default_name).items():
                if name in modules and modules[name] != data:
                    raise RuntimeError("source changed between content reads")
                modules[name] = data
        after = active(token, worker)
        if before != after:
            raise RuntimeError("deployment changed during source read")
        if not any(name.endswith(".map") for name in modules):
            raise RuntimeError("live sourcemap unavailable; no reconstruction acceptance")
        records = []
        for name, data in modules.items():
            target = Path(output) / worker / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            records.append({"name": name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
        receipt["workers"].append({"worker": worker, "version_id": version_id, "deployment": before,
            "etag": expected_etag, "etag_matched": True, "stable": True,
            "source_sha_refs": re.findall(r"\b[0-9a-f]{40}\b", json.dumps(version.get("annotations", {}))),
            "handlers": script.get("handlers", []), "named_handlers": script.get("named_handlers", []),
            "runtime": version["resources"].get("script_runtime", {}), "modules": records})
    Path(output, "snapshot.json").write_text(json.dumps(receipt, indent=2) + "\n")
    return receipt


if __name__ == "__main__":
    try:
        result = snapshot(os.environ.get("CLOUDFLARE_API_TOKEN", ""), "refund-live-baselines")
        print(json.dumps({"versions": [{"worker": w["worker"], "version": w["version_id"],
            "modules": len(w["modules"]), "etag_matched": w["etag_matched"]} for w in result["workers"]]}))
    except Exception as error:
        # Fixed diagnostics only; neither arbitrary source data nor credentials.
        if isinstance(error, RuntimeError):
            raise SystemExit(str(error)) from None
        raise SystemExit("Worker source snapshot unavailable; see fixed validation gates") from None
