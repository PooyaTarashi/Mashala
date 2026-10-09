"""
Script to check tables in accounts_db database.
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

def check_tables(database='accounts_db'):
    """Check which tables exist in the database"""
    print(f"\n{'='*60}")
    print(f"Checking tables in database: {database}")
    print(f"{'='*60}\n")
    
    connection = connections[database]
    
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
    check_tables('accounts_db')
