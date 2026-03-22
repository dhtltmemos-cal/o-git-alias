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
$AliasShFwd = $AliasSh -replace '\\', '/'

Write-Host "[setup] Path fwd : $AliasShFwd"
Write-Host ""
Write-Host "[setup] Dang dang ky aliases..."
Write-Host ""

# Mỗi entry: [alias_name, function_name]
# alias_name    = tên git alias (git <alias_name>)
# function_name = hàm bash trong alias.sh sẽ được gọi
$Aliases = @(
    # Lệnh đầy đủ
    @("o", "o"),
    @("oaddcommit", "oaddcommit"),
    @("oclone", "oclone"),
    @("opull", "opull"),
    @("opush", "opush"),
    @("opushforce", "opushforce"),
    @("opushforceurl", "opushforceurl"),
    @("opullpush", "opullpush"),
    @("ostash", "ostash"),
    @("ofetch", "ofetch"),
    @("oinit", "oinit"),
    @("oconfig", "oconfig"),
    @("oconfigclean", "oconfigclean"),
    @("ocreateremote", "ocreateremote"),
    @("addfile", "addfile"),
    # Viết tắt (trỏ cùng hàm)
    @("oac", "oaddcommit"),
    @("ocl", "oclone"),
    @("opl", "opull"),
    @("ops", "opush"),
    @("opf", "opushforce"),
    @("opfurl", "opushforceurl"),
    @("opp", "opullpush"),
    @("ost", "ostash"),
    @("oft", "ofetch"),
    @("oi", "oinit"),
    @("oc", "oconfig"),
    @("occ", "oconfigclean"),
    @("ocr", "ocreateremote"),
    @("af", "addfile")
)
$Count = 0

foreach ($entry in $Aliases) {
    $cmd = $entry[0]   # tên alias git
    $func = $entry[1]   # hàm bash cần gọi

    $val = "!sh -c 'source " + '"' + $AliasShFwd + '"' + " && $func " + '"$@"' + "' --"

    git config --global "alias.$cmd" $val
    if ($LASTEXITCODE -eq 0) {
        if ($cmd -eq $func) {
            Write-Host "[OK]   alias.$cmd"
        }
        else {
            Write-Host "[OK]   alias.$cmd  →  $func"
        }
        $Count++
    }
    else {
        Write-Host "[FAIL] alias.$cmd" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "[setup] Done: $Count aliases dang ky thanh cong."
Write-Host ""
Write-Host "  Lenh day du          Viet tat"
Write-Host "  =============================="
Write-Host "  git oaddcommit       git oac"
Write-Host "  git oclone           git ocl"
Write-Host "  git opull            git opl"
Write-Host "  git opush            git ops"
Write-Host "  git opushforce       git opf"
Write-Host "  git opushforceurl    git opfurl"
Write-Host "  git opullpush        git opp"
Write-Host "  git ostash           git ost"
Write-Host "  git ofetch           git oft"
Write-Host "  git oinit            git oi"
Write-Host "  git oconfig          git oc"
Write-Host "  git oconfigclean     git occ"
Write-Host "  git ocreateremote    git ocr"
Write-Host "  git addfile          git af"
Write-Host "    addfile omessage"
Write-Host "    addfile ogitignore"
Write-Host ""
Write-Host " Kiem tra : git config --global --list"
Write-Host " Thu ngay : git o"
Write-Host ""
Read-Host "Nhan Enter de dong" | Out-Null