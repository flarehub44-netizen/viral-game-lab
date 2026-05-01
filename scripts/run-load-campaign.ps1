Param(
  [string]$BaseUrl = "",
  [string]$Jwt = "",
  [string]$ApiKey = "",
  [int]$Stake = 1,
  [string]$K6Exe = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BaseUrl) -or [string]::IsNullOrWhiteSpace($Jwt) -or [string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "Informe -BaseUrl, -Jwt e -ApiKey para rodar a campanha."
}

function Resolve-K6Exe {
  param([string]$Explicit)

  if (-not [string]::IsNullOrWhiteSpace($Explicit)) {
    if (-not (Test-Path -LiteralPath $Explicit)) {
      throw "K6Exe não encontrado em: $Explicit"
    }
    return (Resolve-Path -LiteralPath $Explicit).Path
  }

  try {
    $cmd = Get-Command k6 -ErrorAction Stop
    return $cmd.Source
  } catch {
    $candidates = @(
      "$env:ProgramFiles\\k6\\k6.exe",
      "${env:ProgramFiles(x86)}\\k6\\k6.exe"
    )
    foreach ($p in $candidates) {
      if (Test-Path -LiteralPath $p) {
        return (Resolve-Path -LiteralPath $p).Path
      }
    }
    throw "k6 não encontrado no PATH. Instale o k6 ou passe -K6Exe com caminho completo (ex.: 'C:\\Program Files\\k6\\k6.exe')."
  }
}

$k6 = Resolve-K6Exe -Explicit $K6Exe

Write-Host "Fase 1: burst 1000 usuários concorrentes (20 min)"
& $k6 run scripts/load-start-end-round.js `
  --stage 2m:200 `
  --stage 10m:1000 `
  --stage 8m:0 `
  -e BASE_URL=$BaseUrl `
  -e JWT=$Jwt `
  -e API_KEY=$ApiKey `
  -e STAKE=$Stake `
  --summary-export scripts/k6-summary-1000.json

Write-Host "Fase 2: soak 24h com carga sustentada (200 usuários)"
& $k6 run scripts/load-start-end-round.js `
  --stage 10m:200 `
  --stage 24h:200 `
  --stage 10m:0 `
  -e BASE_URL=$BaseUrl `
  -e JWT=$Jwt `
  -e API_KEY=$ApiKey `
  -e STAKE=$Stake `
  --summary-export scripts/k6-summary-soak24h.json

Write-Host "Campanha concluída. Relatórios:"
Write-Host " - scripts/k6-summary-1000.json"
Write-Host " - scripts/k6-summary-soak24h.json"
