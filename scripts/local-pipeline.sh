#!/usr/bin/env bash
# Run the same stages as .github/workflows/final-project.yml on a laptop.
#
#   cd devops-project
#   ./scripts/local-pipeline.sh
#
# Needs: python3.12 (or uv), node/npm, docker, trivy, gitleaks.
# pytest / ruff / bandit / pip-audit go into application/backend/.venv
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
BE=application/backend
FE=application/frontend
VENV="$BE/.venv"
R=security/reports
TAG="${TAG:-local}"
# trivy's default DB mirror sometimes times out; GHCR mirror is the same DB
TRIVY_DB="${TRIVY_DB:-ghcr.io/aquasecurity/trivy-db}"
stage() { printf '\n========== %s ==========\n' "$*"; }

stage "1. Build + lint"
[ -x "$VENV/bin/python" ] || python3.12 -m venv "$VENV" 2>/dev/null || uv venv -p 3.12 "$VENV"
"$VENV/bin/python" -m pip install -q -r "$BE/requirements-dev.txt" "bandit[sarif]==1.9.4" pip-audit==2.10.1 2>/dev/null \
  || uv pip install -q -p "$VENV/bin/python" -r "$BE/requirements-dev.txt" "bandit[sarif]==1.9.4" pip-audit==2.10.1
(cd "$BE" && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/python -m compileall -q app)
(cd "$FE" && npm ci --no-audit --no-fund --silent && npm run build --silent)

stage "2. Unit tests (coverage gate 80%)"
(cd "$BE" && .venv/bin/pytest -q -p no:cacheprovider --cov=app --cov-report=term --cov-fail-under=80 && rm -f .coverage)

rm -rf "$R" && mkdir -p "$R"

stage "3. SAST (bandit)"
"$VENV/bin/bandit" -q -c security/bandit.yaml -r "$BE/app" "$BE/alembic" -f json -o "$R/bandit.json" --exit-zero
"$VENV/bin/bandit" -q -c security/bandit.yaml -r "$BE/app" "$BE/alembic" || true

stage "4. SCA (pip-audit + npm audit + trivy fs)"
"$VENV/bin/pip-audit" -r "$BE/requirements.txt" -f json -o "$R/pip-audit.json" || true
"$VENV/bin/pip-audit" -r "$BE/requirements.txt" || true
(cd "$FE" && npm audit --json > "$ROOT/$R/npm-audit.json" || true; npm audit || true)
trivy fs --config security/trivy.yaml --db-repository "$TRIVY_DB" --severity HIGH,CRITICAL --no-progress --quiet .

stage "5. Secret scan (gitleaks)"
gitleaks detect --no-git --source . --config security/.gitleaks.toml --redact --no-banner --no-color \
  --exit-code 0 --report-format json --report-path "$R/gitleaks.json"

stage "6. Docker build"
# If Docker Hub rate-limits us (429), fall back to the classic builder, which
# happily uses base images already in the local image store.
build() { docker build -q -t "$1" "$2" || DOCKER_BUILDKIT=0 docker build -q -t "$1" "$2"; }
build "stocksense-backend:$TAG" "$BE"
build "stocksense-frontend:$TAG" "$FE"

stage "7. Container image scan (trivy)"
for img in backend frontend; do
  trivy image --config security/trivy.yaml --db-repository "$TRIVY_DB" --no-progress --quiet \
    -f json -o "$R/trivy-image-$img.json" "stocksense-$img:$TAG"
  trivy image --ignorefile security/.trivyignore --skip-db-update --severity HIGH,CRITICAL \
    --no-progress --quiet "stocksense-$img:$TAG"
done

stage "8. Security gate"
"$VENV/bin/python" security/gate.py --reports "$R"   # set -e: a FAIL stops here, nothing gets pushed
