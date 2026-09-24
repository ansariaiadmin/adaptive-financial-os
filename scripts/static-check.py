#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Static checks for the adaptive-financial-os monorepo."""
import json, os, re, sys, glob

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ROOT = os.path.abspath(ROOT)
results = []

def check(name, ok, detail=""):
    results.append((name, ok, detail))

# 1) JSON validity of all package.json + pnpm-workspace.yaml
for pj in glob.glob(os.path.join(ROOT, '**', 'package.json'), recursive=True):
    rel = os.path.relpath(pj, ROOT)
    try:
        json.load(open(pj, encoding='utf-8'))
        check(f"JSON valid: {rel}", True)
    except Exception as e:
        check(f"JSON valid: {rel}", False, str(e))
ws = os.path.join(ROOT, 'pnpm-workspace.yaml')
try:
    import yaml
    yaml.safe_load(open(ws, encoding='utf-8'))
    check("YAML valid: pnpm-workspace.yaml", True)
except ImportError:
    txt = open(ws, encoding='utf-8').read()
    check("YAML valid: pnpm-workspace.yaml (fallback regex)", bool(re.search(r'^packages\s*:', txt, re.M)))
except Exception as e:
    check("YAML valid: pnpm-workspace.yaml", False, str(e))

# 2) no orphan line with exactly `();` in ledger.service.ts
ls = os.path.join(ROOT, 'apps/api/src/ledger/ledger.service.ts')
lines = open(ls, encoding='utf-8').read().splitlines()
orphans = [(i+1, l.strip()) for i, l in enumerate(lines) if l.strip() == '();']
check("No orphan `();` line in ledger.service.ts", not orphans,
      f"found at lines {orphans}" if orphans else "")

# 3) no duplicated BEGIN in ledger.service.ts
src = open(ls, encoding='utf-8').read()
begins = [m.start() for m in re.finditer(r"query\(\s*'BEGIN'\s*\)", src)]
check("No duplicate BEGIN in ledger.service.ts", len(begins) <= 1, f"BEGIN count = {len(begins)}")

# 4) ValidationPipe with whitelist, forbidNonWhitelisted, transform in main.ts
mt = open(os.path.join(ROOT, 'apps/api/src/main.ts'), encoding='utf-8').read()
opts = {o: bool(re.search(o, mt)) for o in ('whitelist', 'forbidNonWhitelisted', 'transform')}
has_pipe = 'ValidationPipe' in mt
check("ValidationPipe in main.ts", has_pipe)
check("ValidationPipe options (whitelist, forbidNonWhitelisted, transform) in main.ts",
      has_pipe and all(opts.values()), str(opts))

# 5) class-validator decorators in post-entry.dto.ts
dto = open(os.path.join(ROOT, 'apps/api/src/ledger/dto/post-entry.dto.ts'), encoding='utf-8').read()
decs = re.findall(r'@(Is\w+|Min|Max|MinLength|MaxLength|Length|Matches|ArrayMinSize|ArrayMaxSize)\s*\(', dto)
check("class-validator decorators in post-entry.dto.ts", len(decs) > 0, f"decorators: {decs}")

# 6) class-validator & class-transformer in apps/api/package.json
api_deps = json.load(open(os.path.join(ROOT, 'apps/api/package.json'), encoding='utf-8'))
all_deps = {**api_deps.get('dependencies', {}), **api_deps.get('devDependencies', {})}
for pkg in ('class-validator', 'class-transformer'):
    check(f"{pkg} in apps/api/package.json", pkg in all_deps, all_deps.get(pkg, 'missing'))

# 7) atomic transaction pattern (BEGIN/COMMIT/ROLLBACK + outbox) in ledger.service.ts
pat = {
    'BEGIN': re.search(r"query\(\s*'BEGIN'\s*\)", src),
    'COMMIT': re.search(r"query\(\s*'COMMIT'\s*\)", src),
    'ROLLBACK': re.search(r"query\(\s*'ROLLBACK'\s*\)", src),
    'outbox': bool(re.search(r'\boutbox\b', src, re.I)),
}
check("Atomic transaction pattern in ledger.service.ts (BEGIN/COMMIT/ROLLBACK/outbox)",
      all(pat.values()), str({k: bool(v) for k, v in pat.items()}))

# 8) required outbox columns + indexes in db/migrations/0001_init.sql
msql = open(os.path.join(ROOT, 'db', 'migrations', '0001_init.sql'), encoding='utf-8').read()
for col in ('aggregate_type', 'aggregate_id', 'status', 'processed_at'):
    check(f"Column {col} in outbox_events (0001_init.sql)",
          bool(re.search(rf'\b{col}\b', msql)))
for idx_name in ('idx_outbox_tenant_status', 'idx_outbox_status', 'idx_idempotency_tenant_key'):
    check(f"Index {idx_name} in 0001_init.sql", idx_name in msql)

failed = [r for r in results if not r[1]]
print("=" * 64)
for name, ok, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  -> {detail}" if detail else ""))
print("=" * 64)
print(f"TOTAL: {len(results)}  PASS: {len(results)-len(failed)}  FAIL: {len(failed)}")
sys.exit(1 if failed else 0)
