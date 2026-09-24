#!/usr/bin/env bash
# Build a clean release zip of the repository (excludes junk), generate
# manifest.sha256 for all files (excluding the manifest itself), then verify.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import hashlib, os, zipfile
from pathlib import Path

ROOT = Path(".")
SKIP_DIRS = {"node_modules", "dist", ".git", "__pycache__"}
SKIP_FILES = {"manifest.sha256"}  # manifest excludes itself to avoid chicken-and-egg

def iter_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in sorted(filenames):
            if fn in SKIP_FILES:
                continue
            yield Path(dirpath) / fn

files = sorted(iter_files())
lines = []
for f in files:
    digest = hashlib.sha256(f.read_bytes()).hexdigest()
    lines.append(f"{digest}  {f.as_posix()}")
(ROOT / "manifest.sha256").write_text("\n".join(lines) + "\n")

zip_path = ROOT.parent / "adaptive-financial-os-P00-P01.zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, ROOT.name + "/" + f.as_posix())
    z.write(ROOT / "manifest.sha256", ROOT.name + "/manifest.sha256")
print(f"zip: {zip_path} ({zip_path.stat().st_size} bytes, {len(files)+1} entries)")
PY

echo "verifying..."
python3 scripts/verify-manifest.py
