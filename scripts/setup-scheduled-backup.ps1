# Setup Scheduled Backup Task for Windows Task Scheduler
# Run this script as Administrator to create a daily backup task

param(
    [string]$ApiUrl,
    [string]$BackupSecret,
    [string]$Time = "02:00"  # Default: 2 AM
)

if (-not $ApiUrl -or -not $BackupSecret) {
    Write-Host "Usage: .\setup-scheduled-backup.ps1 -ApiUrl 'https://your-app.railway.app' -BackupSecret 'your-secret'" -ForegroundColor Yellow
    exit 1
}

$scriptPath = Join-Path $PSScriptRoot "backup-to-onedrive.ps1"
$taskName = "AttendanceTrackerBackup"

# Create the scheduled task action
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`" -ApiUrl `"$ApiUrl`" -BackupSecret `"$BackupSecret`""

# Trigger daily at specified time
$trigger = New-ScheduledTaskTrigger -Daily -At $Time

# Run whether user is logged in or not
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Highest

# Settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Register the task
try {
    # Remove existing task if it exists
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Daily backup of Attendance Tracker data to OneDrive"

    Write-Host "Scheduled task created successfully!" -ForegroundColor Green
    Write-Host "Task Name: $taskName" -ForegroundColor Cyan
    Write-Host "Schedule: Daily at $Time" -ForegroundColor Cyan
    Write-Host "Backup Location: $env:OneDrive\AttendanceBackups" -ForegroundColor Cyan
} catch {
    Write-Host "Failed to create scheduled task: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure you run this script as Administrator" -ForegroundColor Yellow
    exit 1
}
