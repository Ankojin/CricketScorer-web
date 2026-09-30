param(
  [switch]$Setup,
  [switch]$Report,
  [double]$MaxMonthlyUsd = 1.0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Aws {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $output = & aws @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw ("AWS CLI command failed: aws {0}" -f ($Arguments -join ' '))
  }
  return $output
}

function Write-Utf8NoBomFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Content
  )

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function ConvertTo-JsonArrayString {
  param(
    [Parameter(Mandatory = $true)]
    [object]$InputObject
  )

  $json = ($InputObject | ConvertTo-Json -Depth 20)
  $trimmed = $json.Trim()
  if ($trimmed.StartsWith('[')) {
    return $json
  }
  return "[$json]"
}

function Get-MonthRange {
  $now = Get-Date
  $start = Get-Date -Year $now.Year -Month $now.Month -Day 1
  $end = $start.AddMonths(1)
  return @($start.ToString('yyyy-MM-dd'), $end.ToString('yyyy-MM-dd'))
}

function Get-AccountId {
  $identity = Invoke-Aws -Arguments @('sts', 'get-caller-identity', '--output', 'json') | ConvertFrom-Json
  if (-not $identity.Account) {
    throw 'Unable to resolve AWS account id from sts get-caller-identity'
  }
  return $identity.Account
}

function Write-CostReport {
  param(
    [Parameter(Mandatory = $true)]
    [double]$MaxAllowed
  )

  $range = Get-MonthRange
  $start = $range[0]
  $end = $range[1]

  $result = Invoke-Aws -Arguments @(
    'ce', 'get-cost-and-usage',
    '--time-period', "Start=$start,End=$end",
    '--granularity', 'MONTHLY',
    '--metrics', 'UnblendedCost',
    '--group-by', 'Type=DIMENSION,Key=SERVICE',
    '--output', 'json'
  ) | ConvertFrom-Json

  $period = $result.ResultsByTime[0]
  $groups = @($period.Groups)
  $total = 0.0

  Write-Host ""
  Write-Host "AWS Month-to-date Cost Report ($start to $end)"
  Write-Host "---------------------------------------------"

  foreach ($g in $groups) {
    $service = $g.Keys[0]
    $amount = [double]$g.Metrics.UnblendedCost.Amount
    $total += $amount
    Write-Host ("{0,-40} {1,12:N8} USD" -f $service, $amount)
  }

  Write-Host "---------------------------------------------"
  Write-Host ("{0,-40} {1,12:N8} USD" -f 'TOTAL', $total)

  if ($total -gt $MaxAllowed) {
    Write-Warning ("Monthly spend {0:N4} USD exceeded threshold {1:N4} USD" -f $total, $MaxAllowed)
    exit 2
  }
}

function Set-BudgetGuardrails {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AccountId,
    [Parameter(Mandatory = $true)]
    [double]$MaxAllowed
  )

  $root = Split-Path -Parent $PSScriptRoot
  $budgetPath = Join-Path $root 'budget.json'
  $notificationsPath = Join-Path $root 'notifications.json'

  if (-not (Test-Path $budgetPath)) {
    throw "Missing budget definition file: $budgetPath"
  }
  if (-not (Test-Path $notificationsPath)) {
    throw "Missing notifications definition file: $notificationsPath"
  }

  $budget = Get-Content -Raw -Path $budgetPath | ConvertFrom-Json
  $budget.BudgetLimit.Amount = ('{0:N2}' -f $MaxAllowed)

  $tmpBudget = [System.IO.Path]::GetTempFileName()
  $tmpNotifications = [System.IO.Path]::GetTempFileName()
  try {
    Write-Utf8NoBomFile -Path $tmpBudget -Content ($budget | ConvertTo-Json -Depth 20)
    Copy-Item -Path $notificationsPath -Destination $tmpNotifications -Force

    $budgetName = $budget.BudgetName
    $exists = $false

    try {
      Invoke-Aws -Arguments @('budgets', 'describe-budget', '--account-id', $AccountId, '--budget-name', $budgetName, '--output', 'json') | Out-Null
      $exists = $true
    } catch {
      $exists = $false
    }

    if ($exists) {
      Invoke-Aws -Arguments @('budgets', 'update-budget', '--account-id', $AccountId, '--new-budget', ("file://{0}" -f $tmpBudget)) | Out-Null
      Write-Host "Updated existing budget: $budgetName"
    } else {
      Invoke-Aws -Arguments @(
        'budgets', 'create-budget',
        '--account-id', $AccountId,
        '--budget', ("file://{0}" -f $tmpBudget),
        '--notifications-with-subscribers', ("file://{0}" -f $tmpNotifications)
      ) | Out-Null
      Write-Host "Created budget and notifications: $budgetName"
    }

    # Ensure notifications exist for all desired thresholds.
    $configured = Invoke-Aws -Arguments @(
      'budgets', 'describe-notifications-for-budget',
      '--account-id', $AccountId,
      '--budget-name', $budgetName,
      '--output', 'json'
    ) | ConvertFrom-Json

    $existingThresholds = @{}
    foreach ($n in @($configured.Notifications)) {
      $existingThresholds[[string]([double]$n.Threshold)] = $true
    }

    $notifications = Get-Content -Raw -Path $notificationsPath | ConvertFrom-Json
    foreach ($entry in $notifications) {
      $threshold = [string]([double]$entry.Notification.Threshold)
      if ($existingThresholds.ContainsKey($threshold)) {
        continue
      }

      try {
        $tmpNotification = [System.IO.Path]::GetTempFileName()
        $tmpSubscribers = [System.IO.Path]::GetTempFileName()
        Write-Utf8NoBomFile -Path $tmpNotification -Content ($entry.Notification | ConvertTo-Json -Depth 20)
        Write-Utf8NoBomFile -Path $tmpSubscribers -Content (ConvertTo-JsonArrayString -InputObject $entry.Subscribers)

        $result = & aws @(
          'budgets', 'create-notification',
          '--account-id', $AccountId,
          '--budget-name', $budgetName,
          '--notification', ("file://{0}" -f $tmpNotification),
          '--subscribers', ("file://{0}" -f $tmpSubscribers)
        ) 2>&1

        if ($LASTEXITCODE -ne 0) {
          $raw = ($result | Out-String)
          if ($raw -notmatch 'DuplicateRecordException') {
            throw ("AWS CLI command failed: aws budgets create-notification ... `n{0}" -f $raw)
          }
        }
      } catch {
        throw
      } finally {
        Remove-Item -Path $tmpNotification -ErrorAction SilentlyContinue
        Remove-Item -Path $tmpSubscribers -ErrorAction SilentlyContinue
      }
    }
  } finally {
    Remove-Item -Path $tmpBudget -ErrorAction SilentlyContinue
    Remove-Item -Path $tmpNotifications -ErrorAction SilentlyContinue
  }
}

$runSetup = $Setup.IsPresent -or ((-not $Setup.IsPresent) -and (-not $Report.IsPresent))
$runReport = $Report.IsPresent -or ((-not $Setup.IsPresent) -and (-not $Report.IsPresent))

$accountId = Get-AccountId
Write-Host "Using AWS account: $accountId"

if ($runSetup) {
  Set-BudgetGuardrails -AccountId $accountId -MaxAllowed $MaxMonthlyUsd
}

if ($runReport) {
  Write-CostReport -MaxAllowed $MaxMonthlyUsd
}
