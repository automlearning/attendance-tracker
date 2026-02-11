@echo off
REM Attendance Tracker - OneDrive Backup Script (Batch wrapper)
REM Run this from Task Scheduler for automated daily backups

REM Set your configuration here or use environment variables
REM SET ATTENDANCE_API_URL=https://your-app.railway.app
REM SET BACKUP_SECRET=your-secret-key

powershell -ExecutionPolicy Bypass -File "%~dp0backup-to-onedrive.ps1"
