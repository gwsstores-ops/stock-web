# GWS print agent: collects labels from the print queue on the website and
# prints them on the stores printer with no print box. Started at logon by the
# shortcut install.ps1 puts in the Startup folder. Settings live in
# %LOCALAPPDATA%\GWS Print Agent\config.json.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dir = Join-Path $env:LOCALAPPDATA 'GWS Print Agent'
$config = Get-Content (Join-Path $dir 'config.json') -Raw | ConvertFrom-Json
$sumatra = Join-Path $dir 'SumatraPDF.exe'
$logFile = Join-Path $dir 'print-agent.log'
$headers = @{ Authorization = "Bearer $($config.key)" }

function Write-Log($message) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
  Add-Content -Path $logFile -Value $line
  # Keep the log to the last 500 lines.
  $lines = Get-Content $logFile
  if ($lines.Count -gt 600) { $lines | Select-Object -Last 500 | Set-Content $logFile }
}

function Send-Done($id, $ok, $errorText) {
  $body = @{ id = $id; ok = $ok; error = $errorText } | ConvertTo-Json
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      Invoke-RestMethod -Method Post -Uri "$($config.url)/api/print-jobs/done" -Headers $headers `
        -ContentType 'application/json' -Body $body -TimeoutSec 30 | Out-Null
      return
    } catch {
      Start-Sleep -Seconds (5 * $attempt)
    }
  }
  Write-Log "Could not report job $id as done"
}

# Only one copy may run, or a label could print twice.
$mutex = New-Object System.Threading.Mutex($false, 'Global\GwsPrintAgent')
if (-not $mutex.WaitOne(0)) { exit }

Write-Log "Started, printing to '$($config.printer)'"

while ($true) {
  try {
    $resp = Invoke-WebRequest -Method Post -Uri "$($config.url)/api/print-jobs/next" -Headers $headers `
      -UseBasicParsing -TimeoutSec 30

    if ($resp.StatusCode -eq 200) {
      $job = $resp.Content | ConvertFrom-Json
      $file = Join-Path $env:TEMP ("gws-print-{0}.pdf" -f $job.id)

      try {
        [IO.File]::WriteAllBytes($file, [Convert]::FromBase64String($job.pdf))
        $proc = Start-Process -FilePath $sumatra -Wait -PassThru -WindowStyle Hidden -ArgumentList @(
          '-print-to', "`"$($config.printer)`"", '-print-settings', 'fit', '-silent', '-exit-when-done', "`"$file`""
        )
        if ($proc.ExitCode -eq 0) {
          Write-Log "Printed job $($job.id) ($($job.name))"
          Send-Done $job.id $true $null
        } else {
          Write-Log "Job $($job.id) failed, SumatraPDF exit code $($proc.ExitCode)"
          Send-Done $job.id $false "The stores PC could not print it (code $($proc.ExitCode))"
        }
      } catch {
        Write-Log "Job $($job.id) failed: $($_.Exception.Message)"
        Send-Done $job.id $false $_.Exception.Message
      } finally {
        Remove-Item $file -ErrorAction SilentlyContinue
      }

      # Straight back for the next one in case several are queued.
      continue
    }
  } catch {
    # Usually the internet is down for a moment; just try again shortly.
    Write-Log "Could not check the queue: $($_.Exception.Message)"
    Start-Sleep -Seconds 30
  }

  Start-Sleep -Seconds 3
}
