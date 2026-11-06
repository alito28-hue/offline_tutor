#!/bin/bash
# Amara, the offline tutor. Usage:
#   ./run.sh               start the tutor and open it full screen
#   ./run.sh --no-browser  start the tutor only
#   ./run.sh --test        fast tests: guardrails, citations, sandbox, network monitor
#   ./run.sh --test-all    the above, plus the real models inside the sandbox
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(dirname "$HERE")"
PORT="${TUTOR_PORT:-8788}"
URL="http://127.0.0.1:$PORT"
MODELS="${TUTOR_MODEL_DIR:-$HOME/.qvac/models}"

fail() { echo "ERROR: $1" >&2; exit 1; }

[[ "$(uname -s)" == Darwin ]] || fail "this prototype needs macOS (it uses sandbox-exec)."
command -v node >/dev/null || fail "Node.js is not installed (needs ^22.21 or >=24.9)."
[[ -d "$ROOT/node_modules/@qvac/sdk" ]] || fail "run 'npm ci' in $ROOT once, with internet."
case "$HERE" in
  *CloudStorage*|*/Dropbox/*|*"/Library/Mobile Documents/"*)
    echo "WARNING: this folder syncs to the cloud, so files may be missing when offline. Keep it on local disk." >&2 ;;
esac

cd "$ROOT"
case "${1:-}" in
  --test) exec node --test tutor/test/unit.test.mjs tutor/test/net.test.mjs ;;
  --test-all) exec node --test --test-concurrency=1 tutor/test/unit.test.mjs tutor/test/net.test.mjs tutor/test/integration.test.mjs ;;
  ""|--no-browser) ;;
  *) fail "unknown option: $1" ;;
esac

ls "$MODELS"/*Qwen3-4B-Q4_K_M*.gguf >/dev/null 2>&1 || fail "the Qwen3 4B model is missing in $MODELS."
ls "$MODELS"/*embeddinggemma-300M-Q8_0*.gguf >/dev/null 2>&1 || fail "the EmbeddingGemma model is missing in $MODELS."
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then fail "port $PORT is in use. Is the tutor already running?"; fi

node "$HERE/supervisor.mjs" &
SUP=$!
trap 'kill "$SUP" 2>/dev/null || true; wait "$SUP" 2>/dev/null || true' EXIT INT TERM

echo "Loading the models…"
ready=""
for _ in $(seq 1 180); do
  kill -0 "$SUP" 2>/dev/null || fail "the tutor stopped while starting."
  if curl -s -m 2 "$URL/api/status" | grep -q '"ready":true'; then ready=1; break; fi
  /bin/sleep 1
done
[[ -n "$ready" ]] || fail "the tutor did not start in time."

if [[ "${1:-}" != "--no-browser" ]]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if [[ -x "$CHROME" ]]; then
    PROFILE="$HERE/.run/chrome-profile"
    mkdir -p "$PROFILE"
    # A separate profile with background services off: no extensions, sync or update checks during the recording.
    "$CHROME" --user-data-dir="$PROFILE" --app="$URL" --start-fullscreen --no-first-run --no-default-browser-check \
      --disable-background-networking --disable-sync --disable-component-update --disable-extensions >/dev/null 2>&1 &
  else
    open "$URL"
    echo "Press Control-Command-F for full screen."
  fi
fi

echo "Tutor ready: $URL (Ctrl-C to stop)"
wait "$SUP"
