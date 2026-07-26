#!/usr/bin/env bash
set -euo pipefail

echo "=== EAS PRE-INSTALL HOOK ==="
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version 2>/dev/null || echo 'not found')"
echo "npm: $(npm --version)"
echo "CWD: $(pwd)"
echo "NODE_LINKER: ${NODE_LINKER:-not set}"
echo "=== ls root ==="
ls -la
echo "=== cat .npmrc (if exists) ==="
cat .npmrc 2>/dev/null || echo "(no .npmrc)"
echo "=== cat pnpm-workspace.yaml (first 40 lines) ==="
head -40 pnpm-workspace.yaml 2>/dev/null || echo "(no pnpm-workspace.yaml)"
