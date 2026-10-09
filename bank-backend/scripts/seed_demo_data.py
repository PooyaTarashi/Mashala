"""
Seed script to create initial demo users, accounts, loan plans, and bills.
Can be run safely multiple times (idempotent).
"""

import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from users.models import User
from banking.models import Bill, LoanPlan


def seed():
    # 1. Main Demo User
    if not User.objects.filter(username='demo').exists():
        demo = User.objects.create_user(
            username='demo',
            email='demo@example.com',
            password='password123',
            first_name='Demo',
            last_name='User'
        )
        demo.balance = 5000.00
        demo.status = 'active'
        demo.save()
        print(f"Created demo user 'demo' with account {demo.account_number} and balance $5000.00")
    else:
        demo = User.objects.get(username='demo')
        print(f"Demo user 'demo' already exists (Account: {demo.account_number})")

    # 2. Recipient User (to test money transfers)
    if not User.objects.filter(username='recipient').exists():
        recipient = User.objects.create_user(
            username='recipient',
            email='recipient@example.com',
            password='password123',
            first_name='Alice',
            last_name='Smith'
        )
        recipient.balance = 1000.00
        recipient.status = 'active'
        recipient.save()
        print(f"Created recipient user 'recipient' with account {recipient.account_number} and balance $1000.00")
    else:
        recipient = User.objects.get(username='recipient')
        print(f"Recipient user 'recipient' already exists (Account: {recipient.account_number})")

    # 3. Available Loan Plans
    if not LoanPlan.objects.filter(loan_type='personal').exists():
        LoanPlan.objects.create(
            title='Quick Personal Loan',
            loan_type='personal',
            min_amount=100.00,
            max_amount=10000.00,
            interest_rate=5.50,
            term_months=12,
            description='Standard personal loan with fixed interest',
            is_active=True
        )
        print("Created personal loan plan")

    if not LoanPlan.objects.filter(loan_type='car').exists():
        LoanPlan.objects.create(
            title='Auto Financing Plan',
            loan_type='car',
            min_amount=1000.00,
            max_amount=50000.00,
            interest_rate=4.20,
            term_months=36,
            description='Auto loan for new and used vehicles',
            is_active=True
        )
        print("Created car loan plan")

    if not LoanPlan.objects.filter(loan_type='home').exists():
        LoanPlan.objects.create(
            title='Home Mortgage Plan',
            loan_type='home',
            min_amount=10000.00,
            max_amount=500000.00,
            interest_rate=3.80,
            term_months=240,
            description='Fixed-rate home mortgage',
            is_active=True
        )
        print("Created home loan plan")

    # 4. Sample Bills for demo user
    if not Bill.objects.filter(user=demo, bill_type='internet').exists():
        Bill.objects.create(
            user=demo,
            bill_type='internet',
            provider='FastNet ISP',
            account_number='FN-98213',
            amount=50.00,
            status='unpaid'
        )
        print("Created sample internet bill")

    if not Bill.objects.filter(user=demo, bill_type='electricity').exists():
        Bill.objects.create(
            user=demo,
            bill_type='electricity',
            provider='City Power',
            account_number='CP-44102',
            amount=120.00,
            status='unpaid'
        )
        print("Created sample electricity bill")

    print("\nInitial demo data seeded successfully!")


if __name__ == '__main__':
    seed()
