"""
Script to completely reset the users_db database.
This will drop all tables and run migrations from scratch.
"""
import os
import sys
import django

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connections

def drop_all_tables(database='users_db'):
    """Drop all tables in the database"""
    print(f"\n{'='*60}")
    print(f"Dropping all tables in {database}")
    print(f"{'='*60}\n")
    
    connection = connections[database]
    
    with connection.cursor() as cursor:
        # Get all tables
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE';
        """)
        tables = cursor.fetchall()
        
        if not tables:
            print("No tables found to drop.")
            return
        
        print(f"Found {len(tables)} tables to drop:")
        for table in tables:
            print(f"  - {table[0]}")
        
        # Drop all tables
        for table in tables:
            cursor.execute(f'DROP TABLE IF EXISTS "{table[0]}" CASCADE;')
            print(f"✓ Dropped {table[0]}")
        
        print(f"\n✓ All tables dropped successfully!")

if __name__ == '__main__':
    drop_all_tables('users_db')
    
    print(f"\n{'='*60}")
    print("Next steps:")
    print("=" * 60)
    print("Run these commands in order:")
    print("1. python manage.py migrate contenttypes --database=users_db")
    print("2. python manage.py migrate auth --database=users_db")
    print("3. python manage.py migrate admin --database=users_db")
    print("4. python manage.py migrate sessions --database=users_db")
    print("5. python manage.py migrate user_service --database=users_db")
    print("=" * 60)
