<#
.SYNOPSIS
  Smoke tests HTTP para a Edge Function pix-webhook (Sync Pay).

.DESCRIPTION
  Executa chamadas seguras que não confirmam Pix nem alteram saldo:
  - OPTIONS (CORS preflight)
  - POST sem header "event" -> 400 unsupported_event (depois da camada de segurança)
  - POST corpo inválido -> 400 invalid_json
  - POST corpo sem campos obrigatórios -> 400 invalid_payload
  - Opcional: Bearer errado -> 401 invalid_signature (quando o servidor tiver bearer configurado)

  Interpretação comum:
  - 503 webhook_security_not_configured: secrets SYNC_PAY_WEBHOOK_IP_ALLOWLIST e SYNC_PAY_WEBHOOK_BEARER_TOKEN vazios no deploy.
  - 401 ip_not_allowed: allowlist ativa e IP visto pela função não está na lista (ajuste na Sync Pay / infra).

.PARAMETER WebhookUrl
  URL completa, ex: https://<ref>.supabase.co/functions/v1/pix-webhook

.PARAMETER BearerToken
  Token igual ao SYNC_PAY_WEBHOOK_BEARER_TOKEN (somente para ambientes de teste; não commitar).

.PARAMETER ForwardedFor
  Opcional: envia header X-Forwarded-For (o cliente remoto pode não refletir o IP real visto pelo Edge).

.PARAMETER Allow503AsPass
  Se o primeiro POST retornar 503, encerra com sucesso (útil enquanto secrets ainda não foram configurados).

.PARAMETER IncludeWrongBearerTest
  Envia Authorization Bearer incorreto; espera 401 no servidor com bearer configurado.

.EXAMPLE
  .\scripts\smoke-pix-webhook.ps1 -WebhookUrl "https://xxxx.supabase.co/functions/v1/pix-webhook"
.EXAMPLE
  .\scripts\smoke-pix-webhook.ps1 -WebhookUrl "https://xxxx.supabase.co/functions/v1/pix-webhook" -BearerToken $env:SYNC_PAY_WEBHOOK_BEARER_TOKEN -IncludeWrongBearerTest
#>

Param(
  [string]$WebhookUrl = "",
  [string]$BearerToken = "",
  [string]$ForwardedFor = "",
  [switch]$Allow503AsPass,
  [switch]$IncludeWrongBearerTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WebhookUrl)) {
  Write-Host "Erro: informe -WebhookUrl (pix-webhook)." -ForegroundColor Yellow
  Write-Host "Exemplo: .\scripts\smoke-pix-webhook.ps1 -WebhookUrl `"https://<ref>.supabase.co/functions/v1/pix-webhook`""
  exit 1
}

function Normalize-WebhookUrl([string]$u) {
  return $u.TrimEnd('/')
}

function Invoke-SmokeWebRequest {
  param(
    [ValidateSet("OPTIONS", "POST", "GET")]
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [string]$Body = $null
  )

  $reqParams = @{
    Uri             = $Uri
    Method          = $Method
    Headers         = $Headers
    UseBasicParsing = $true
  }
  if ($null -ne $Body) {
    $reqParams.Body = $Body
  }

  if ($PSVersionTable.PSVersion.Major -ge 7) {
    $r = Invoke-WebRequest @reqParams -SkipHttpErrorCheck
    return @{ StatusCode = [int]$r.StatusCode; Content = $r.Content }
  }

  try {
    $r = Invoke-WebRequest @reqParams
    return @{ StatusCode = [int]$r.StatusCode; Content = $r.Content }
  }
  catch {
    $resp = $_.Exception.Response
    if ($null -eq $resp) { throw }
    $code = [int]$resp.StatusCode
    $stream = $resp.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    try {
      $text = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
      $stream.Dispose()
    }
    return @{ StatusCode = $code; Content = $text }
  }
}

function Assert-Status {
  param(
    [string]$TestName,
    [int]$Got,
    [int[]]$Allowed,
    [string]$BodySnippet = ""
  )

  if ($Allowed -contains $Got) {
    Write-Host "[OK] $TestName -> HTTP $Got"
    return $true
  }

  $snippet = if ($BodySnippet.Length -gt 280) { $BodySnippet.Substring(0, 280) + "..." } else { $BodySnippet }
  Write-Host "[FALHA] $TestName -> HTTP $Got (esperado: $($Allowed -join ', '))"
  if ($snippet) {
    Write-Host "        corpo: $snippet"
  }
  return $false
}

