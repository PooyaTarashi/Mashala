"""
Script to fix migration inconsistencies by clearing migration history
and reapplying migrations in the correct order.
"""
import os
import sys
import django

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connection
from django.db.migrations.recorder import MigrationRecorder

def clear_migration_history(database='users_db'):
    """Clear the django_migrations table for a specific database"""
    print(f"\nClearing migration history for database: {database}")
    
    recorder = MigrationRecorder(connection=connection)
    with connection.cursor() as cursor:
        # Check if django_migrations table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'django_migrations'
            );
        """)
        exists = cursor.fetchone()[0]
        
        if exists:
            cursor.execute("DELETE FROM django_migrations;")
            print(f"✓ Cleared {cursor.rowcount} migration records")
        else:
            print("✓ django_migrations table doesn't exist yet")

def check_tables(database='users_db'):
    """Check which tables exist in the database"""
    print(f"\nChecking tables in database: {database}")
    
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        tables = cursor.fetchall()
        
        if tables:
            print(f"Found {len(tables)} tables:")
            for table in tables:
                print(f"  - {table[0]}")
        else:
            print("No tables found in database")
        
        return [table[0] for table in tables]

if __name__ == '__main__':
    # Use the users_db connection
    from django.db import connections
    connection = connections['users_db']
    
    print("=" * 60)
    print("Django Tables Check")
    print("=" * 60)
    
    # Check existing tables
    existing_tables = check_tables('users_db')
