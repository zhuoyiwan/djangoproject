#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

from repo_runtime import REPO_ROOT, resolve_python

PYTHON = resolve_python()
RELEVANT_PREFIXES = (
    REPO_ROOT / "backend",
    REPO_ROOT / "docs/api",
    REPO_ROOT / "docs/architecture",
)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    file_path = payload.get("tool_input", {}).get("file_path") or payload.get("tool_response", {}).get("filePath")
    if not file_path:
        return 0

    path = Path(file_path)
    if not any(str(path).startswith(str(prefix)) for prefix in RELEVANT_PREFIXES):
        return 0

    result = subprocess.run(
        [PYTHON, "backend/manage.py", "check"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return 0

    message = (result.stdout + result.stderr).strip()
    print(
        json.dumps(
            {
                "systemMessage": "Backend check failed after edit.",
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": message[-4000:],
                },
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
