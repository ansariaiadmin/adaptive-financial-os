#!/usr/bin/env python3
"""Verify every repository file against manifest.sha256 (exits non-zero on failure)."""
import hashlib, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "manifest.sha256"

def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()

def main() -> int:
    if not MANIFEST.exists():
        print("manifest.sha256 not found", file=sys.stderr)
        return 2
    ok = bad = missing = 0
    for line in MANIFEST.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        expected, rel = line.split("  ", 1)
        p = ROOT / rel
        if not p.exists():
            print(f"MISSING  {rel}")
            missing += 1
        elif sha256(p) == expected:
            ok += 1
        else:
            print(f"BAD      {rel}")
            bad += 1
    total = ok + bad + missing
    print(f"verified: {ok}/{total} OK, {bad} corrupt, {missing} missing")
    if bad == missing == 0:
        print("ALL FILES VERIFIED 100%")
        return 0
    return 1

if __name__ == "__main__":
    sys.exit(main())
