# syntax=docker/dockerfile:1
# Resgrid Omni web image for one variant (omni-plan §6.4, §6.6.4 stage 2). Runtime only: the web app is NOT built here.
# CI exports each variant once (`APP_VARIANT=<v> npx expo export -p web --output-dir dist/<v>` in apps/omni) and this
# image copies that export into nginx. There are no RUN steps, so amd64 and arm64 images build in seconds without
# emulating a compile.
#
#   docker buildx build -f docker/Dockerfile --build-arg APP_VARIANT=unit \
#     --platform linux/amd64,linux/arm64 -t resgridllc/unit:8.12 .
#
# Build context: the repository root (apps/omni/dist/<variant> and docker/). Runtime configuration: see docker/README.md.

# Pin by digest in CI for reproducible images, e.g. --build-arg NGINX_IMAGE=nginx:alpine@sha256:...
ARG NGINX_IMAGE=nginx:alpine
FROM ${NGINX_IMAGE}

# responder | unit | ic | dispatch | bigboard
ARG APP_VARIANT
# Legacy runtime env prefix (RESPOND_, UNIT_, IC_, DISPATCH_, BIGBOARD_); derived from APP_VARIANT when empty.
ARG LEGACY_ENV_PREFIX=""
ARG APP_VERSION=""

LABEL org.opencontainers.image.title="Resgrid ${APP_VARIANT}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.vendor="Resgrid, LLC" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/Resgrid/Omni"

ENV RESGRID_APP_VARIANT="${APP_VARIANT}" \
    LEGACY_ENV_PREFIX="${LEGACY_ENV_PREFIX}"

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/ /etc/nginx/resgrid/
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/resgrid-entrypoint.sh

# index.html first: with APP_VARIANT unset this path does not exist and the build fails, instead of copying every export.
COPY apps/omni/dist/${APP_VARIANT}/index.html /usr/share/nginx/html/index.html
COPY apps/omni/dist/${APP_VARIANT}/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

ENTRYPOINT ["/usr/local/bin/resgrid-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
