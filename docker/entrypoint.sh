#!/bin/sh
# Resgrid Omni web image entrypoint (omni-plan §6.4). At container start it writes env-config.js, which sets
# window.__ENV__ from the container environment; the app merges those values over the env it was built with, so only
# the variables you set are overridden.
#
# Each value is read from the unprefixed name first (BASE_API_URL, ...) and then from the variant's legacy prefix
# (RESPOND_, UNIT_, IC_, DISPATCH_, BIGBOARD_ — e.g. UNIT_BASE_API_URL), so existing deployments keep working.
# The prefix comes from LEGACY_ENV_PREFIX, else from RESGRID_APP_VARIANT (set by the image).
#
# Also: injects <script src="/env-config.js"> into the exported HTML when missing, and replaces nginx's CSP when
# CONTENT_SECURITY_POLICY is set. Then runs the command (nginx).
#
#   resgrid-entrypoint.sh --print-env-config   print the generated env-config.js and exit (writes nothing)
#
# Paths can be overridden for tests: HTML_DIR, ENV_CONFIG_FILE, NGINX_CSP_FILE.
set -eu

HTML_DIR="${HTML_DIR:-/usr/share/nginx/html}"
ENV_CONFIG_FILE="${ENV_CONFIG_FILE:-$HTML_DIR/env-config.js}"
NGINX_CSP_FILE="${NGINX_CSP_FILE:-/etc/nginx/resgrid/csp.conf}"

# Keep in sync with CLIENT_ENV_DEFAULTS in packages/config-plugins/src/client-env.js (a desktop test checks it).
ENV_KEYS="BASE_API_URL API_VERSION RESGRID_API_URL CHANNEL_HUB_NAME REALTIME_GEO_HUB_NAME CHAT_HUB_NAME LOGGING_KEY APP_KEY SENTRY_DSN COUNTLY_APP_KEY COUNTLY_SERVER_URL"

TAB="$(printf '\t')"
CR="$(printf '\r')"
NL='
'

log() {
  printf '%s\n' "resgrid-entrypoint: $*" >&2
}

# Legacy prefix per variant (apps/omni/variants/<v>/variant.json identity.web.legacyEnvPrefix; a desktop test checks it).
legacy_prefix_for() {
  case "$1" in
    responder) printf '%s' 'RESPOND_' ;;
    unit) printf '%s' 'UNIT_' ;;
    ic) printf '%s' 'IC_' ;;
    dispatch) printf '%s' 'DISPATCH_' ;;
    bigboard) printf '%s' 'BIGBOARD_' ;;
    *) printf '%s' '' ;;
  esac
}

PREFIX="${LEGACY_ENV_PREFIX:-}"
if [ -z "$PREFIX" ]; then
  PREFIX="$(legacy_prefix_for "${RESGRID_APP_VARIANT:-}")"
fi
case "$PREFIX" in
  '') ;;
  *[!A-Z0-9_]* | [!A-Z]* | *[!_])
    log "LEGACY_ENV_PREFIX must look like UNIT_ (capitals, digits, underscores, ending in _); got '$PREFIX'"
    exit 64
    ;;
esac

# The value of the variable named $1 (empty when unset). Names come only from ENV_KEYS and the validated prefix, and the
# value itself is never re-evaluated.
read_var() {
  eval "printf '%s' \"\${$1:-}\""
}

resolve() {
  value="$(read_var "$1")"
  if [ -z "$value" ] && [ -n "$PREFIX" ]; then
    value="$(read_var "$PREFIX$1")"
  fi
  # Responder historically used COUNTLY_URL.
  if [ -z "$value" ] && [ "$1" = 'COUNTLY_SERVER_URL' ]; then
    value="$(read_var COUNTLY_URL)"
    if [ -z "$value" ] && [ -n "$PREFIX" ]; then
      value="$(read_var "${PREFIX}COUNTLY_URL")"
    fi
  fi
  printf '%s' "$value"
}

# JSON string body for $1: backslash and quote escaped, tab/CR/newline as \t \r \n, other control characters dropped.
json_escape() {
  printf '%s' "$1" |
    tr -d '\000-\010\013\014\016-\037\177' |
    sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e "s/$TAB/\\\\t/g" -e "s/$CR/\\\\r/g" |
    awk 'NR > 1 { printf "%s", "\\n" } { printf "%s", $0 }'
}

render_env_config() {
  printf '%s\n' '// Generated at container start by docker/entrypoint.sh. Merged over the build-time env by the app.'
  printf '%s\n' 'window.__ENV__ = Object.assign({}, window.__ENV__, {'
  first=1
  for key in $ENV_KEYS; do
    value="$(resolve "$key")"
    if [ -z "$value" ]; then
      continue
    fi
    if [ "$first" -eq 0 ]; then
      printf '%s\n' ','
    fi
    first=0
    printf '  "%s": "%s"' "$key" "$(json_escape "$value")"
  done
  if [ "$first" -eq 0 ]; then
    printf '\n'
  fi
  printf '%s\n' '});'
}

write_env_config() {
  tmp="$ENV_CONFIG_FILE.tmp.$$"
  render_env_config >"$tmp"
  chmod 0644 "$tmp"
  mv -f "$tmp" "$ENV_CONFIG_FILE"
  log "wrote $ENV_CONFIG_FILE (legacy prefix: ${PREFIX:-none})"
}

# Adds the env-config.js script as the first element of <head> in every exported HTML file that lacks it, so it runs
# before the app bundle.
inject_script_tag() {
  find "$HTML_DIR" -type f -name '*.html' | while IFS= read -r file; do
    if grep -q 'src="/env-config.js"' "$file"; then
      continue
    fi
    tmp="$file.tmp.$$"
    sed 's|<head\([^>]*\)>|<head\1><script src="/env-config.js"></script>|' "$file" >"$tmp"
    chmod 0644 "$tmp"
    mv -f "$tmp" "$file"
  done
}

write_csp_override() {
  if [ -z "${CONTENT_SECURITY_POLICY:-}" ]; then
    return 0
  fi
  case "$CONTENT_SECURITY_POLICY" in
    *'"'* | *'\'* | *'$'* | *"$NL"* | *"$CR"*)
      log 'CONTENT_SECURITY_POLICY must not contain double quotes, backslashes, $ or line breaks'
      exit 64
      ;;
  esac
  printf 'add_header Content-Security-Policy "%s" always;\n' "$CONTENT_SECURITY_POLICY" >"$NGINX_CSP_FILE"
  log "using CONTENT_SECURITY_POLICY for nginx"
}

if [ "${1:-}" = '--print-env-config' ]; then
  render_env_config
  exit 0
fi

if [ ! -f "$HTML_DIR/index.html" ]; then
  log "index.html not found in $HTML_DIR"
  exit 1
fi

write_env_config
inject_script_tag
write_csp_override

if [ "$#" -gt 0 ]; then
  exec "$@"
fi