function Build-Headers {
  param(
    [string]$AuthorizationValue,
    [string]$EventHeader
  )

  $h = @{
    "Content-Type" = "application/json"
  }
  if ($AuthorizationValue) {
    $h["Authorization"] = $AuthorizationValue
  }
  if ($EventHeader) {
    $h["event"] = $EventHeader
  }
  if ($ForwardedFor) {
    $h["X-Forwarded-For"] = $ForwardedFor
  }
  return $h
}

$url = Normalize-WebhookUrl $WebhookUrl
$allOk = $true

Write-Host "Smoke pix-webhook -> $url"

# 1) OPTIONS
$rOpt = Invoke-SmokeWebRequest -Method "OPTIONS" -Uri $url -Headers @{ }
if (-not (Assert-Status -TestName "OPTIONS (preflight)" -Got $rOpt.StatusCode -Allowed @(200))) {
  $allOk = $false
}

# 2) POST sem segurança suficiente no servidor -> 503
$rBare = Invoke-SmokeWebRequest -Method "POST" -Uri $url -Headers (Build-Headers -AuthorizationValue "" -EventHeader "") -Body "{}"
if ($rBare.StatusCode -eq 503) {
  Write-Host "[INFO] POST inicial -> HTTP 503 (webhook_security_not_configured). Configure allowlist e/ou bearer no Supabase."
  if ($Allow503AsPass) {
    Write-Host "[OK] Allow503AsPass: encerrando smoke como sucesso."
    exit 0
  }
  $allOk = $false
}

# A partir daqui precisamos passar da camada IP+bearer para testar validação de evento/corpo.
$authHeader = ""
if ($BearerToken) {
  $authHeader = "Bearer $BearerToken"
}

# 3) Sem header event (payload irrelevante)
$rNoEvent = Invoke-SmokeWebRequest -Method "POST" -Uri $url -Headers (Build-Headers -AuthorizationValue $authHeader -EventHeader "") -Body "{}"
if (-not (Assert-Status -TestName "POST sem header event" -Got $rNoEvent.StatusCode -Allowed @(400) -BodySnippet $rNoEvent.Content)) {
  if ($rNoEvent.StatusCode -eq 401 -and -not $BearerToken) {
    Write-Host "        [DICA] HTTP 401: passe -BearerToken igual ao secret SYNC_PAY_WEBHOOK_BEARER_TOKEN ou revise SYNC_PAY_WEBHOOK_IP_ALLOWLIST / IP de origem."
  }
  $allOk = $false
}

# 4) Event não suportado
$rBadEvent = Invoke-SmokeWebRequest -Method "POST" -Uri $url -Headers (Build-Headers -AuthorizationValue $authHeader -EventHeader "unknown.event") -Body "{}"
if (-not (Assert-Status -TestName "POST event unsupported" -Got $rBadEvent.StatusCode -Allowed @(400) -BodySnippet $rBadEvent.Content)) {
  $allOk = $false
}

# 5) JSON inválido (corpo não é JSON)
$rBadJson = Invoke-SmokeWebRequest -Method "POST" -Uri $url -Headers (Build-Headers -AuthorizationValue $authHeader -EventHeader "cashin.update") -Body "not-json{{{"
if (-not (Assert-Status -TestName "POST invalid_json" -Got $rBadJson.StatusCode -Allowed @(400) -BodySnippet $rBadJson.Content)) {
  $allOk = $false
}

# 6) Payload incompleto
$rBadPayload = Invoke-SmokeWebRequest -Method "POST" -Uri $url -Headers (Build-Headers -AuthorizationValue $authHeader -EventHeader "cashin.update") -Body "{}"
if (-not (Assert-Status -TestName "POST invalid_payload" -Got $rBadPayload.StatusCode -Allowed @(400) -BodySnippet $rBadPayload.Content)) {
  $allOk = $false
}

if ($IncludeWrongBearerTest) {
  $rWrong = Invoke-SmokeWebRequest -Method "POST" -Uri $url -Headers (Build-Headers -AuthorizationValue "Bearer syncpay-smoke-wrong-token" -EventHeader "") -Body "{}"
  # Com bearer no servidor: 401. Sem bearer no servidor: pode cair em 400 unsupported_event ou 503.
  $allowedWrong = @(401, 400, 503)
  if (-not (Assert-Status -TestName "POST Bearer incorreto (ou servidor sem bearer)" -Got $rWrong.StatusCode -Allowed $allowedWrong -BodySnippet $rWrong.Content)) {
    $allOk = $false
  }
}

if ($allOk) {
  Write-Host ""
  Write-Host "Smoke concluído: todas as verificações esperadas passaram."
  exit 0
}

Write-Host ""
Write-Host "Smoke concluído com falhas. Ajuste secrets/deploy ou parâmetros (-BearerToken, IP allowlist, -Allow503AsPass)."
exit 1
