<#
.SYNOPSIS
  Aplica migrations pendentes no projeto Supabase linkado e publica todas as Edge Functions.

.DESCRIPTION
  Exige: CLI logado (`npx supabase login`) e projeto linkado na pasta (`npx supabase link`).
  Usa `npx` para não depender do binário global `supabase`.

.PARAMETER IncludeAllMigrations
  Passa `--include-all` no `db push` (útil quando o histórico remoto diverge e o CLI pede essa flag).

.EXAMPLE
  .\scripts\deploy-supabase.ps1

.EXAMPLE
  .\scripts\deploy-supabase.ps1 -IncludeAllMigrations
#>
param(
  [switch]$IncludeAllMigrations
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$dbArgs = @("db", "push", "--linked", "--yes")
if ($IncludeAllMigrations) {
  $dbArgs += "--include-all"
}

Write-Host "`n>>> npx supabase $($dbArgs -join ' ')`n" -ForegroundColor Cyan
npx supabase @dbArgs

Write-Host "`n>>> npx supabase functions deploy --yes`n" -ForegroundColor Cyan
npx supabase functions deploy --yes

Write-Host "`nDeploy Supabase concluído.`n" -ForegroundColor Green
