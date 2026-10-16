# ---------- stage 1: build the React app with Node ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

# ---------- stage 2: serve the static files with unprivileged nginx ----------
# nginx-unprivileged runs as UID 101 and listens on 8080 (no root needed for port 80)
FROM nginxinc/nginx-unprivileged:1.29-alpine
LABEL org.opencontainers.image.title="stocksense-frontend" \
      org.opencontainers.image.authors="Ridaa Mirza <24BCS10394>"
# Security fix found by trivy: the base image lags behind Alpine security
# releases (curl, libcrypto3, c-ares...). Pull the patched packages in at build time.
USER root
RUN apk upgrade --no-cache
ENV BACKEND_URL=http://backend:8000 \
    NGINX_ENVSUBST_FILTER=BACKEND_URL
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
