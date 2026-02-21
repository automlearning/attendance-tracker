# Database Migrations

This directory contains SQL migration scripts for database schema changes.

## How to Apply Migrations

### Railway (Production)

**Option 1: Via Railway Dashboard**
1. Go to [Railway Dashboard](https://railway.app/)
2. Open your project
3. Click on your PostgreSQL service
4. Go to **Data** → **Query** tab
5. Copy and paste the SQL from the migration file
6. Click **Execute**

**Option 2: Via Railway CLI**
```bash
# Install Railway CLI (if not already installed)
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project (first time only)
railway link

# Apply migration
railway run psql < migrations/001_add_has_seen_intro.sql
```

### Local Development (SQLite)

```bash
# From the backend directory
sqlite3 attendance.db < migrations/001_add_has_seen_intro.sql
```

### Local Development (PostgreSQL)

```bash
# From the backend directory
psql -d your_database_name < migrations/001_add_has_seen_intro.sql
```

## Migration Files

- `001_add_has_seen_intro.sql` - Adds has_seen_intro field to track first-time users

## Best Practices

1. **Always test migrations locally first**
2. **Backup production database before applying**
3. **Use transactions when possible**
4. **Keep migrations small and focused**
5. **Never edit already-applied migrations** (create new ones instead)

## Migration Naming Convention

```
<number>_<description>.sql
```

Examples:
- `001_add_has_seen_intro.sql`
- `002_add_user_preferences.sql`
- `003_create_notifications_table.sql`
