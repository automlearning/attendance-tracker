# Attendance Tracker - OneDrive Backup Script
# This script downloads a full database backup and saves it to OneDrive

param(
    [string]$ApiUrl = $env:ATTENDANCE_API_URL,
    [string]$BackupSecret = $env:BACKUP_SECRET,
    [string]$OneDrivePath = "$env:OneDrive\AttendanceBackups"
)

# Validate parameters
if (-not $ApiUrl) {
    Write-Host "Error: API URL not set. Set ATTENDANCE_API_URL environment variable or pass -ApiUrl parameter" -ForegroundColor Red
    Write-Host "Example: .\backup-to-onedrive.ps1 -ApiUrl 'https://your-app.railway.app'" -ForegroundColor Yellow
    exit 1
}

if (-not $BackupSecret) {
    Write-Host "Error: Backup secret not set. Set BACKUP_SECRET environment variable or pass -BackupSecret parameter" -ForegroundColor Red
    exit 1
}

# Create backup directory if it doesn't exist
if (-not (Test-Path $OneDrivePath)) {
    New-Item -ItemType Directory -Path $OneDrivePath -Force | Out-Null
    Write-Host "Created backup directory: $OneDrivePath" -ForegroundColor Green
}

# Generate filename with timestamp
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$filename = "attendance_backup_$timestamp.json"
$outputPath = Join-Path $OneDrivePath $filename

Write-Host "Starting backup from $ApiUrl..." -ForegroundColor Cyan

try {
    # Call the backup API
    $headers = @{
        "X-Backup-Secret" = $BackupSecret
    }

    $response = Invoke-RestMethod -Uri "$ApiUrl/api/v1/backup/export/full" -Headers $headers -Method Get

    # Save to file
    $response | ConvertTo-Json -Depth 10 | Out-File -FilePath $outputPath -Encoding UTF8

    Write-Host "Backup saved successfully!" -ForegroundColor Green
    Write-Host "Location: $outputPath" -ForegroundColor Green

    # Get file size
    $fileSize = (Get-Item $outputPath).Length
    Write-Host "Size: $([math]::Round($fileSize / 1KB, 2)) KB" -ForegroundColor Gray

    # Cleanup old backups (keep last 30)
    $backups = Get-ChildItem -Path $OneDrivePath -Filter "attendance_backup_*.json" | Sort-Object LastWriteTime -Descending
    if ($backups.Count -gt 30) {
        $toDelete = $backups | Select-Object -Skip 30
        $toDelete | Remove-Item -Force
        Write-Host "Cleaned up $($toDelete.Count) old backup(s)" -ForegroundColor Gray
    }

} catch {
    Write-Host "Backup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`nBackup completed at $(Get-Date)" -ForegroundColor Cyan
