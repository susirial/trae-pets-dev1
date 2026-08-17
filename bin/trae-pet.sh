#!/usr/bin/env bash
# Cross-platform (macOS/Linux) launcher for the TRAE pet hook CLI.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"

NODE=""

is_supported_node() {
  local candidate="$1" version major minor patch
  [[ "$candidate" = /* && -f "$candidate" && -x "$candidate" ]] || return 1
  version="$("$candidate" -p "process.versions.node" 2>/dev/null)" || return 1
  [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || return 1
  major="${BASH_REMATCH[1]}"
  minor="${BASH_REMATCH[2]}"
  patch="${BASH_REMATCH[3]}"
  if (( major == 24 )); then
    :
  elif (( major == 22 && (minor > 12 || (minor == 12 && patch >= 0)) )); then
    :
  else
    return 1
  fi
  NODE="$candidate"
}

try_node() {
  [[ -n "${1:-}" && -z "$NODE" ]] && is_supported_node "$1" || true
}

try_node "${TRAE_PET_NODE:-}"

NODE_RECORD="$ROOT/node-path.json"
if [[ -z "$NODE" && -f "$NODE_RECORD" ]]; then
  RECORDED_NODE="$(awk -F'"' '/^[[:space:]]*"execPath"[[:space:]]*:/ { print $4; exit }' "$NODE_RECORD")"
  try_node "$RECORDED_NODE"
fi

if [[ -z "$NODE" ]] && command -v node >/dev/null 2>&1; then
  try_node "$(command -v node)"
fi
try_node "/opt/homebrew/bin/node"
try_node "/usr/local/bin/node"
try_node "/usr/bin/node"

if [[ -z "$NODE" ]]; then
  echo "[trae-pet] No supported Node runtime found. Install Node 22/24 LTS, then rerun: trae-pet install-hooks" >&2
  exit 1
fi

exec "$NODE" "$DIR/trae-pet.js" "$@"
