"""
Database Migration Helper Script

This script helps apply SQL migrations to your database.
Supports both SQLite (local) and PostgreSQL (Railway).

Usage:
    python apply_migration.py 001_add_has_seen_intro.sql
    python apply_migration.py 001_add_has_seen_intro.sql --dry-run
"""

import sys
import os
from pathlib import Path
from sqlalchemy import create_engine, text
from app.config import settings

def apply_migration(migration_file: str, dry_run: bool = False):
    """Apply a SQL migration file to the database."""

    # Get migration file path
    migrations_dir = Path(__file__).parent / "migrations"
    migration_path = migrations_dir / migration_file

    if not migration_path.exists():
        print(f"❌ Migration file not found: {migration_path}")
        return False

    # Read migration SQL
    with open(migration_path, 'r') as f:
        sql_content = f.read()

    print(f"📄 Migration file: {migration_file}")
    print(f"🗄️  Database: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else 'SQLite'}")
    print("\n" + "="*60)
    print("SQL to be executed:")
    print("="*60)
    print(sql_content)
    print("="*60 + "\n")

    if dry_run:
        print("🔍 DRY RUN - No changes made to database")
        return True

    # Confirm before applying
    response = input("Apply this migration? (yes/no): ").strip().lower()
    if response not in ['yes', 'y']:
        print("❌ Migration cancelled")
        return False

    try:
        # Create engine (handle both asyncpg and psycopg2)
        db_url = settings.DATABASE_URL
        if '+asyncpg' in db_url:
            db_url = db_url.replace('+asyncpg', '')

        engine = create_engine(db_url)

        # Execute migration
        with engine.connect() as conn:
            # Split by semicolons and execute each statement
            statements = [s.strip() for s in sql_content.split(';') if s.strip() and not s.strip().startswith('--')]

            for statement in statements:
                if statement:
                    print(f"Executing: {statement[:50]}...")
                    conn.execute(text(statement))

            conn.commit()

        print("\n✅ Migration applied successfully!")
        return True

    except Exception as e:
        print(f"\n❌ Migration failed: {str(e)}")
        return False

def list_migrations():
    """List all available migrations."""
    migrations_dir = Path(__file__).parent / "migrations"
    if not migrations_dir.exists():
        print("No migrations directory found")
        return

    sql_files = sorted(migrations_dir.glob("*.sql"))
    if not sql_files:
        print("No migration files found")
        return

    print("\n📋 Available migrations:")
    print("="*60)
    for sql_file in sql_files:
        print(f"  • {sql_file.name}")
    print("="*60 + "\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python apply_migration.py <migration_file.sql> [--dry-run]")
        print("\nOptions:")
        print("  --list      List all available migrations")
        print("  --dry-run   Show what would be executed without applying")
        list_migrations()
        sys.exit(1)

    if sys.argv[1] == "--list":
        list_migrations()
        sys.exit(0)

    migration_file = sys.argv[1]
    dry_run = "--dry-run" in sys.argv

    success = apply_migration(migration_file, dry_run)
    sys.exit(0 if success else 1)
