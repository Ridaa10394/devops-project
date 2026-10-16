# GitOps - Argo CD

Name: Ridaa Mirza
Enrollment No: 24BCS10394

| File | What |
|---|---|
| `argocd-values.yaml` | lean Argo CD install for minikube (no Dex/notifications, resource limits) |
| `argocd-project.yaml` | AppProject `final-project`: only my repo, only the `stocksense` namespace |
| `argocd-application.yaml` | **the real one**: Helm chart `helm/stocksense` from `https://github.com/Ridaa10394/devops-project.git` (main), auto-sync + prune + self-heal |
| `demo-application.yaml` | live demo I ran before this repo was pushed: my Session 15 chart (`14-helm/my-web-chart`) from my course repo `Ridaa10394/DevOps` |

How it splits the work with CI: GitHub Actions builds, scans and pushes `ghcr.io/ridaa10394/stocksense-*:<sha>`. Argo CD *pulls* the desired state from Git and makes the cluster match it - nobody runs `helm upgrade` against the cluster by hand, and the cluster never needs to be reachable from GitHub. Promoting a build = changing `global.imageTag` in `argocd-application.yaml` (PR -> merge -> Argo syncs).

## Install

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm upgrade --install argocd argo/argo-cd --version 10.10.3 -n argocd --create-namespace \
  -f gitops/argocd-values.yaml --wait --timeout 15m
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
kubectl -n argocd port-forward svc/argocd-server 18080:80        # http://localhost:18080
```

![argocd install](../screenshots/43-argocd-install.png)

## Live demo: sync from my public repo + self-heal

![gitops sync](../screenshots/44-gitops-sync.png)

The synced revision `a3e8da0` is exactly what `git ls-remote` says `main` is on GitHub.

Then I scaled the Deployment to 5 by hand. Argo CD noticed the drift (`Synced -> OutOfSync`) and put it back to the 2 replicas that Git says, within about a second:

![gitops self heal](../screenshots/45-gitops-self-heal.png)

![argocd ui](../screenshots/08-argocd-gitops-demo.png)

## The real Application (needs the push)

Applying `argocd-application.yaml` now gives exactly the error you'd expect, because the project wasn't on GitHub yet when I ran it (the error still shows its old location inside my course repo):

![real app pending push](../screenshots/46-gitops-real-app-pending-push.png)

> TODO (after you push): replace `REPLACE_WITH_GIT_SHA_FROM_CI` in `argocd-application.yaml` with the SHA of a green pipeline run (the tag CI pushed to GHCR), make the two GHCR packages public (GitHub -> Packages -> stocksense-backend / stocksense-frontend -> Package settings -> Change visibility) or add an imagePullSecret, then
> ```bash
> kubectl apply -f gitops/argocd-project.yaml -f gitops/argocd-application.yaml
> kubectl -n argocd get applications          # screenshot: stocksense  Synced  Healthy
> ```
> Screenshot the Argo CD UI tree for `stocksense`.
