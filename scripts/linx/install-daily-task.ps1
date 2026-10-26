$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$launcher = Join-Path $root 'scripts\linx\daily-sync.cmd'
$taskName = 'Renova Miniso - Linx Daily Sync'

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Launcher não encontrado: $launcher"
}

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$launcher`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At 3:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 4)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Coleta incremental diária do Linx para o painel Renova Miniso.' -Force | Out-Null
Write-Output "Agendamento criado: $taskName às 03:00, usando $launcher"
