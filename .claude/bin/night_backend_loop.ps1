param(
    [int]$Iterations = 6
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\\..")).Path
$LogDir = Join-Path $RepoRoot ".claude\\logs"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$SleepSeconds = if ($env:CLAUDE_BACKEND_LOOP_SLEEP_SECONDS) { [int]$env:CLAUDE_BACKEND_LOOP_SLEEP_SECONDS } else { 5 }
$SessionName = "backend-night-loop-$Timestamp"
$LogFile = Join-Path $LogDir "$SessionName.log"
$ClaudeBin = if ($env:CLAUDE_BIN) { $env:CLAUDE_BIN } else { "claude" }

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $RepoRoot

for ($i = 1; $i -le $Iterations; $i++) {
    $Header = "`n===== iteration $i/$Iterations $(Get-Date -Format s) ====="
    $Header | Tee-Object -FilePath $LogFile -Append
    $TaskPrompt = Get-Content -Raw (Join-Path $RepoRoot ".claude\\next_backend_task.md")
    $Prompt = @"
$TaskPrompt

Execute the handoff above first. If it is still generic, read docs/architecture/backend-roadmap.md and pick the next unfinished backend milestone. Keep the increment small but complete. Run tests/checks needed for the touched area, update docs/api/openapi.yaml if the contract changes, then stop.
"@
    & $ClaudeBin -p `
        --permission-mode bypassPermissions `
        --setting-sources project `
        --output-format text `
        --allowedTools default `
        --append-system-prompt "You are running in unattended overnight mode for the current project repository. Work only on backend Python/Django/API/docs/automation tasks. Never choose frontend work. Follow the repo workflow strictly: after meaningful changes, rely on project hooks to validate, fetch/rebase, commit, push, and create an info-exchange record automatically. Before you start implementation, read .claude/next_backend_task.md and treat it as the handoff from the previous session. At the end of the session, leave the next session in a better position. When backend milestone implementation work is exhausted, switch to testing tasks instead of expanding scope. Never wait for user confirmation. Do not touch frontend unless strictly required by backend contracts. Stop after one coherent increment." `
        $Prompt 2>&1 | Tee-Object -FilePath $LogFile -Append

    if ($i -lt $Iterations) {
        Start-Sleep -Seconds $SleepSeconds
    }
}

"Loop complete. Log: $LogFile" | Tee-Object -FilePath $LogFile -Append
