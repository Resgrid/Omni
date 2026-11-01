# Resgrid Omni web image

One Dockerfile serves the web edition of any of the five apps (Responder, Unit, IC, Dispatch, BigBoard). The image holds nginx and the variant's prebuilt web export, nothing else. The app is never built inside Docker: CI exports each variant once and both this image and the desktop installers reuse that export (omni-plan §6.4 and §6.6.4).

| Variant   | Image                  | Legacy env prefix |
| --------- | ---------------------- | ----------------- |
| responder | `resgridllc/responder` | `RESPOND_`        |
| unit      | `resgridllc/unit`      | `UNIT_`           |
| ic        | `resgridllc/ic`        | `IC_`             |
| dispatch  | `resgridllc/dispatch`  | `DISPATCH_`       |
| bigboard  | `resgridllc/bigboard`  | `BIGBOARD_`       |

## Run

```bash
docker run -d --name resgrid-unit -p 8080:80 \
  -e BASE_API_URL="https://api.example.com" \
  resgridllc/unit:latest
```

Existing deployments keep working with the legacy names:

```bash
docker run -d --name resgrid-unit -p 8080:80 \
  -e UNIT_BASE_API_URL="https://api.example.com" \
  -e UNIT_APP_KEY="your-app-key" \
  resgridllc/unit:latest
```

Docker Compose:

```yaml
services:
  dispatch:
    image: resgridllc/dispatch:latest
    ports:
      - '8080:80'
    environment:
      BASE_API_URL: https://api.example.com
      SENTRY_DSN: https://key@sentry.example.com/1
    restart: unless-stopped
```

Health check: `GET /health` returns `200 healthy`. The image also declares a Docker `HEALTHCHECK` against that endpoint.

## Runtime configuration

When the container starts, the entrypoint writes `/env-config.js`, which sets `window.__ENV__`. The app **merges** these values over the configuration it was built with, so you only set what differs. A variable you leave unset keeps the build-time value. Production images are exported with production defaults.

Each variable is read from its plain name first, then from the variant's legacy prefix (for example `UNIT_BASE_API_URL`):

| Variable                | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `BASE_API_URL`          | Resgrid API host over https, for example `https://api.resgrid.com`   |
| `API_VERSION`           | API version, `v4`                                                    |
| `RESGRID_API_URL`       | API path, `/api/v4`                                                  |
| `CHANNEL_HUB_NAME`      | SignalR eventing hub (`eventingHub`)                                 |
| `REALTIME_GEO_HUB_NAME` | SignalR geolocation hub (`geolocationHub`)                           |
| `CHAT_HUB_NAME`         | SignalR chat hub (`chatHub`)                                         |
| `LOGGING_KEY`           | Logging key                                                          |
| `APP_KEY`               | Application key                                                      |
| `SENTRY_DSN`            | Sentry DSN for this app's own Sentry project                         |
| `COUNTLY_APP_KEY`       | Countly app key                                                      |
| `COUNTLY_SERVER_URL`    | Countly server (`COUNTLY_URL` / `RESPOND_COUNTLY_URL` also accepted) |

Other settings:

| Variable                  | Purpose                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LEGACY_ENV_PREFIX`       | Override the legacy prefix (default from the image's variant)                                                                                               |
| `CONTENT_SECURITY_POLICY` | Replace nginx's Content-Security-Policy, for example to pin `connect-src` to your API host. Must not contain double quotes, backslashes, `$` or line breaks |

The legacy-only settings `*_NAME`, `*_SCHEME`, `*_BUNDLE_ID`, `*_PACKAGE`, `*_VERSION` and `*_MAPBOX_PUBKEY` are no longer read. Identity comes from the image, and maps go through the Resgrid server.

To see what a container would generate without starting nginx:

```bash
docker run --rm -e UNIT_BASE_API_URL=https://api.example.com resgridllc/unit:latest --print-env-config
```

## Passkeys and app links

To let the mobile apps use passkeys or app links with this host, mount the association files:

```bash
docker run -d -p 8080:80 \
  -v "$PWD/apple-app-site-association:/usr/share/nginx/html/.well-known/apple-app-site-association:ro" \
  -v "$PWD/assetlinks.json:/usr/share/nginx/html/.well-known/assetlinks.json:ro" \
  resgridllc/unit:latest
```

They are served as JSON. When they are absent, these paths return 404 and never `index.html`.

## What nginx does

- `index.html`, other HTML and `env-config.js` are sent with `no-store`, so a redeploy or an env change applies on the next reload.
- Content-hashed bundles under `/_expo/static/` and `/assets/` are cached for a year (`immutable`). Unhashed root files are cached for an hour.
- Client-side routes fall back to `index.html`. A missing asset with an extension returns 404, not HTML.
- Hidden files (`/.env`, `/.git`, …) are denied, except the two association files above.
- Every response carries `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and the CSP.
- TLS terminates at your reverse proxy or load balancer. The container listens on port 80.

## Build

CI does this in the release workflow. To build locally, export the variant first, then build from the repository root:

```bash
cd apps/omni && APP_VARIANT=unit APP_ENV=production npx expo export -p web --output-dir dist/unit && cd ../..
docker buildx build -f docker/Dockerfile --build-arg APP_VARIANT=unit --build-arg APP_VERSION=8.12 \
  --platform linux/amd64,linux/arm64 -t resgridllc/unit:8.12 .
```

The Dockerfile has no `RUN` steps, so multi-arch builds need no emulation. Pin the base image by digest with `--build-arg NGINX_IMAGE=nginx:alpine@sha256:…` for reproducible images. `docker/Dockerfile.dockerignore` limits the build context to `apps/omni/dist/` and `docker/`.
