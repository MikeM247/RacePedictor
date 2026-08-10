param(
  [Parameter(Mandatory = $true)]
  [string]$ConfigurationPath
)

$ErrorActionPreference = "Stop"
$configuration = Get-Content -LiteralPath $ConfigurationPath -Raw | ConvertFrom-Json
$env:RACEPREDICTOR_DATABASE_PATH = [string]$configuration.databasePath
$env:RACEPREDICTOR_OBSIDIAN_VAULT_PATH = [string]$configuration.vaultPath
$env:RACEPREDICTOR_CLOUD_URL = [string]$configuration.cloudUrl
$env:RACEPREDICTOR_ATHLETE_ID = [string]$configuration.athleteId

Push-Location -LiteralPath ([string]$configuration.repositoryPath)
try {
  & npm.cmd run sync:local -- sync
  if ($LASTEXITCODE -ne 0) {
    throw "RacePredictor local sync exited with code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
