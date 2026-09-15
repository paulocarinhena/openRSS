#!/bin/sh
set -e

case "${DATABASE_PROVIDER:-sqlite}" in
  sqlite|postgresql) ;;
  *)
    echo "ERRO: DATABASE_PROVIDER inválido: '${DATABASE_PROVIDER}'. Use 'sqlite' ou 'postgresql'." >&2
    exit 1
    ;;
esac

case "${APP_SECRET:-}" in
  ""|change-me|changeme|secret|build-only-placeholder-secret|troque-este-segredo-por-um-valor-aleatorio)
    echo "ERRO: defina APP_SECRET com um valor aleatório, não um placeholder (ex.: openssl rand -base64 32)." >&2
    exit 1
    ;;
esac

if [ "${#APP_SECRET}" -lt 16 ]; then
  echo "ERRO: APP_SECRET deve ter pelo menos 16 caracteres aleatórios." >&2
  exit 1
fi

echo "openRSS: aplicando migrations (${DATABASE_PROVIDER:-sqlite})..."
node node_modules/prisma/build/index.js migrate deploy

exec node node_modules/next/dist/bin/next start -H "${HOSTNAME:-0.0.0.0}" -p "${PORT:-3000}"
