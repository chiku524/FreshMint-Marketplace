#!/usr/bin/env python3
"""Assemble .fm-assemble/<label>/*.hex into destination paths; commit and push."""
from __future__ import annotations
import hashlib, json, os, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / ".fm-assemble" / "manifest.json"
manifest = json.loads(MANIFEST.read_text())
changed = []
for entry in manifest:
    label = entry["label"]
    dest = ROOT / entry["dest"]
    parts_dir = ROOT / ".fm-assemble" / label
    hex_parts = sorted(parts_dir.glob("*.hex"))
    if not hex_parts:
        print(f"missing parts for {label}", file=sys.stderr)
        sys.exit(1)
    data = bytes.fromhex("".join(p.read_text().strip() for p in hex_parts))
    digest = hashlib.sha256(data).hexdigest()
    if digest != entry["sha256"]:
        print(f"sha mismatch {label}: got {digest} want {entry['sha256']}", file=sys.stderr)
        sys.exit(1)
    if len(data) != entry["size"]:
        print(f"size mismatch {label}", file=sys.stderr)
        sys.exit(1)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    changed.append(str(dest.relative_to(ROOT)))
    print(f"wrote {dest} ({len(data)} bytes, sha256={digest[:16]})")

subprocess.check_call(["git", "config", "user.name", "github-actions[bot]"])
subprocess.check_call(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"])
subprocess.check_call(["git", "add", "--", *changed])
status = subprocess.check_output(["git", "status", "--porcelain"], text=True)
if not status.strip():
    print("no changes")
    sys.exit(0)
msg = "Finish collection Settings wiring (package panel + page)\n\nOwner package admin only in Settings; buyers keep page checkout. Fix rarityById TDZ."
subprocess.check_call(["git", "commit", "-m", msg])
branch = os.environ.get("GITHUB_REF_NAME", "cursor/collection-profile-settings-8c12")
subprocess.check_call(["git", "push", "origin", f"HEAD:{branch}"])
print("pushed", branch)
