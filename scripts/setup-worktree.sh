#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "==> Worktree: $ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "Erro: bun nao esta instalado no PATH."
  exit 1
fi

mkdir -p "${T3CODE_HOME:-$HOME/.t3}"

echo "==> Instalando dependencias..."
bun install

if ! command -v codex >/dev/null 2>&1 && ! command -v claude >/dev/null 2>&1; then
  echo
  echo "Aviso: nem 'codex' nem 'claude' estao no PATH."
  echo "O app sobe, mas voce nao vai conseguir usar provider real."
fi

echo
echo "Setup concluido."
echo "Proximo passo:"
echo "  bun dev"
