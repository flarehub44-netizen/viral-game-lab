#!/usr/bin/env bash
# Aplica migrations no projeto linkado e publica todas as Edge Functions.
# Requisitos: `npx supabase login` e `npx supabase link` na raiz do repo.
#
# Uso:
#   ./scripts/deploy-supabase.sh
#   ./scripts/deploy-supabase.sh --include-all   # quando db push pedir --include-all

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ""
if [[ "${1:-}" == "--include-all" ]]; then
  echo ">>> npx supabase db push --linked --include-all --yes"
  echo ""
  npx supabase db push --linked --include-all --yes
else
  echo ">>> npx supabase db push --linked --yes"
  echo ""
  npx supabase db push --linked --yes
fi

echo ""
echo ">>> npx supabase functions deploy --yes"
echo ""
npx supabase functions deploy --yes

echo ""
echo "Deploy Supabase concluído."
echo ""
