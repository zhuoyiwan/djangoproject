#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from datetime import datetime, UTC
from pathlib import Path

REPO_ROOT = Path("/Users/zhuoyiwan/Code/django")
PYTHON = REPO_ROOT / ".venv/bin/python"
INFO_CLIENT = REPO_ROOT / "info-exchange-api/scripts/info_client.py"
DRY_RUN = os.environ.get("CLAUDE_AUTOFLOW_DRY_RUN") == "1"
EXCLUDED_PREFIXES = (
    ".env",
    ".info.config",
    ".claude/settings.local.json",
)
EXCLUDED_EXACT = {
    ".claude/bin/.keep",
}


def run(cmd, check=True, capture_output=True):
    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        text=True,
        capture_output=capture_output,
    )
    if check and result.returncode != 0:
        raise RuntimeError((result.stdout + result.stderr).strip() or f"command failed: {' '.join(cmd)}")
    return result


def git(*args, check=True):
    return run(["git", "-C", str(REPO_ROOT), *args], check=check)


def status_entries():
    output = git("status", "--porcelain").stdout.splitlines()
    entries = []
    for line in output:
        if not line:
            continue
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        entries.append((line[:2], path))
    return entries


def is_committable(path: str) -> bool:
    if path in EXCLUDED_EXACT:
        return False
    return not any(path == prefix or path.startswith(prefix + "/") for prefix in EXCLUDED_PREFIXES)


def choose_commit_subject(paths):
    if any(path.startswith("backend/automation/") for path in paths):
        return "Update automation backend workflow."
    if any(path.startswith("backend/cmdb/") for path in paths):
        return "Update CMDB backend APIs."
    if any(path.startswith("backend/accounts/") for path in paths):
        return "Update backend authentication flows."
    if any(path.startswith("backend/audit/") for path in paths):
        return "Update backend audit behavior."
    if any(path.startswith("docs/api/") or path.startswith("docs/architecture/") for path in paths):
        return "Update backend API contracts."
    return "Update backend implementation."


def print_json(message, continue_value=True, stop_reason=None):
    payload = {"systemMessage": message, "continue": continue_value}
    if stop_reason:
        payload["stopReason"] = stop_reason
    print(json.dumps(payload, ensure_ascii=False))


def main() -> int:
    try:
        changed_before = [path for _, path in status_entries()]
        committable_before = [path for path in changed_before if is_committable(path)]
        if not committable_before:
            print_json("Autoflow: no committable backend changes.")
            return 0

        branch = git("branch", "--show-current").stdout.strip()
        upstream = git("rev-parse", "--abbrev-ref", "@{upstream}", check=False).stdout.strip()

        if DRY_RUN:
            print_json(f"Autoflow dry run: would process {len(committable_before)} files on {branch}.")
            return 0

        git("fetch", "--prune", "origin")
        if upstream:
            git("pull", "--rebase", "--autostash", "origin", branch)

        run([str(PYTHON), "backend/manage.py", "check"])
        run([str(PYTHON), "backend/manage.py", "test", "accounts", "cmdb", "audit", "automation"])
        run([str(PYTHON), "backend/manage.py", "spectacular", "--file", "docs/api/openapi.yaml"])

        changed_after = [path for _, path in status_entries()]
        committable_after = [path for path in changed_after if is_committable(path)]
        if not committable_after:
            print_json("Autoflow: nothing left to commit after validation.")
            return 0

        git("add", "--", *committable_after)
        if not git("diff", "--cached", "--quiet", check=False).returncode:
            print_json("Autoflow: no staged changes after git add.")
            return 0

        diff_summary = git("diff", "--cached", "--stat").stdout.strip()
        subject = choose_commit_subject(committable_after)
        body = "Automated backend iteration with validation, git sync, push, and info-exchange reporting."
        commit_message = f"{subject}\n\n{body}\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
        git("commit", "-m", commit_message)

        commit_hash = git("rev-parse", "HEAD").stdout.strip()
        if upstream:
            git("push", "origin", branch)
        else:
            git("push", "-u", "origin", branch)

        occurred_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        run(
            [
                str(PYTHON),
                str(INFO_CLIENT),
                "create-record",
                "--project-id",
                "cmngwpdyk0001qj285szo4spq",
                "--title",
                subject,
                "--content",
                "Validated backend changes, synced with origin, committed, pushed, and recorded the update.",
                "--result",
                f"Pushed {commit_hash[:7]} on {branch}.",
                "--next-step",
                "Continue backend roadmap implementation in the next autonomous iteration.",
                "--risk",
                "medium",
                "--status",
                "done",
                "--occurred-at",
                occurred_at,
                "--branch-name",
                branch,
                "--commit-hash",
                commit_hash,
                "--changed-files",
                "\n".join(committable_after),
                "--diff-summary",
                diff_summary or subject,
            ]
        )

        print_json(f"Autoflow: validated, pushed, and recorded {commit_hash[:7]} on {branch}.")
        return 0
    except Exception as exc:
        print_json("Autoflow failed. Session end blocked until backend workflow succeeds.", continue_value=False, stop_reason=str(exc))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
