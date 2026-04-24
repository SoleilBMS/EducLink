#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/deploy.sh [staging|production] [options]

Options:
  --seed       Run npm run db:seed after migrations (explicit only)
  --start      Start the app process after preparation
  --help       Show this help

Behavior:
  - validates required env vars
  - runs npm ci
  - runs npm run db:migrate
  - optionally runs npm run db:seed when --seed is provided
  - prints the start command (or executes it with --start)
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

environment="$1"
shift

run_seed="false"
run_start="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed)
      run_seed="true"
      ;;
    --start)
      run_start="true"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

case "$environment" in
  staging)
    export NODE_ENV="${NODE_ENV:-staging}"
    start_cmd=(npm run start:staging)
    ;;
  production)
    export NODE_ENV="${NODE_ENV:-production}"
    start_cmd=(npm run start:prod)
    ;;
  *)
    echo "Unsupported environment '$environment'. Use staging or production." >&2
    exit 1
    ;;
esac

export EDUCLINK_PERSISTENCE="${EDUCLINK_PERSISTENCE:-postgres}"
export LOG_FORMAT="${LOG_FORMAT:-json}"

required_vars=(
  NODE_ENV
  PORT
  EDUCLINK_PERSISTENCE
  DATABASE_URL
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required env var: ${var_name}" >&2
    exit 1
  fi
done

if [[ "$EDUCLINK_PERSISTENCE" != "postgres" ]]; then
  echo "EDUCLINK_PERSISTENCE must be postgres for $environment deployment." >&2
  exit 1
fi

echo "==> Installing dependencies"
npm ci

echo "==> Running database migrations"
npm run db:migrate

if [[ "$run_seed" == "true" ]]; then
  echo "==> Running database seed (explicit request)"
  npm run db:seed
else
  echo "==> Skipping database seed (pass --seed to run it)"
fi

echo "==> Prepared $environment deployment successfully"
echo "Start command: ${start_cmd[*]}"

if [[ "$run_start" == "true" ]]; then
  echo "==> Starting application"
  exec "${start_cmd[@]}"
fi
