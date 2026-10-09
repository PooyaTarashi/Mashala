from django.contrib.auth.models import AbstractUser
from django.db import models
import uuid

class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account_number = models.CharField(max_length=50, unique=True, blank=True)
    balance = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    status = models.CharField(
        max_length=20,
        choices=[
            ('active', 'Active'),
            ('frozen', 'Frozen'),
            ('closed', 'Closed'),
        ],
        default='active',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users'

    def __str__(self):
        return "{} ({})".format(self.username, self.account_number)
    
    def save(self, *args, **kwargs):
        if not self.account_number:
            self.account_number = self.generate_account_number()
        super().save(*args, **kwargs)

    @staticmethod
    def generate_account_number():
        while True:
            account_number = f"ACC{uuid.uuid4().hex.upper()}{uuid.uuid4().hex[:14].upper()}"
            if not User.objects.filter(account_number=account_number).exists():
                return account_number