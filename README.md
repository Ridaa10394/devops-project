# Final DevOps Project - StockSense

Name: Ridaa Mirza
Enrollment No: 24BCS10394

StockSense is a small inventory management app (React + FastAPI + PostgreSQL) that I used to take one application all the way from my laptop to a monitored Kubernetes cluster: tests, Docker, a CI/CD pipeline with security gates, Terraform for AWS, raw Kubernetes manifests, a Helm chart, Prometheus/Grafana, Argo CD, and a troubleshooting challenge where I broke it on purpose (and once by accident).

**Presentation:** [`demo/StockSense-Final-Presentation.pptx`](demo/StockSense-Final-Presentation.pptx) - 24 slides walking through the whole project, with the full explanation in the speaker notes of every slide.

### Demo video

[![StockSense demo video - click to play](screenshots/00-demo-video-thumbnail.png)](demo/stocksense-demo.mp4)

[`demo/stocksense-demo.mp4`](demo/stocksense-demo.mp4) (1:42) - a screen recording of the app running locally with Docker Compose: adding a new item from the dashboard, the Products catalogue with category filters, the Suppliers and Reports pages, and the FastAPI Swagger docs at `/docs`.

Everything shown here was run for real on my MacBook (Apple Silicon, Docker Desktop, minikube with the docker driver). Every terminal screenshot is rendered from the saved output in [`outputs/`](outputs/) - nothing is typed in by hand.

---

## Contents

