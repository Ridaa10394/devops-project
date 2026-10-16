#!/usr/bin/env bash
# Generate CPU load on the backend so the HPA has something to react to.
# Runs INSIDE the cluster (a throwaway curl pod), so the laptop's port-forward
# is not the bottleneck.
#
#   ./scripts/load-test.sh                         # 6 workers for 180s against the raw-manifest service
#   NS=final-app TARGET=http://stocksense-backend:8000/api/items/stats WORKERS=8 DURATION=240 ./scripts/load-test.sh
#
# Watch it in another terminal:  kubectl -n final-app get hpa -w
set -euo pipefail
NS="${NS:-final-app}"
TARGET="${TARGET:-http://stocksense-backend:8000/api/items/stats}"
WORKERS="${WORKERS:-6}"
DURATION="${DURATION:-180}"
IMAGE="${IMAGE:-curlimages/curl:8.6.0}"

echo "load: $WORKERS workers -> $TARGET for ${DURATION}s (namespace $NS)"
kubectl -n "$NS" delete pod stocksense-load --ignore-not-found --wait=true >/dev/null
kubectl -n "$NS" run stocksense-load --image="$IMAGE" --image-pull-policy=IfNotPresent --restart=Never \
  --labels=app=stocksense-load \
  --overrides='{"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":100,"seccompProfile":{"type":"RuntimeDefault"}}}}' \
  --command -- sh -c "
    end=\$((\$(date +%s) + $DURATION))
    for w in \$(seq 1 $WORKERS); do
      ( n=0; while [ \$(date +%s) -lt \$end ]; do curl -s -o /dev/null $TARGET; n=\$((n+1)); done; echo worker \$w sent \$n requests ) &
    done
    wait; echo load finished"
kubectl -n "$NS" wait --for=condition=Ready pod/stocksense-load --timeout=60s >/dev/null || true
echo "running... (kubectl -n $NS logs -f stocksense-load to follow, it deletes itself only when you delete it)"
