import os
import sys
import django

# Add the parent directory to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from users.models import User

def delete_all_users():
    """Delete all users from the database"""
    user_count = User.objects.count()
    
    if user_count == 0:
        print("No users found in the database.")
        return
    
    print(f"Found {user_count} user(s) in the database.")
    
    # Ask for confirmation
    confirmation = input(f"Are you sure you want to delete all {user_count} user(s)? (yes/no): ")
    
    if confirmation.lower() == 'yes':
        deleted = User.objects.all().delete()
        print(f"✓ Successfully deleted {deleted[0]} user(s)")
    else:
        print("Operation cancelled.")

if __name__ == '__main__':
    delete_all_users()
