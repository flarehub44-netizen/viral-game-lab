Param(
  [string]$ProjectRef = "pbkdmcjlscjdvkaiypye",
  [string]$AnonKey = "",
  [string]$Email = "",
  [string]$Password = "",
  [int]$StakeAmount = 1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Status {
  param(
    [string]$Label,
    [bool]$Pass,
    [string]$Details = ""
  )
  $mark = if ($Pass) { "PASS" } else { "FAIL" }
  if ([string]::IsNullOrWhiteSpace($Details)) {
    Write-Host "[$mark] $Label"
  } else {
    Write-Host "[$mark] $Label - $Details"
  }
}

function Ensure-Input {
  if ([string]::IsNullOrWhiteSpace($AnonKey) -or [string]::IsNullOrWhiteSpace($Email) -or [string]::IsNullOrWhiteSpace($Password)) {
    throw "Informe -AnonKey, -Email e -Password."
  }
}

function Login-User {
  param([string]$Ref, [string]$Key, [string]$UserEmail, [string]$UserPassword)
  $uri = "https://$Ref.supabase.co/auth/v1/token?grant_type=password"
  $body = @{
    email = $UserEmail
    password = $UserPassword
  } | ConvertTo-Json

  return Invoke-RestMethod -Method Post -Uri $uri -Headers @{
    apikey = $Key
    "Content-Type" = "application/json"
  } -Body $body
}

function Start-Round {
  param([string]$BaseUrl, [string]$Jwt, [string]$Key, [int]$Stake)
  $idem = [guid]::NewGuid().ToString()
  $body = @{
    stake_amount = $Stake
    mode = "target_20x"
    idempotency_key = $idem
  } | ConvertTo-Json

  $resp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/start-round" -Headers @{
    Authorization = "Bearer $Jwt"
    apikey = $Key
    "Content-Type" = "application/json"
    "idempotency-key" = $idem
  } -Body $body

  return $resp
}

function End-Round {
  param([string]$BaseUrl, [string]$Jwt, [string]$Key, [hashtable]$Payload)
  $body = $Payload | ConvertTo-Json
  return Invoke-RestMethod -Method Post -Uri "$BaseUrl/end-round" -Headers @{
    Authorization = "Bearer $Jwt"
    apikey = $Key
    "Content-Type" = "application/json"
  } -Body $body
}

function End-Round-ExpectHttpError {
  param([string]$BaseUrl, [string]$Jwt, [string]$Key, [hashtable]$Payload)
  $body = $Payload | ConvertTo-Json
  try {
    $null = Invoke-RestMethod -Method Post -Uri "$BaseUrl/end-round" -Headers @{
      Authorization = "Bearer $Jwt"
      apikey = $Key
      "Content-Type" = "application/json"
    } -Body $body
    return @{ ok = $false; status = 200; raw = $null }
  } catch {
    $response = $_.Exception.Response
    if ($null -eq $response) {
      return @{ ok = $false; status = -1; raw = $null }
    }
    $statusCode = [int]$response.StatusCode
    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $raw = $reader.ReadToEnd()
    $reader.Close()
    return @{ ok = $true; status = $statusCode; raw = $raw }
  }
}

Ensure-Input
$baseUrl = "https://$ProjectRef.supabase.co/functions/v1"

Write-Host "Executando testes E2E end-round em $ProjectRef"

$login = Login-User -Ref $ProjectRef -Key $AnonKey -UserEmail $Email -UserPassword $Password
$jwt = [string]$login.access_token
if ([string]::IsNullOrWhiteSpace($jwt)) {
  throw "Falha no login: access_token vazio."
}

$all = @()

# Cenario 1: fechamento normal -> closed
$r1 = Start-Round -BaseUrl $baseUrl -Jwt $jwt -Key $AnonKey -Stake $StakeAmount
$e1 = End-Round -BaseUrl $baseUrl -Jwt $jwt -Key $AnonKey -Payload @{
  round_id = $r1.round_id
  alive = 0
  layout_seed = $r1.layout_seed
  layout_signature = $r1.layout_signature
  barriers_passed = 8
}
$pass1 = ($e1.ok -eq $true -and [string]$e1.round_status -eq "closed")
$all += $pass1
Write-Status -Label "Fechamento normal (closed)" -Pass $pass1 -Details ("status=" + [string]$e1.round_status)

# Cenario 2: replay idempotente -> already_settled true
$e2 = End-Round -BaseUrl $baseUrl -Jwt $jwt -Key $AnonKey -Payload @{
  round_id = $r1.round_id
  alive = 0
  layout_seed = $r1.layout_seed
  layout_signature = $r1.layout_signature
  barriers_passed = 8
}
$alreadySettled = $false
if ($null -ne $e2.PSObject.Properties["already_settled"]) {
  $alreadySettled = [bool]$e2.already_settled
}
$pass2 = ($e2.ok -eq $true -and $alreadySettled -eq $true)
$all += $pass2
Write-Status -Label "Replay idempotente (already_settled)" -Pass $pass2 -Details ("already_settled=" + [string]$alreadySettled)

# Cenario 3: mismatch assinatura -> erro 400 layout_mismatch_signature
$r3 = Start-Round -BaseUrl $baseUrl -Jwt $jwt -Key $AnonKey -Stake $StakeAmount
$mismatch = End-Round-ExpectHttpError -BaseUrl $baseUrl -Jwt $jwt -Key $AnonKey -Payload @{
  round_id = $r3.round_id
  alive = 0
  layout_seed = $r3.layout_seed
  layout_signature = "assinatura_invalida"
  barriers_passed = 2
}
$containsMismatch = $false
if ($mismatch.raw) {
  $containsMismatch = $mismatch.raw -match "layout_mismatch_signature"
}
$pass3 = ($mismatch.ok -eq $true -and $mismatch.status -eq 400 -and $containsMismatch)
$all += $pass3
Write-Status -Label "Mismatch de assinatura (400)" -Pass $pass3 -Details ("http=" + [string]$mismatch.status)

# Cenario 4: timeout -> expired com forced_by_timeout true
$r4 = Start-Round -BaseUrl $baseUrl -Jwt $jwt -Key $AnonKey -Stake $StakeAmount
$wait = [int]$r4.max_duration_seconds + 31
Write-Host "Aguardando timeout: $wait segundos..."
Start-Sleep -Seconds $wait

$e4 = End-Round -BaseUrl $baseUrl -Jwt $jwt -Key $AnonKey -Payload @{
  round_id = $r4.round_id
  alive = 1
  layout_seed = $r4.layout_seed
  layout_signature = $r4.layout_signature
  barriers_passed = 0
}
$forced = $false
if ($null -ne $e4.PSObject.Properties["forced_by_timeout"]) {
  $forced = [bool]$e4.forced_by_timeout
}
$pass4 = ($e4.ok -eq $true -and [string]$e4.round_status -eq "expired" -and $forced -eq $true)
$all += $pass4
Write-Status -Label "Timeout forçado (expired)" -Pass $pass4 -Details ("status=" + [string]$e4.round_status)

$total = $all.Count
$okCount = ($all | Where-Object { $_ }).Count
Write-Host ""
Write-Host "Resultado final: $okCount/$total cenarios aprovados."

if ($okCount -ne $total) {
  exit 1
}
