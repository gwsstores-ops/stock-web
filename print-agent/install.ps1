# Sets up the GWS print agent on this PC (no admin rights needed):
#   powershell -ExecutionPolicy Bypass -File print-agent\install.ps1 -Key <PRINT_AGENT_KEY>
# Re-running it updates the script and settings and restarts the agent.

param(
  [Parameter(Mandatory = $true)][string]$Key,
  [string]$Url = 'https://stock-web-iota.vercel.app',
  [string]$Printer = 'Brother HL-L5210DN series Printer'
)

$ErrorActionPreference = 'Stop'

$dir = Join-Path $env:LOCALAPPDATA 'GWS Print Agent'
New-Item -ItemType Directory -Force $dir | Out-Null

if (-not (Get-Printer -Name $Printer -ErrorAction SilentlyContinue)) {
  throw "No printer called '$Printer' on this PC. Pass -Printer with the name shown in Printers & scanners."
}

# SumatraPDF (free, portable) does the silent printing.
$sumatra = Join-Path $dir 'SumatraPDF.exe'
if (-not (Test-Path $sumatra)) {
  $zip = Join-Path $env:TEMP 'SumatraPDF.zip'
  # curl.exe rather than Invoke-WebRequest: PowerShell's own requests are blocked here.
  & (Join-Path $env:SystemRoot 'System32\curl.exe') -sSfL -o $zip 'https://www.sumatrapdfreader.org/dl/rel/3.5.2/SumatraPDF-3.5.2-64.zip'
  if ($LASTEXITCODE -ne 0) { throw "Could not download SumatraPDF (curl error $LASTEXITCODE)" }
  Expand-Archive $zip -DestinationPath $dir -Force
  Remove-Item $zip
  Get-ChildItem $dir -Filter 'SumatraPDF*.exe' | Select-Object -First 1 | Rename-Item -NewName 'SumatraPDF.exe' -ErrorAction SilentlyContinue
}

@{ url = $Url.TrimEnd('/'); key = $Key; printer = $Printer } | ConvertTo-Json |
  Set-Content (Join-Path $dir 'config.json') -Encoding UTF8

Copy-Item (Join-Path $PSScriptRoot 'print-agent.ps1') $dir -Force

# Start at logon from the user's Startup folder.
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $startup 'GWS Print Agent.lnk'))
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $dir 'print-agent.ps1')`""
$shortcut.WindowStyle = 7
$shortcut.Save()

# Restart it now so the new settings take effect.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like '*print-agent.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList $shortcut.Arguments

Write-Host "Print agent installed and running. Log: $(Join-Path $dir 'print-agent.log')"
