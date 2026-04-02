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
  TASK_PROMPT="$(cat \"$REPO_ROOT/.claude/next_backend_task.md\")"
  claude -p \
    --permission-mode dontAsk \
    --setting-sources project,local \
    --output-format text \
    --allowedTools "default" \
    --append-system-prompt "You are running in unattended overnight backend mode for /Users/zhuoyiwan/Code/django. Work only on backend Python/Django/API/docs/automation tasks. Follow the repo workflow strictly: after meaningful changes, rely on project hooks to validate, fetch/rebase, commit, push, and create an info-exchange record automatically. Before you start implementation, read .claude/next_backend_task.md and treat it as the handoff from the previous session. At the end of the session, leave the next session in a better position. Never wait for user confirmation. Do not touch frontend unless strictly required by backend contracts. Stop after one coherent backend increment." \
    "$TASK_PROMPT

Execute the handoff above first. If it is still generic, read docs/architecture/backend-roadmap.md and pick the next unfinished backend milestone. Keep the increment small but complete. Run tests/checks needed for the touched area, update docs/api/openapi.yaml if the contract changes, then stop." \
    2>&1 | tee -a "$LOG_FILE"

  if (( i < ITERATIONS )); then
    sleep "$SLEEP_SECONDS"
  fi
done

echo "Loop complete. Log: $LOG_FILE" | tee -a "$LOG_FILE"
