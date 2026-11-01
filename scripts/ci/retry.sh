#!/usr/bin/env bash
# Retry wrapper for network-bound CI steps (omni-plan §6.6.2 principle 6): installs, downloads,
# uploads, eas update/submit. Not for long compiles — a real build failure should fail fast.
#
# Usage: bash scripts/ci/retry.sh <attempts> <delay-seconds> <command> [args...]
# The delay doubles after each failed attempt.
set -uo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: retry.sh <attempts> <delay-seconds> <command> [args...]" >&2
  exit 2
fi

attempts="$1"
delay="$2"
shift 2

n=1
while true; do
  "$@"
  status=$?
  if [ "$status" -eq 0 ]; then
    exit 0
  fi
  if [ "$n" -ge "$attempts" ]; then
    echo "::error::Command failed after ${n} attempt(s) (exit ${status}): $1" >&2
    exit "$status"
  fi
  echo "::warning::Attempt ${n}/${attempts} failed (exit ${status}); retrying in ${delay}s: $1" >&2
  sleep "$delay"
  n=$((n + 1))
  delay=$((delay * 2))
done
