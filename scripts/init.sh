#!/usr/bin/env bash
# Sobe o ambiente do zero (clone, Cursor Cloud, Claude remoto). Sem secret de produção.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@10.33.4 --activate
  else
    echo "precisa Node 24 com corepack/pnpm" >&2
    exit 1
  fi
fi

pnpm install --frozen-lockfile

mkdir -p .claude .cursor
if [[ ! -e .claude/skills ]]; then
  ln -s ../.agents/skills .claude/skills
fi
if [[ ! -e .cursor/mcp.json ]]; then
  ln -s ../.mcp.json .cursor/mcp.json
fi

echo "init ok"
echo "  setup:   pnpm run setup (prepara banco e migrations locais)"
echo "  app:     pnpm dev → use o endereço impresso; exemplos em /referência"
echo "  loop:    pnpm test:loop"
echo "  gate:    pnpm check:quick"
echo "  guia:    README.md — comece pelo pedido do projeto, sem ferramenta de tarefas obrigatória"
