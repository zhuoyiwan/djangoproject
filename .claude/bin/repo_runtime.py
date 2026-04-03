#!/usr/bin/env python3
import os
import shutil
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def resolve_python() -> str:
    candidates = [
        REPO_ROOT / ".venv" / "Scripts" / "python.exe",
        REPO_ROOT / ".venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    current = Path(sys.executable)
    if current.exists():
        return str(current)

    for executable in ("py", "python3", "python"):
        resolved = shutil.which(executable)
        if resolved:
            return resolved

    return "python"


def resolve_info_client() -> str | None:
    candidates = [
        REPO_ROOT / "info-exchange-api" / "scripts" / "info_client.py",
        REPO_ROOT / "info_client.py",
        Path.home() / ".codex" / "skills" / "info-exchange-api" / "scripts" / "info_client.py",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return None


def is_windows() -> bool:
    return os.name == "nt"
