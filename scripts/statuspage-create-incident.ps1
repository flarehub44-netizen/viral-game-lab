Param(
  [string]$PageId = "",
  [string]$ApiKey = "",
  [string]$Name = "Degradação pagamentos Pix",
  [string]$Body = "Estamos investigando instabilidade em pagamentos Pix.",
  [string]$Status = "investigating"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($PageId) -or [string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "Informe -PageId e -ApiKey."
}

$payload = @{
  incident = @{
    name = $Name
    status = $Status
    body = $Body
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Post `
  -Uri "https://api.statuspage.io/v1/pages/$PageId/incidents" `
  -Headers @{ Authorization = "OAuth $ApiKey" } `
  -ContentType "application/json" `
  -Body $payload

Write-Host "Incidente publicado no Statuspage."
