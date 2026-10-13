#!/usr/bin/env python3
"""Install KBank sandbox credentials on the existing payments-worker."""
import getpass
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import warnings

ACCOUNT_ID = "b176eda1172b741fd2e58904cc9d77c5"
WORKER = "payments-worker"
SECRET_NAMES = ("KBANK_SANDBOX_CONSUMER_ID", "KBANK_SANDBOX_CONSUMER_SECRET")


def main():
    root = Path(__file__).resolve().parents[1]
    config = root / "payments-worker" / "wrangler.merged.toml"
    if not config.is_file() or not re.search(
        r'^name\s*=\s*"payments-worker"\s*$', config.read_text(), re.M
    ):
        raise RuntimeError("Canonical payments-worker config not found.")
    if not sys.stdin.isatty():
        raise RuntimeError("Run directly in an interactive Terminal.")
    # Refuse getpass fallback rather than echoing credentials.
    warnings.simplefilter("error", getpass.GetPassWarning)
    env = dict(os.environ)
    existing_account = env.get("CLOUDFLARE_ACCOUNT_ID")
    if existing_account and existing_account != ACCOUNT_ID:
        raise RuntimeError("Cloudflare account differs from the MMD deployment account.")
    env["CLOUDFLARE_ACCOUNT_ID"] = ACCOUNT_ID
    env["WRANGLER_SEND_METRICS"] = "false"
    command = ["npx", "--yes", "wrangler@4"]
    common = ["--config", str(config), "--name", WORKER]

    def invoke(args, payload=None):
        result = subprocess.run(
            command + args + common,
            input=payload,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=root,
            env=env,
        )
        if result.returncode:
            # Never echo CLI output after sending credentials.
            raise RuntimeError("Wrangler failed. Check Cloudflare login and Worker permissions; no credential values were printed.")
        return result.stdout

    def names():
        output = invoke(["secret", "list", "--format", "json"])
        entries = json.loads(output)
        if not isinstance(entries, list):
            raise RuntimeError("Unexpected secret-list response.")
        return {entry.get("name") for entry in entries if isinstance(entry, dict)}

    before = names()  # Read-only preflight before requesting credentials.
    print("Target: MMD Cloudflare / payments-worker")
    print("Sandbox credentials only. Use newly generated credentials.")
    if any(name in before for name in SECRET_NAMES):
        answer = input("Existing KBank sandbox secrets will be replaced. Type REPLACE: ")
        if answer != "REPLACE":
            print("Cancelled.")
            return
    values = {}
    for name in SECRET_NAMES:
        value = getpass.getpass(name + " (hidden): ").strip()
        if not value or any(c.isspace() for c in value) or not value.isascii():
            raise RuntimeError("Credential must be non-empty ASCII without whitespace.")
        values[name] = value
    invoke(["secret", "bulk"], json.dumps(values))
    values.clear()
    after = names()
    if not set(SECRET_NAMES).issubset(after):
        raise RuntimeError("Upload attempted, but both secret names could not be confirmed. Check Cloudflare before retrying.")
    print("Verified secret names: " + ", ".join(SECRET_NAMES))
    print("Step 1 complete. OAuth and transfer execution are not enabled.")


if __name__ == "__main__":
    try:
        main()
    except (Exception, KeyboardInterrupt) as exc:
        # Only emit controlled messages; never a traceback containing local values.
        if isinstance(exc, RuntimeError):
            print(str(exc), file=sys.stderr)
        else:
            print("Setup stopped. No credential values were printed.", file=sys.stderr)
        sys.exit(1)
