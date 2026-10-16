# ---------- stage 1: build a virtualenv with all runtime deps ----------
FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt \
 && pip uninstall -y pip   # pip is not needed at runtime (and its vendored urllib3/msgpack had HIGH CVEs)

# ---------- stage 2: slim runtime, no compilers, no pip cache ----------
FROM python:3.12-slim
LABEL org.opencontainers.image.title="stocksense-backend" \
      org.opencontainers.image.description="StockSense inventory API (FastAPI)" \
      org.opencontainers.image.authors="Ridaa Mirza <24BCS10394>"
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"
WORKDIR /app
# Security fix found by trivy: pip ships vendored urllib3/msgpack/setuptools with
# HIGH CVEs. Nothing installs packages at runtime, so remove pip from the base image.
RUN python -m pip uninstall -y pip \
 && useradd --create-home --uid 10001 --shell /usr/sbin/nologin appuser
COPY --from=builder /opt/venv /opt/venv
COPY --chown=10001:10001 alembic.ini docker-entrypoint.sh ./
COPY --chown=10001:10001 alembic ./alembic
COPY --chown=10001:10001 app ./app
# numeric UID so Kubernetes runAsNonRoot can verify it
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"
ENTRYPOINT ["./docker-entrypoint.sh"]
