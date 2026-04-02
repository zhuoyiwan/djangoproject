#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/Users/zhuoyiwan/Code/django"
LOG_DIR="$REPO_ROOT/.claude/logs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ITERATIONS="${1:-6}"
SLEEP_SECONDS="${CLAUDE_BACKEND_LOOP_SLEEP_SECONDS:-5}"
SESSION_NAME="backend-night-loop-$TIMESTAMP"
LOG_FILE="$LOG_DIR/$SESSION_NAME.log"

mkdir -p "$LOG_DIR"

cd "$REPO_ROOT"

for ((i=1; i<=ITERATIONS; i++)); do
  printf '\n===== iteration %s/%s %s =====\n' "$i" "$ITERATIONS" "$(date -Iseconds)" | tee -a "$LOG_FILE"
  claude -p \
    --permission-mode dontAsk \
    --setting-sources project,local \
    --output-format text \
    --allowedTools "default" \
    --append-system-prompt "You are running in unattended overnight backend mode for /Users/zhuoyiwan/Code/django. Work only on backend Python/Django/API/docs/automation tasks. Follow the repo workflow strictly: after meaningful changes, rely on project hooks to validate, fetch/rebase, commit, push, and create an info-exchange record automatically. Never wait for user confirmation. Do not touch frontend unless strictly required by backend contracts. Stop after one coherent backend increment." \
    "Continue backend roadmap work from the current repository state. Prefer the next unfinished backend milestone in docs/architecture/backend-roadmap.md and keep changes small but complete. Run tests/checks needed for the touched area, update docs/api/openapi.yaml if the contract changes, then stop." \
    2>&1 | tee -a "$LOG_FILE"

  if (( i < ITERATIONS )); then
    sleep "$SLEEP_SECONDS"
  fi
done

echo "Loop complete. Log: $LOG_FILE" | tee -a "$LOG_FILE"
