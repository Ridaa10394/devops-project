# Kubernetes - raw manifests

Name: Ridaa Mirza
Enrollment No: 24BCS10394

Plain YAML for everything, applied with kustomize. The Helm chart in `../helm/stocksense` renders the same objects (with templated names/values) - these files are what I learned on and what the troubleshooting challenge breaks.

| File | Objects |
|---|---|
| `00-namespace.yaml` | Namespace `final-app` (this is the "k8s/namespace.yaml" from the rubric) |
| `01-configmap.yaml` | `stocksense-config`: APP_ENV, DB_HOST, DB_PORT, DB_NAME, BACKEND_URL |
| `02-secret.yaml` | `stocksense-db`: DB_USER / DB_PASSWORD - **dev-only fake values**, real envs create it out-of-band |
| `03-postgres.yaml` | headless Service + StatefulSet, PVC from `volumeClaimTemplates` (1Gi), runs as UID 70, read-only root fs, `pg_isready` probes |
| `04-backend.yaml` | Deployment (2 replicas, `maxUnavailable: 0`), `migrate` initContainer, startup/readiness/liveness probes, requests+limits, non-root + read-only root fs; ClusterIP Service :8000 |
| `05-frontend.yaml` | Deployment (2 replicas), `/healthz` probes, `BACKEND_URL` from the ConfigMap; ClusterIP Service :80 -> 8080 |
| `06-ingress.yaml` | `stocksense.localhost`: `/api` -> backend:8000, `/` -> frontend:80 (ingress-nginx) |
| `07-hpa.yaml` | HPA backend 2-5 @ 60% CPU, frontend 2-4 @ 70% CPU |

## Deploy on minikube

```bash
# images are built locally, then copied into the minikube node (no registry needed)
docker build -t stocksense-backend:1.0.0  application/backend
docker build -t stocksense-frontend:1.0.0 application/frontend
minikube image load stocksense-backend:1.0.0
minikube image load stocksense-frontend:1.0.0

kubectl apply -k kubernetes/
kubectl -n final-app rollout status deploy/stocksense-backend

# reach the Ingress from the Mac (docker driver = no direct route to the node IP)
kubectl -n ingress-nginx port-forward svc/ingress-nginx-controller 18210:80
curl http://stocksense.localhost:18210/api/items/stats
```

`*.localhost` resolves to 127.0.0.1 by itself in curl and browsers, so no `/etc/hosts` edit.

## Probes - why three different ones

- **startupProbe** `/health` every 3s, up to 60s: gives the first start time without the liveness probe killing it.
- **readinessProbe** `/ready`: runs `SELECT 1` against Postgres. DB down -> pod leaves the Service, but is *not* restarted (restarting wouldn't fix the DB).
- **livenessProbe** `/health`: no DB call, only "is the process alive". If liveness checked the DB, a DB outage would restart every backend pod in a loop.

## Migrations

The `migrate` initContainer runs `python -m app.wait_for_db && alembic upgrade head` before uvicorn starts. With 2 replicas both init containers run at the same time, so `alembic/env.py` takes a Postgres advisory lock (`pg_advisory_lock`) - the second one waits, then sees the DB is already at head. You can see this in `../outputs/k8s-raw-verify.txt`: both pods log `database reachable`, only one logs `Running upgrade ...`.

Proof: `../outputs/k8s-raw-apply.txt`, `../outputs/k8s-raw-verify.txt` (every object, endpoints, PVC Bound, ConfigMap, Secret with the password redacted, probes, init logs, ingress curl incl. a POST, HPA `cpu: 3%/60%`).

## Terminal screenshots

![minikube image load](../screenshots/26-minikube-image-load.png)

![kubectl apply](../screenshots/27-k8s-raw-apply.png)

![get all](../screenshots/28-k8s-raw-get-all.png)

![probes and migrate](../screenshots/29-k8s-probes-migrate.png)

![pvc db configmap](../screenshots/30-k8s-pvc-db-configmap.png)

![ingress curl](../screenshots/31-k8s-ingress-curl.png)

![hpa top](../screenshots/32-k8s-hpa-top.png)
