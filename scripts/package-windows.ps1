param(
  [switch]$NoBundle
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

Write-Host "Opaline Windows package" -ForegroundColor Green
Write-Host "Repository: $repoRoot"

$tauriArgs = @("run", "tauri", "--", "build")
if ($NoBundle) {
  $tauriArgs += "--no-bundle"
}

Write-Host "Running: npm $($tauriArgs -join ' ')"
& npm @tauriArgs

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$bundleDir = Join-Path $repoRoot "src-tauri\target\release\bundle\nsis"
if (Test-Path -LiteralPath $bundleDir) {
  Write-Host ""
  Write-Host "NSIS installer output:" -ForegroundColor Green
  Get-ChildItem -LiteralPath $bundleDir -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 8 Name, Length, LastWriteTime |
    Format-Table -AutoSize
} else {
  Write-Host ""
  Write-Host "No NSIS bundle directory found. If you used -NoBundle, this is expected." -ForegroundColor Yellow
}
