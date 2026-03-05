# =============================================================================
# setup-git-aliases.ps1
# Dang ky git global aliases - dung Windows path co dinh cho alias.sh
# Chay: Right-click -> "Run with PowerShell"
#       Hoac: powershell -ExecutionPolicy Bypass -File .\setup-git-aliases.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

# ── Duong dan co dinh toi alias.sh (Windows path, dung backslash) ------------
# Script tu lay chinh thu muc chua no, khong can sua tay.
$AliasSh = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "alias.sh"

Write-Host ""
Write-Host "[setup] alias.sh : $AliasSh"

if (-not (Test-Path $AliasSh)) {
    Write-Host "[ERROR] Khong tim thay: $AliasSh" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat" | Out-Null
    exit 1
}

# ── Alias value: dung cmd /c + git bash truc tiep qua sh.exe -----------------
# Git for Windows co sh.exe trong PATH khi chay qua git alias (khac voi CMD)
# Cach don gian nhat: ghi thang Windows path vao alias, git se goi sh -c
# Format: !sh.exe -c 'source "WIN_PATH_FORWARD_SLASH" && cmd "$@"' --

# Chuyen backslash -> forward slash (bash trong git alias hieu duoc C:/foo/bar)
$AliasShFwd = $AliasSh -replace '\\', '/'

Write-Host "[setup] Path fwd : $AliasShFwd"
Write-Host ""
Write-Host "[setup] Dang dang ky aliases..."
Write-Host ""

$Aliases = @("o", "oaddcommit", "oclone", "opull", "opush", "opushforce", "opullpush", "ostash", "ofetch", "oinit", "oconfig", "oconfigclean")
$Count = 0

foreach ($cmd in $Aliases) {
    # Git alias format: !sh -c 'source "C:/path/alias.sh" && cmd "$@"' --
    # sh.exe luon co trong PATH khi git chay alias (Git for Windows tu them)
    $val = "!sh -c 'source " + '"' + $AliasShFwd + '"' + " && $cmd " + '"$@"' + "' --"
    
    git config --global "alias.$cmd" $val
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK]   alias.$cmd"
        $Count++
    }
    else {
        Write-Host "[FAIL] alias.$cmd" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "[setup] Done: $Count aliases dang ky thanh cong."
Write-Host ""
Write-Host " Kiem tra : git config --global --list"
Write-Host " Thu ngay : git o"
Write-Host ""
Read-Host "Nhan Enter de dong" | Out-Null