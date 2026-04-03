param(
    [int]$Iterations = 6
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\\..")).Path
$LogDir = Join-Path $RepoRoot ".claude\\logs"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$SleepSeconds = if ($env:CLAUDE_FRONTEND_LOOP_SLEEP_SECONDS) { [int]$env:CLAUDE_FRONTEND_LOOP_SLEEP_SECONDS } else { 5 }
$SessionName = "frontend-night-loop-$Timestamp"
$LogFile = Join-Path $LogDir "$SessionName.log"
$ClaudeBin = if ($env:CLAUDE_BIN) { $env:CLAUDE_BIN } else { "claude" }

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $RepoRoot

for ($i = 1; $i -le $Iterations; $i++) {
    $Header = "`n===== iteration $i/$Iterations $(Get-Date -Format s) ====="
    $Header | Tee-Object -FilePath $LogFile -Append
    $TaskPrompt = Get-Content -Raw (Join-Path $RepoRoot ".claude\\next_frontend_task.md")
    $Prompt = @"
$TaskPrompt

先执行上面的 handoff。如果 handoff 仍然很泛化，就先阅读 frontend 当前实现、相关路由和必要的后端 API 文档，只做一个最小但完整的前端增量。页面文案优先中文。完成一个连贯增量后停止，不要擅自扩展到后端。
"@
    & $ClaudeBin -p `
        --permission-mode bypassPermissions `
        --setting-sources project `
        --output-format text `
        --allowedTools default `
        --append-system-prompt "你正在当前项目仓库里运行无人值守前端 loop。只做 frontend 页面、样式、交互、前端契约对齐、构建验证和前端相关文档；绝对不要改 backend Python/Django 代码。你要持续产出高质量中文界面，视觉方向必须遵循苹果 Human Interface Guidelines 启发下的高级现代玻璃拟态设计：连续圆角 squircle、半透明磨砂玻璃面板、轻微白色发光内边框、柔和多层环境阴影、大量留白、干净中性色底、带模糊流动感的鲜艳抽象渐变背景、高对比无衬线几何字体、极简但未来感强。每次只做一个连贯的前端增量，完成后运行前端构建验证，再停止。不要等待用户确认。" `
        $Prompt 2>&1 | Tee-Object -FilePath $LogFile -Append

    if ($i -lt $Iterations) {
        Start-Sleep -Seconds $SleepSeconds
    }
}

"Loop complete. Log: $LogFile" | Tee-Object -FilePath $LogFile -Append
