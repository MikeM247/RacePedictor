param(
  [Parameter(Mandatory = $true)]
  [string]$RepositoryPath,
  [Parameter(Mandatory = $true)]
  [string]$DatabasePath,
  [Parameter(Mandatory = $true)]
  [string]$VaultPath,
  [Parameter(Mandatory = $true)]
  [string]$CloudUrl,
  [string]$AthleteId = "athlete_001",
  [ValidateRange(5, 1440)]
  [int]$IntervalMinutes = 15
)

$ErrorActionPreference = "Stop"
$repository = (Resolve-Path -LiteralPath $RepositoryPath).Path
$vault = (Resolve-Path -LiteralPath $VaultPath).Path
$database = [System.IO.Path]::GetFullPath($DatabasePath)
$cloud = [Uri]$CloudUrl
if ($cloud.Scheme -ne "https" -and $cloud.Host -notin @("localhost", "127.0.0.1")) {
  throw "CloudUrl must use HTTPS outside localhost"
}
if (-not $env:LOCALAPPDATA) {
  throw "LOCALAPPDATA is required"
}

$localDirectory = Join-Path $env:LOCALAPPDATA "RacePredictor"
New-Item -ItemType Directory -Force -Path $localDirectory | Out-Null
$configurationPath = Join-Path $localDirectory "local-sync-config.json"
@{
  repositoryPath = $repository
  databasePath = $database
  vaultPath = $vault
  cloudUrl = $cloud.GetLeftPart([UriPartial]::Authority)
  athleteId = $AthleteId
} | ConvertTo-Json | Set-Content -LiteralPath $configurationPath -Encoding UTF8

$runner = Join-Path $repository "packages\db\scripts\run-local-sync-task.ps1"
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
  throw "The RacePredictor local sync runner was not found"
}
$arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`" -ConfigurationPath `"$configurationPath`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive
Register-ScheduledTask -TaskName "RacePredictor Local Sync" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Output "RacePredictor Local Sync is scheduled every $IntervalMinutes minutes for the current Windows user."
Write-Output "The configuration contains paths and the cloud URL only; the device credential remains DPAPI-protected separately."
