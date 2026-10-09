from django.db import models
from django.conf import settings
import uuid

class Transaction(models.Model):
    TRANSACTION_TYPES = [
        ('debit', 'Debit'),
        ('credit', 'Credit'),
    ]

    CATEGORIES = [
        ('bill_payment', 'Bill Payment'),
        ('transfer', 'Transfer'),
        ('loan', 'Loan'),
        ('deposit', 'Deposit'),
        ('withdrawal', 'Withdrawal'),        
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='transactions'
    )
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    description = models.TextField(blank=True)
    recipient_account = models.CharField(max_length=50, blank=True, null=True)
    category = models.CharField(max_length=50, choices=CATEGORIES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'transaction'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['status']),
        ]


    def __str__(self):
        return f"{self.transaction_type} - ${self.amount} - {self.created_at.date()}"
    

class Bill(models.Model):
    """
    Utility bills for tracking
    """
    BILL_TYPES = [
        ('internet', 'Internet'),
        ('electricity', 'Electricity'),
        ('water', 'Water'),
        ('gas', 'Gas'),
    ]
    
    STATUS_CHOICES = [
        ('unpaid', 'Unpaid'),
        ('paid', 'Paid'),
        ('overdue', 'Overdue'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='bills'
    )
    bill_type = models.CharField(max_length=50, choices=BILL_TYPES)
    provider = models.CharField(max_length=100, blank=True)
    account_number = models.CharField(max_length=100, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='unpaid')
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'bills'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.bill_type} - ${self.amount} - {self.status}"


class LoanPlan(models.Model):
    """
    Available loan plans (predefined by bank)
    """
    LOAN_TYPES = [
        ('car', 'Car Loan'),
        ('personal', 'Personal Loan'),
        ('home', 'Home Loan'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    loan_type = models.CharField(max_length=50, choices=LOAN_TYPES)
    min_amount = models.DecimalField(max_digits=15, decimal_places=2)
    max_amount = models.DecimalField(max_digits=15, decimal_places=2)
    interest_rate = models.DecimalField(max_digits=5, decimal_places=2)
    term_months = models.IntegerField()
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loan_plans'

    def __str__(self):
        return f"{self.title} - {self.interest_rate}%"


class LoanRequest(models.Model):
    """
    User loan applications
    """
    LOAN_TYPES = [
        ('car', 'Car Loan'),
        ('personal', 'Personal Loan'),
        ('home', 'Home Loan'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='loan_requests'
    )
    loan_type = models.CharField(max_length=50, choices=LOAN_TYPES)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    salary = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'loan_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.loan_type} - ${self.amount} - {self.status}"