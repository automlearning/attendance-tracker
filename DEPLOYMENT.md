# Deployment Guide - Attendance Tracker

This guide covers deploying to Railway with PostgreSQL and setting up automated backups to OneDrive.

## Prerequisites

- [Railway account](https://railway.app) (free tier available)
- Git repository (GitHub, GitLab, etc.)
- Anthropic API key (for AI features)

## Railway Deployment

### Step 1: Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your attendance tracker repository

### Step 2: Add PostgreSQL Database

1. In your Railway project, click **+ New**
2. Select **Database** → **PostgreSQL**
3. Railway will automatically provision a PostgreSQL instance

### Step 3: Deploy Backend

1. Click **+ New** → **GitHub Repo** → Select your repo
2. Configure the service:
   - **Root Directory**: `backend`
   - **Start Command**: (auto-detected from railway.toml)

3. Add environment variables (Settings → Variables):
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   SECRET_KEY=<generate-a-secure-random-string>
   REFRESH_SECRET_KEY=<generate-another-secure-random-string>
   ANTHROPIC_API_KEY=<your-anthropic-api-key>
   CORS_ORIGINS=https://your-frontend.railway.app
   BACKUP_SECRET=<generate-a-backup-secret>
   DEBUG=false
   ```

4. Generate the domain:
   - Settings → Networking → Generate Domain
   - Note the URL (e.g., `https://backend-xxx.railway.app`)

### Step 4: Deploy Frontend

1. Click **+ New** → **GitHub Repo** → Select your repo again
2. Configure the service:
   - **Root Directory**: `frontend`
   - **Start Command**: (auto-detected from railway.toml)

3. Add environment variables:
   ```
   VITE_API_URL=https://your-backend.railway.app
   ```

4. Generate domain and note the URL

### Step 5: Update CORS

Go back to your backend service and update `CORS_ORIGINS` to include your frontend domain:
```
CORS_ORIGINS=https://your-frontend.railway.app
```

## Mobile Access

Once deployed, your app is accessible from any device with internet:
- Open `https://your-frontend.railway.app` on your phone's browser
- Add to home screen for app-like experience (PWA)

## Automated Backups to OneDrive

### Option 1: Manual Backup

Run the backup script manually:

```powershell
cd scripts
.\backup-to-onedrive.ps1 -ApiUrl "https://your-backend.railway.app" -BackupSecret "your-backup-secret"
```

### Option 2: Scheduled Daily Backups

Set up Windows Task Scheduler to run backups automatically:

```powershell
# Run as Administrator
cd scripts
.\setup-scheduled-backup.ps1 -ApiUrl "https://your-backend.railway.app" -BackupSecret "your-backup-secret" -Time "02:00"
```

This creates a daily task that:
- Runs at 2 AM (customizable)
- Downloads full database backup
- Saves to `OneDrive\AttendanceBackups\`
- Keeps last 30 backups, auto-deletes older ones
- Syncs to cloud via OneDrive

### Backup File Location

Backups are saved to:
```
%OneDrive%\AttendanceBackups\attendance_backup_YYYYMMDD_HHMMSS.json
```

### Personal Data Export

Users can export their own data from the app:
- Call: `GET /api/v1/backup/export` (requires authentication)
- Returns JSON with all user's attendance records

## Railway Features

### Automatic Backups (Railway PostgreSQL)

Railway provides:
- **Point-in-time recovery**: Restore to any point in the last 7 days
- **Daily snapshots**: Automatic daily backups
- Access via Railway dashboard → Database → Backups

### Scaling

If you need more capacity:
- Upgrade plan in Railway settings
- Database scales automatically

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SECRET_KEY` | JWT signing key | Yes |
| `REFRESH_SECRET_KEY` | Refresh token signing key | Yes |
| `ANTHROPIC_API_KEY` | For AI features | Optional |
| `CORS_ORIGINS` | Comma-separated allowed origins | Yes |
| `BACKUP_SECRET` | Secret for backup API | For backups |
| `DEBUG` | Enable debug mode | No (default: false) |

## Troubleshooting

### CORS Errors
Ensure `CORS_ORIGINS` includes your frontend URL exactly (with https://).

### Database Connection Issues
Check that `DATABASE_URL` is using the Railway variable reference: `${{Postgres.DATABASE_URL}}`

### Build Failures
Check Railway build logs. Common issues:
- Missing dependencies in requirements.txt
- TypeScript errors in frontend

## Costs

Railway free tier includes:
- 500 hours of usage/month
- 1GB memory
- Shared CPU

For always-on deployment, consider the Hobby plan ($5/month).
