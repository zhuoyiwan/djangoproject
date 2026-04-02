#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

REPO_ROOT = Path("/Users/zhuoyiwan/Code/django")
NEXT_TASK_FILE = REPO_ROOT / ".claude/next_backend_task.md"


def run(cmd):
    result = subprocess.run(cmd, cwd=REPO_ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError((result.stdout + result.stderr).strip())
    return result.stdout.strip()


def main() -> int:
    status = run(["git", "-C", str(REPO_ROOT), "status", "--short"])
    changed_files = [line[3:] for line in status.splitlines() if line.strip()]
    latest_commit = run(["git", "-C", str(REPO_ROOT), "log", "-1", "--pretty=%h %s"])
    changed_text = "\n".join(f"- {path}" for path in changed_files) if changed_files else "- none"

    content = f"""# Next backend session task

Read this file first in unattended backend sessions.

## Task

Start by reading `docs/architecture/backend-roadmap.md` and continue with the next unfinished backend milestone after the work represented by commit `{latest_commit}`.
Use the latest repo state plus the changed areas below to pick the smallest complete backend increment.

## Changed context from previous session

{changed_text}

## Constraints

- Backend only
- Keep changes small but complete
- Follow repository workflow strictly
- Update `docs/api/openapi.yaml` if the API contract changes
- Stop after one coherent increment
"""
    NEXT_TASK_FILE.write_text(content, encoding="utf-8")
    print(json.dumps({"ok": True, "nextTaskFile": str(NEXT_TASK_FILE)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
