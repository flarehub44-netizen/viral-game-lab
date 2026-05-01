Param(
  [string]$RoutingKey = "",
  [string]$Summary = "Neon P1 financeiro",
  [string]$Severity = "critical"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RoutingKey)) {
  throw "Informe -RoutingKey (Events API v2)."
}

$body = @{
  routing_key = $RoutingKey
  event_action = "trigger"
  payload = @{
    summary = $Summary
    severity = $Severity
    source = "neon-live"
    component = "economy"
    group = "production"
    class = "financial"
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Post -Uri "https://events.pagerduty.com/v2/enqueue" -ContentType "application/json" -Body $body
Write-Host "Evento PagerDuty enviado."
