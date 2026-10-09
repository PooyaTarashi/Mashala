from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from .models import Transaction, Bill, LoanPlan, LoanRequest


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'transaction_type', 'amount', 'category', 'status', 'created_at']
    list_filter = ['transaction_type', 'category', 'status', 'created_at']
    search_fields = ['user__username', 'user__account_number', 'recipient_account', 'description']
    readonly_fields = ['id', 'created_at']
    date_hierarchy = 'created_at'
    
    fieldsets = (
        ('Transaction Info', {
            'fields': ('id', 'user', 'transaction_type', 'amount', 'category', 'status')
        }),
        ('Details', {
            'fields': ('description', 'recipient_account', 'metadata')
        }),
        ('Timestamps', {
            'fields': ('created_at',)
        }),
    )


@admin.register(Bill)
class BillAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'bill_type', 'provider', 'amount', 'due_date', 'status_badge', 'created_at']
    list_filter = ['bill_type', 'status', 'created_at']
    search_fields = ['user__username', 'user__account_number', 'provider', 'account_number']
    readonly_fields = ['id', 'created_at', 'paid_at']
    date_hierarchy = 'created_at'
    actions = ['mark_as_paid', 'mark_as_overdue']
    
    fieldsets = (
        ('Bill Info', {
            'fields': ('id', 'user', 'bill_type', 'provider', 'account_number')
        }),
        ('Payment Details', {
            'fields': ('amount', 'due_date', 'status')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'paid_at')
        }),
    )
    
    def status_badge(self, obj):
        colors = {
            'paid': 'green',
            'unpaid': 'orange',
            'overdue': 'red',
        }
        return format_html(
            '<span style="color: {};">{}</span>',
            colors.get(obj.status, 'black'),
            obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def mark_as_paid(self, request, queryset):
        queryset.update(status='paid', paid_at=timezone.now())
        self.message_user(request, f"{queryset.count()} bills marked as paid.")
    mark_as_paid.short_description = "Mark selected bills as paid"
    
    def mark_as_overdue(self, request, queryset):
        queryset.update(status='overdue')
        self.message_user(request, f"{queryset.count()} bills marked as overdue.")
    mark_as_overdue.short_description = "Mark selected bills as overdue"


@admin.register(LoanPlan)
class LoanPlanAdmin(admin.ModelAdmin):
    list_display = ['title', 'loan_type', 'min_amount', 'max_amount', 'interest_rate', 'term_months', 'is_active']
    list_filter = ['loan_type', 'is_active', 'created_at']
    search_fields = ['title', 'description']
    readonly_fields = ['id', 'created_at']
    list_editable = ['is_active']
    
    fieldsets = (
        ('Plan Info', {
            'fields': ('id', 'title', 'loan_type', 'description')
        }),
        ('Loan Terms', {
            'fields': ('min_amount', 'max_amount', 'interest_rate', 'term_months')
        }),
        ('Status', {
            'fields': ('is_active', 'created_at')
        }),
    )


@admin.register(LoanRequest)
class LoanRequestAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'loan_type', 'amount', 'salary', 'status_badge', 'created_at']
    list_filter = ['loan_type', 'status', 'created_at']
    search_fields = ['user__username', 'user__account_number', 'description']
    readonly_fields = ['id', 'created_at', 'reviewed_at']
    date_hierarchy = 'created_at'
    actions = ['approve_requests', 'reject_requests']
    
    fieldsets = (
        ('Request Info', {
            'fields': ('id', 'user', 'loan_type', 'amount', 'salary')
        }),
        ('Details', {
            'fields': ('description', 'status')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'reviewed_at')
        }),
    )
    
    def status_badge(self, obj):
        colors = {
            'approved': 'green',
            'pending': 'orange',
            'rejected': 'red',
        }
        return format_html(
            '<span style="color: {};">{}</span>',
            colors.get(obj.status, 'black'),
            obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def approve_requests(self, request, queryset):
        queryset.update(status='approved', reviewed_at=timezone.now())
        self.message_user(request, f"{queryset.count()} loan requests approved.")
    approve_requests.short_description = "Approve selected loan requests"
    
    def reject_requests(self, request, queryset):
        queryset.update(status='rejected', reviewed_at=timezone.now())
        self.message_user(request, f"{queryset.count()} loan requests rejected.")
    reject_requests.short_description = "Reject selected loan requests"
