#!/bin/sh
# Container entrypoint for the StockSense API.
#   1. wait until Postgres accepts connections
#   2. run Alembic migrations (skipped when RUN_MIGRATIONS=false, e.g. in k8s
#      where an initContainer already did it)
#   3. exec uvicorn so it becomes PID 1 and receives SIGTERM directly
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  python -m app.wait_for_db
  alembic upgrade head
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' "$@"
