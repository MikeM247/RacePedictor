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

# Reuse the same server-side OpenAI credential as Second Brain processing.
# Keep it in the Windows user environment; never copy it into the task config.
if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
  $sharedOpenAiKey = [Environment]::GetEnvironmentVariable("OPENAI_API_KEY", "User")
  if (-not [string]::IsNullOrWhiteSpace($sharedOpenAiKey)) {
    $env:OPENAI_API_KEY = $sharedOpenAiKey
  }
}

$logDirectory = Join-Path (Split-Path -Parent $ConfigurationPath) "logs"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

# A hidden PowerShell can still allocate a console when it invokes npm directly.
# Create the entire command tree without a console and capture both output streams.
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $env:ComSpec
$startInfo.Arguments = "/d /c npm.cmd run sync:local -- sync-and-publish"
$startInfo.WorkingDirectory = [string]$configuration.repositoryPath
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$process = New-Object System.Diagnostics.Process
$process.StartInfo = $startInfo
try {
  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEndAsync()
  $stderr = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $stdout.GetAwaiter().GetResult() | Set-Content -LiteralPath (Join-Path $logDirectory "local-sync.stdout.log") -Encoding UTF8
  $stderr.GetAwaiter().GetResult() | Set-Content -LiteralPath (Join-Path $logDirectory "local-sync.stderr.log") -Encoding UTF8
  "$(Get-Date -Format o) Exit code: $($process.ExitCode)" | Set-Content -LiteralPath (Join-Path $logDirectory "local-sync.status.log") -Encoding UTF8
  if ($process.ExitCode -ne 0) {
    throw "RacePredictor local sync exited with code $($process.ExitCode). See $logDirectory"
  }
} finally {
  $process.Dispose()
}