1. [Project overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Technologies used](#3-technologies-used)
4. [Application setup](#4-application-setup)
5. [Docker setup](#5-docker-setup)
6. [Kubernetes deployment](#6-kubernetes-deployment)
7. [Helm deployment](#7-helm-deployment)
8. [Terraform infrastructure](#8-terraform-infrastructure)
9. [CI/CD pipeline](#9-cicd-pipeline)
10. [DevSecOps implementation](#10-devsecops-implementation)
11. [Monitoring](#11-monitoring)
12. [GitOps](#12-gitops)
13. [Troubleshooting](#13-troubleshooting)
14. [Screenshots](#14-screenshots)
15. [Lessons learned](#15-lessons-learned)
16. [Rubric checklist (GRADING.md M1-M10)](#16-rubric-checklist-gradingmd-m1-m10)

---

## 1. Project overview

The domain is my own (the rubric says the DevOps layer can follow the TaskBoard reference, the app can't): **StockSense - a warehouse inventory dashboard.**

What the app does:

- list all items (SKU, name, category, supplier, quantity, reorder level, unit price) with search and filters
- KPI cards: number of products, units on hand, low stock, out of stock, total inventory value
- add / edit / delete items, quick `+` / `-` buttons to ship or restock one unit
- a "Reorder soon" panel with a one-click restock
- each item gets a computed status: `IN_STOCK`, `LOW_STOCK` (at or below reorder level) or `OUT_OF_STOCK`

REST API (FastAPI, Swagger at `/docs`):

| Method | Path | What |
|---|---|---|
| GET | `/health` | liveness - process is up, no DB call |
| GET | `/ready` | readiness - `SELECT 1` against Postgres, 503 if it fails |
| GET | `/metrics` | Prometheus metrics |
| GET | `/api/items?q=&category=&low_stock=` | list / search / filter |
| GET | `/api/items/{id}` | one item (404 if missing) |
| POST | `/api/items` | create (409 on duplicate SKU, 422 on bad input) |
| PUT | `/api/items/{id}` | partial update |
| POST | `/api/items/{id}/adjust` | `{"delta": -3}` ship / `{"delta": 10}` restock (400 if it would go negative) |
| DELETE | `/api/items/{id}` | delete (204) |
| GET | `/api/items/stats` | KPI numbers for the dashboard |

![StockSense running in the browser](screenshots/01-app-docker-compose.png)

### Folder layout

```
devops-project/
├── application/
│   ├── backend/              FastAPI app, SQLAlchemy models, Alembic migrations, pytest, Dockerfile
│   └── frontend/             React 19 + Vite 8, nginx template, Dockerfile (multi-stage)
├── docker/                   docker-compose.yml (postgres + backend + frontend) + notes
├── kubernetes/               raw manifests: namespace, ConfigMap, Secret, Postgres StatefulSet+PVC,
│                             Deployments, Services, Ingress, HPAs, probes (kustomization.yaml)
├── helm/stocksense/          Helm chart: values.yaml, values-dev.yaml, values-prod.yaml, helm test
├── terraform/                AWS VPC (2 public + 2 private subnets) + EKS with a managed node group
├── .github/workflows/        final-project.yml (the CI/CD + DevSecOps pipeline) + README
├── security/                 bandit / gitleaks / trivy configs, gate-policy.toml, gate.py
├── monitoring/               kube-prometheus-stack values, ServiceMonitor, alert rules, Grafana dashboard
├── gitops/                   Argo CD values, AppProject, Application (+ a live demo Application)
├── troubleshooting/          7 scenarios: broken/ + fixed/ YAML, real outputs, screenshots
├── scripts/                  local-pipeline.sh (CI stages on a laptop), load-test.sh (HPA)
├── outputs/                  real terminal output of every step
└── screenshots/              browser screenshots + terminal screenshots rendered from outputs/
```

Every folder has its own README with more detail: [docker](docker/README.md), [kubernetes](kubernetes/README.md), [helm](helm/README.md), [terraform](terraform/README.md), [security](security/README.md), [monitoring](monitoring/README.md), [gitops](gitops/README.md), [troubleshooting](troubleshooting/README.md), [.github/workflows](.github/workflows/README.md).

---

## 2. Architecture

```mermaid
flowchart LR
    dev[Developer laptop] -->|git push| gh[GitHub repo<br/>Ridaa10394/devops-project]
    gh --> ci[GitHub Actions<br/>final-project.yml]
    subgraph pipeline[CI/CD + DevSecOps]
      ci --> t[ruff + pytest + coverage<br/>npm ci + vite build<br/>helm lint + terraform validate]
      t --> s1[bandit SAST] --> s2[pip-audit / npm audit / trivy fs] --> s3[gitleaks]
      s3 --> b[docker build x2] --> sc[trivy image x2] --> g{security gate}
    end
    g -->|pass, main only| reg[(GHCR<br/>stocksense-*:git-sha)]
    reg --> kind[kind cluster in CI<br/>helm install + helm test]
    gh -.->|pull| argo[Argo CD]
    tf[Terraform] --> aws[AWS VPC + EKS]
    argo --> k8s
    reg --> k8s
    subgraph k8s[Kubernetes: minikube / EKS]
      ing[Ingress nginx<br/>stocksense.localhost] -->|/| fe[frontend x2<br/>nginx + React]
      ing -->|/api| be[backend x2-5<br/>FastAPI, HPA]
      fe -->|/api proxy| be
      be --> pg[(PostgreSQL<br/>StatefulSet + PVC)]
      prom[Prometheus] -->|ServiceMonitor /metrics| be
      graf[Grafana] --> prom
    end
```

ASCII version (same thing):

```
 laptop --git push--> GitHub --> GitHub Actions (final-project.yml)
                                   |
   lint+pytest(Postgres)  frontend build  helm lint/terraform validate
                                   |
            bandit -> pip-audit/npm audit/trivy fs -> gitleaks
                                   |
            docker build (backend, frontend) -> trivy image -> SECURITY GATE
                                   |  (main only)
                       ghcr.io/ridaa10394/stocksense-*:<sha>
                                   |
                  kind cluster in CI: helm install + helm test + curl

 Terraform -> AWS: VPC (2 public + 2 private subnets, NAT) -> EKS + node group
 Argo CD  <- pulls helm/stocksense from GitHub -> keeps the cluster in sync

                    Kubernetes namespace final-app
   browser -> Ingress (stocksense.localhost)
                 |-- /     -> Service stocksense-frontend -> 2 pods (nginx, React)
                 |-- /api  -> Service stocksense-backend  -> 2..5 pods (FastAPI)  <- HPA (CPU 60%)
                                                               |
                                              Service stocksense-postgres (headless)
                                                               |
                                               StatefulSet postgres-0 + PVC (1Gi)
   Prometheus --ServiceMonitor--> backend /metrics      Grafana -> Prometheus
```

---

## 3. Technologies used

| Area | Tools (versions I actually ran) |
|---|---|
| Frontend | React 19.3, Vite 8.3, plain CSS (responsive), nginx-unprivileged 1.29-alpine |
| Backend | Python 3.12, FastAPI 0.142, SQLAlchemy 2.1, psycopg 3.3, pydantic-settings, Alembic 1.20, uvicorn |
| Database | PostgreSQL 16 (alpine) |
| Testing / quality | pytest 9.1 + pytest-cov 7.1 (80% gate), httpx TestClient, ruff 0.16 |
| Containers | Docker Desktop 29.7, Docker Compose, multi-stage builds, non-root users |
| CI/CD | GitHub Actions, actionlint 1.7.12, GHCR, kind (helm/kind-action) |
| Security | bandit 1.9.4, pip-audit 2.10.1, npm audit, trivy 0.75.0 (fs, image, config), gitleaks 8.30.1, custom gate (`gate.py`) |
| IaC | Terraform 1.16.4, AWS provider 6.67, terraform-aws-modules/vpc 6.7.3, terraform-aws-modules/eks 21.26.0 |
| Kubernetes | minikube (k8s v1.37.0), ingress-nginx, metrics-server, kustomize, StatefulSet/PVC, HPA v2 |
| Packaging | Helm 3 chart with tests |
| Monitoring | kube-prometheus-stack 92.1.0 (Prometheus 3.15, Grafana 13.2, operator 0.94), prometheus-fastapi-instrumentator |
| GitOps | Argo CD 3.5.5 (argo-cd chart 10.10.3) |

---

## 4. Application setup

### Backend

```
application/backend/
├── app/
│   ├── config.py        settings from env vars; builds DATABASE_URL from DB_HOST/DB_USER/... (k8s ConfigMap + Secret)
│   ├── db.py            engine, session, get_db dependency
│   ├── models.py        Item model + computed stock_status
│   ├── schemas.py       pydantic request/response models with validation
│   ├── main.py          routes, /health /ready /metrics, business metrics
│   └── wait_for_db.py   retry until Postgres accepts connections (used before migrations)
├── alembic/versions/    0001_create_items.py, 0002_seed_items.py (6 demo items)
├── alembic/env.py       uses a Postgres advisory lock so 2 replicas can't migrate at the same time
├── tests/               conftest.py + 19 tests (health, CRUD, validation, filters, stats, migrations, wait_for_db)
├── pytest.ini  ruff.toml  requirements.txt  requirements-dev.txt  .env.example  Dockerfile
```

Run it directly:

```bash
cd application/backend
uv venv -p 3.12 .venv && . .venv/bin/activate        # or python3.12 -m venv .venv
pip install -r requirements-dev.txt
cp .env.example .env                                  # point DATABASE_URL at a Postgres
alembic upgrade head
uvicorn app.main:app --reload --port 8000             # http://localhost:8000/docs
```

**Tests never touch a real database.** `tests/conftest.py` overrides FastAPI's `get_db` dependency with an in-memory SQLite engine (fresh tables per test). Set `TEST_DATABASE_URL` and the same tests run against a throwaway Postgres - which is what CI does with a Postgres service container. `test_migrations.py` runs the real Alembic upgrade + downgrade on a scratch database.

```bash
ruff check . && ruff format --check .
pytest -v --cov=app --cov-report=term-missing --cov-fail-under=80
```

![ruff and pytest](screenshots/10-ruff-pytest.png)

Same 19 tests against a real Postgres 16 container (what CI runs):

![pytest against postgres](screenshots/11-pytest-postgres.png)

### Frontend

`application/frontend/src/App.jsx` + `api.js` + `styles.css`. All calls go to a relative `/api` path, so the browser never needs to know an internal hostname - nginx (Docker/K8s) or the Vite dev proxy forwards it.

```bash
cd application/frontend
npm ci              # exact versions from package-lock.json
npm run build       # dist/
npm run dev         # http://localhost:5173, proxies /api to localhost:8000
```

![frontend build](screenshots/12-frontend-build.png)

It's responsive - same page at phone width:

<img src="screenshots/02-app-mobile.png" alt="mobile layout" width="320">

---

## 5. Docker setup

Details: [docker/README.md](docker/README.md).

- **Backend** (`application/backend/Dockerfile`): 2 stages - build a venv, copy it into a clean `python:3.12-slim`, **remove pip** from the runtime (trivy found HIGH CVEs in pip's vendored libs), run as **UID 10001**, `HEALTHCHECK` on `/health`. The entrypoint waits for the DB, runs `alembic upgrade head`, then `exec uvicorn`.
- **Frontend** (`application/frontend/Dockerfile`): **multi-stage** - `node:22-alpine` runs `npm ci && npm run build`, then only `dist/` is copied into `nginx-unprivileged:1.29-alpine` (**UID 101**, port 8080, `apk upgrade` for security fixes). The nginx config is a template, `BACKEND_URL` is filled in at start.
- **Compose** (`docker/docker-compose.yml`): postgres (healthcheck, only on `backend-net`), backend (waits for postgres healthy), frontend (waits for backend healthy).

```bash
cd docker
docker compose build --no-cache
FRONTEND_PORT=13000 BACKEND_PORT=18000 docker compose up -d --build   # 3000/8000 were taken on my Mac
```

![docker build](screenshots/13-docker-build.png)

![docker compose up](screenshots/14-compose-up.png)

All CRUD endpoints against the running stack (GET, POST, PUT, adjust, stats, the 409 duplicate, DELETE, then 404):

![compose api crud](screenshots/15-compose-api-crud.png)

The frontend's nginx proxying `/api`, the migrated `items` table inside Postgres, and both containers running as non-root (and no `pip` in the backend image):

![compose proxy db nonroot](screenshots/16-compose-proxy-db-nonroot.png)

Swagger UI at `http://localhost:18000/docs`:

![swagger](screenshots/03-api-swagger-docs.png)

```bash
docker compose down -v
```

![compose down](screenshots/17-compose-down.png)

---

## 6. Kubernetes deployment

Details: [kubernetes/README.md](kubernetes/README.md). Namespace `final-app` on minikube (ingress + metrics-server addons).

| Requirement | Where |
|---|---|
| Namespace | `kubernetes/00-namespace.yaml` |
| ConfigMap | `01-configmap.yaml` (DB host/port/name, APP_ENV, BACKEND_URL) |
| Secret | `02-secret.yaml` (DB_USER / DB_PASSWORD, fake dev-only value) |
| Postgres StatefulSet + PVC | `03-postgres.yaml` (volumeClaimTemplates 1Gi, headless Service) |
| Deployments + Services | `04-backend.yaml`, `05-frontend.yaml` (2 replicas each, ClusterIP) |
| Probes | backend startup `/health`, readiness `/ready` (DB), liveness `/health`; frontend `/healthz`; postgres `pg_isready` |
| Ingress | `06-ingress.yaml` - `/api` -> backend:8000, `/` -> frontend:80, host `stocksense.localhost` |
| HPA | `07-hpa.yaml` - backend 2-5 @ 60% CPU, frontend 2-4 @ 70% |
| Security | all pods non-root, read-only root filesystem, all capabilities dropped, seccomp RuntimeDefault |

```bash
docker tag stocksense-backend:local stocksense-backend:1.0.0      # same for frontend
minikube image load stocksense-backend:1.0.0                      # no registry needed for minikube
kubectl apply -k kubernetes/
```

![minikube image load](screenshots/26-minikube-image-load.png)

![kubectl apply](screenshots/27-k8s-raw-apply.png)

Everything that got created - Deployments 2/2, StatefulSet 1/1, Services with endpoints, Ingress, HPAs, PVC `Bound`, ConfigMap, Secret:

![kubectl get all](screenshots/28-k8s-raw-get-all.png)

Probes on the backend pods and the `migrate` init container - both replicas wait for Postgres, only one actually runs the migration (advisory lock):

![probes and migrate](screenshots/29-k8s-probes-migrate.png)

![pvc db configmap](screenshots/30-k8s-pvc-db-configmap.png)

Through the Ingress from the Mac (`kubectl -n ingress-nginx port-forward svc/ingress-nginx-controller 18210:80`; `*.localhost` resolves to 127.0.0.1 on its own, so no `/etc/hosts` edit):

![ingress curl](screenshots/31-k8s-ingress-curl.png)

![hpa and top](screenshots/32-k8s-hpa-top.png)

---

## 7. Helm deployment

Details: [helm/README.md](helm/README.md). The chart (`helm/stocksense`) renders everything above plus an optional ServiceMonitor, PrometheusRule and Grafana dashboard, with `values.yaml` (defaults, GHCR images), `values-dev.yaml` (minikube) and `values-prod.yaml` (EKS: existing Secret, gp3, TLS, larger HPA). CI only sets `global.imageTag=<git sha>`.

```bash
helm lint helm/stocksense -f helm/stocksense/values-dev.yaml
helm upgrade --install stocksense helm/stocksense -n final-app -f helm/stocksense/values-dev.yaml --wait
helm test stocksense -n final-app --logs
```

![helm lint](screenshots/25-actionlint-helm-lint.png)

![helm install](screenshots/33-helm-install.png)

All pods `Running`, ClusterIP Services, Ingress, HPAs, PVC, ServiceMonitor, PrometheusRule:

![helm get all](screenshots/34-helm-get-all.png)

`helm test` runs a pod inside the cluster that checks health, readiness, the API, `/metrics`, the frontend and the frontend's `/api` proxy:

![helm test](screenshots/35-helm-test.png)

The app through the Helm release's Ingress, with a create + update:

![helm ingress crud](screenshots/37-helm-ingress-crud.png)

![app through ingress](screenshots/04-app-k8s-ingress.png)

Upgrade and rollback (the `checksum/config` annotation rolled the pods automatically):

![helm upgrade rollback](screenshots/36-helm-upgrade-rollback.png)

### Autoscaling (HPA) under load

`scripts/load-test.sh` starts a curl pod inside the cluster with 8 workers hammering `/api/items/stats` for 4 minutes (~73k requests). The HPA went 2 -> 5 when CPU hit 203-330% of the request, and back to 2 once the load stopped:

![hpa load test](screenshots/39-hpa-load-test.png)

(The error line at 18:15 is the shared minikube API server stalling - that's troubleshooting scenario 7, part 2.)

---

## 8. Terraform infrastructure

Details: [terraform/README.md](terraform/README.md).

- `terraform-aws-modules/vpc` 6.7.3: VPC `10.42.0.0/16`, **2 public + 2 private subnets** across 2 AZs, IGW, one NAT gateway (cheap), ELB subnet tags.
- `terraform-aws-modules/eks` 21.26.0: EKS 1.33 in the private subnets, addons incl. metrics-server, **managed node group** t3.medium (min 1 / desired 2 / max 3, SPOT in dev), creator gets cluster-admin.
- `cluster_admin_cidrs` has no default and rejects `0.0.0.0/0` (trivy config flagged an open API endpoint).
- `terraform.tfvars.example` committed, `terraform.tfvars` / state / `.terraform` gitignored, S3 backend block ready (commented).

`terraform init`, `fmt` and `validate` all pass (the same checks run in CI, job 1c):

![terraform init validate](screenshots/23-terraform-init-validate.png)

Creating the infrastructure in an AWS account (about 15 minutes; roughly $0.15/hour while the cluster exists, so destroy it afterwards):

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # set cluster_admin_cidrs = ["<your IP>/32"]
aws configure
terraform init
terraform plan -out tfplan
terraform apply tfplan
$(terraform output -raw configure_kubectl) && kubectl get nodes
terraform destroy
```

---

## 9. CI/CD pipeline

The workflow is [`.github/workflows/final-project.yml`](.github/workflows/final-project.yml). It runs on every push and pull request to `main`, plus manual `workflow_dispatch`.

```
push / PR to main
 ├─ 1a backend-test    ruff, pytest -v against a Postgres service, --cov-fail-under=80, alembic up/down
 ├─ 1b frontend-build  npm ci, npm run build
 └─ 1c iac-validate    helm lint (dev + prod), kubectl kustomize, terraform fmt/init/validate, dashboard copy in sync
        │
 2  SAST            bandit -> bandit.json (+ SARIF to code scanning)
 3  SCA             pip-audit, npm audit, trivy fs (lockfiles), trivy config (IaC, report only)
 4  Secret scan     gitleaks (pinned binary, sha256-verified)
 5  Docker build    matrix backend/frontend, tag = ghcr.io/<owner lower-case>/stocksense-<c>:${GITHUB_SHA}
 6  Trivy image     matrix; JSON report + `--severity HIGH,CRITICAL --ignore-unfixed --exit-code 1`
 7  Security gate   security/gate.py over all reports
        │ (only push events on main)
 8  Push to GHCR    the exact scanned images, SHA tag only (no `latest`), GITHUB_TOKEN
 9  Deploy          kind cluster in the runner, metrics-server, helm upgrade --install, helm test, curl smoke test
```

Notes on decisions:

- Images are built **once**, saved as artifacts, scanned, and the same tarball is pushed - what was scanned is what ships.
- `${GITHUB_REPOSITORY_OWNER,,}` lower-cases `Ridaa10394` - GHCR rejects upper-case image names (the reference workflow would fail on that).
- Deploy goes to a throwaway **kind** cluster because a GitHub runner can't reach my laptop's minikube. For EKS, swap the kind step for `aws-actions/configure-aws-credentials` (OIDC) + `aws eks update-kubeconfig` - or let Argo CD pull (section 12).
- Pinned scanner binaries with sha256 checks instead of third-party wrapper actions.

The workflow passes `actionlint` (which also shellchecks every `run:` block):

![actionlint](screenshots/25-actionlint-helm-lint.png)

`scripts/local-pipeline.sh` runs stages 1-7 on my laptop, which is where all the scan outputs below come from.

The pipeline runs on every push to this repo - all 9 stages green, including the GHCR push and the kind deploy: [latest run](https://github.com/Ridaa10394/devops-project/actions/runs/38882230114) · [all runs](https://github.com/Ridaa10394/devops-project/actions).

---

## 10. DevSecOps implementation

Details: [security/README.md](security/README.md). One policy file (`security/gate-policy.toml`) decides what blocks a release; every scanner only reports.

The **first** run of the pipeline failed the gate - 4 fixable HIGH CVEs in the backend image (pip's vendored urllib3/msgpack/setuptools) and 42 in the frontend image (outdated Alpine packages in the nginx base):

![security gate failed](screenshots/18-security-gate-run1-failed.png)

Fixes: uninstall pip from the backend runtime image; `apk upgrade` in the frontend runtime stage. Second run - everything passes:

![security gate passed](screenshots/19-security-gate-passed.png)

![trivy image](screenshots/20-trivy-image.png)

**What Trivy scanned and what the result means:** Trivy scanned both final images - OS packages (Debian 13 / Alpine 3.23) and the Python packages in the venv. After the fixes there are 0 HIGH/CRITICAL findings with an available fix, so the gate passes. The backend still has 44 HIGH in Debian packages with no fix released yet - for example `CVE-2026-9538` in `perl-base` (DoS via a crafted tar header in Perl's Archive::Tar, Debian status `fix_deferred`); the app never runs Perl or unpacks tar files and there's nothing to upgrade to, so it's reported and tracked rather than blocking.

Secret scanning (default rules + a custom rule for Postgres URLs with inline passwords, proven on a scratch file outside the repo):

![gitleaks](screenshots/21-gitleaks.png)

IaC scan (trivy config) - Postgres StatefulSet hardening and the open EKS CIDR were fixed after this scan flagged them; the two remaining findings are accepted and explained in [security/README.md](security/README.md):

![trivy config](screenshots/22-trivy-config-iac.png)

Other controls: non-root + read-only containers, dropped capabilities, seccomp, no secrets in Git (only `.example` files, fake dev Secret, `existingSecret` for prod), `GITHUB_TOKEN` only, least-privilege `permissions:` per job.

---

## 11. Monitoring

Details: [monitoring/README.md](monitoring/README.md). kube-prometheus-stack in `final-monitoring` with `monitoring/prometheus-values.yaml`; the app chart adds a ServiceMonitor, 5 alert rules and the Grafana dashboard (sidecar-loaded).

`/metrics` on the backend (request counters/histograms + my own `stocksense_inventory_changes_total` and `stocksense_low_stock_items`):

![metrics endpoint](screenshots/38-metrics-endpoint.png)

![monitoring install](screenshots/40-monitoring-install.png)

Prometheus picked up the ServiceMonitor; the backend targets are `up` and the StockSense alert rules are loaded:

![prometheus targets cli](screenshots/41-prometheus-targets-cli.png)

Prometheus Targets page during the load test (HPA had scaled to 5 pods - 5/5 UP):

![prometheus targets](screenshots/06-prometheus-targets.png)

Grafana "StockSense - Application Overview" with live data from the load test: ~420 req/s peak, p50/p95/p99 latency, CPU per pod vs the 100m request, HPA replicas 2 -> 5 -> 2:

![grafana dashboard](screenshots/07-grafana-dashboard.png)

---

## 12. GitOps

Details: [gitops/README.md](gitops/README.md). Argo CD 3.5.5 installed with `gitops/argocd-values.yaml`.

- `gitops/argocd-application.yaml` is the real Application: chart `helm/stocksense` from `https://github.com/Ridaa10394/devops-project.git`, auto-sync with prune + self-heal, in its own AppProject.
- I proved the flow live with `gitops/demo-application.yaml`, which points at my already-pushed Session 15 chart in my course repo `Ridaa10394/DevOps`.

![argocd install](screenshots/43-argocd-install.png)

Argo CD synced the chart straight from GitHub (revision `a3e8da0` = current `main`):

![gitops sync](screenshots/44-gitops-sync.png)

Self-heal: I scaled the Deployment to 5 by hand, Argo CD reverted it to the 2 replicas from Git about a second later:

![gitops self heal](screenshots/45-gitops-self-heal.png)

![argocd ui](screenshots/08-argocd-gitops-demo.png)

`gitops/argocd-application.yaml` points at this repo's `helm/stocksense` chart. To promote a build, set `global.imageTag` to a CI commit SHA and apply it:

```bash
kubectl apply -f gitops/argocd-project.yaml -f gitops/argocd-application.yaml
kubectl -n argocd get applications
```

---

## 13. Troubleshooting

Full write-up with broken/fixed YAML and screenshots: **[troubleshooting/README.md](troubleshooting/README.md)**.

| # | What broke | Symptom | Root cause | Fix |
|---|---|---|---|---|
| 1 | backend image tag `1.0.1` | `Init:ImagePullBackOff`, rollout stuck (old pods kept serving) | tag never built/loaded | `rollout undo` + correct tag |
| 2 | frontend Service selector typo | 503 on `/` | Service had no endpoints | fix selector |
| 3 | DB password changed in Secret | new pods stuck in init, `password authentication failed` | Secret != password stored in Postgres | restore Secret, restart |
| 4 | ConfigMap key renamed | `CreateContainerConfigError` | `configMapKeyRef` to a missing key | restore key |
| 5 | Ingress `/api` -> port 8080 | 503 on `/api` | Service only exposes 8000 (the reference chart's bug) | port 8000 |
| 6 | backend `resources` removed | HPA `<unknown>/60%`, `missing request for cpu` | utilisation is a % of the request | restore requests |
| 7 | **real, not planted**: Grafana | restart loop, then the API server stalled | liveness probe shorter than startup; no CPU limit | longer probe delay, CPU limit |

I also documented the bugs I found in the reference TaskBoard project before reusing its structure (Terraform that doesn't parse, Ingress pointing at a wrong Service name/port, hard-coded nginx upstream, `latest` npm deps, root nginx, upper-case GHCR owner):

![reference bugs](screenshots/42-reference-bugs.png)

---

## 14. Screenshots

Browser:

| | |
|---|---|
| App (Docker Compose) | [01-app-docker-compose.png](screenshots/01-app-docker-compose.png) |
| App at phone width | [02-app-mobile.png](screenshots/02-app-mobile.png) |
| Swagger `/docs` | [03-api-swagger-docs.png](screenshots/03-api-swagger-docs.png) |
| App through the Kubernetes Ingress | [04-app-k8s-ingress.png](screenshots/04-app-k8s-ingress.png) |
| Prometheus Targets (5/5 UP) | [06-prometheus-targets.png](screenshots/06-prometheus-targets.png) |
| Grafana dashboard with live data | [07-grafana-dashboard.png](screenshots/07-grafana-dashboard.png) |
| Argo CD application tree | [08-argocd-gitops-demo.png](screenshots/08-argocd-gitops-demo.png) |

Terminal (rendered from `outputs/*.txt`): `screenshots/10-*.png` to `46-*.png` (embedded in the sections above) and `troubleshooting/screenshots/` (embedded in the troubleshooting README).

---

## 15. Lessons learned

- **The symptom is never where the problem is.** A 503 was a label typo; `<unknown>` in the HPA was a missing resource request; a stuck rollout was a password. Events, endpoints and init-container logs found them, not the app logs.
- **Liveness vs readiness matters.** My readiness checks the DB, liveness doesn't - otherwise a DB outage would restart every backend pod for nothing. And a liveness probe that's tighter than real startup time turns "slow" into "never" (Grafana did exactly that to me).
- **`maxUnavailable: 0` saved the app** in three of the scenarios - the new pods were broken, the old ones kept serving.
- **Scanners find things in code you didn't write.** The HIGH CVEs weren't in my dependencies - they were inside pip and the nginx base image. Removing what you don't need at runtime is the best fix.
- **One gate, one policy file** is much easier to reason about than `--exit-code` flags scattered across jobs, and "a missing report = fail" stops a silently-skipped scan from passing.
- **Limits protect neighbours.** One pod without a CPU limit stalled the whole shared cluster's API server.
- **Reference code isn't automatically correct.** The TaskBoard Terraform didn't parse and its Ingress pointed at a Service that didn't exist - running everything for real is the only way to know.
- **GitOps flips the direction.** CI pushes images; the cluster pulls config from Git. Self-heal reverting my manual `kubectl scale` in a second made that click.
- Small practical ones: GHCR needs lower-case names; `*.localhost` saves editing `/etc/hosts`; Docker Hub rate limits are real (I fell back to `mirror.gcr.io` and the classic builder); `envFrom` ignores missing keys but `configMapKeyRef` doesn't.



