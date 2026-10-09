from django.db import models
from django.conf import settings
from django.utils import timezone
import uuid
from datetime import timedelta

class ActionSession(models.Model):
    """
    Tracks form submission sessions
    Prevents double-submits, enables revocation, provides audit trail
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('submitted', 'Submitted'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='action_sessions'
    )
    action_type = models.CharField(max_length=50)  # pay_bill, transfer_money, request_loan
    form_data = models.JSONField()  # The form template that was sent to user
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    submitted_at = models.DateTimeField(null=True, blank=True)
    
    # Tracking
    submitted_count = models.IntegerField(default=0)  # Prevent double-submit

    class Meta:
        db_table = 'action_sessions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['expires_at']),
            models.Index(fields=['created_at']),
        ]

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=30)
        super().save(*args, **kwargs)

    def is_expired(self):
        return timezone.now() > self.expires_at

    def can_submit(self):
        """Check if session can be submitted"""
        return (
            self.status == 'pending' and
            not self.is_expired() and
            self.submitted_count == 0
        )

    def mark_submitted(self):
        """Mark session as submitted"""
        self.status = 'submitted'
        self.submitted_at = timezone.now()
        self.submitted_count += 1
        self.save()

    def __str__(self):
        return f"{self.action_type} - {self.status}"