from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'account_number', 'balance_display', 'status_badge', 'is_staff', 'created_at']
    list_filter = ['status', 'is_staff', 'is_superuser', 'is_active', 'created_at']
    search_fields = ['username', 'email', 'account_number', 'first_name', 'last_name']
    readonly_fields = ['id', 'account_number', 'created_at', 'updated_at', 'last_login', 'date_joined']
    actions = ['add_money', 'freeze_accounts', 'activate_accounts']
    
    fieldsets = (
        ('Account Info', {
            'fields': ('id', 'username', 'email', 'password')
        }),
        ('Personal Info', {
            'fields': ('first_name', 'last_name')
        }),
        ('Banking Details', {
            'fields': ('account_number', 'balance', 'status')
        }),
        ('Permissions', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at', 'last_login', 'date_joined')
        }),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'password1', 'password2', 'balance', 'status'),
        }),
    )
    
    def balance_display(self, obj):
        return f"${obj.balance:,.2f}"
    balance_display.short_description = 'Balance'
    balance_display.admin_order_field = 'balance'
    
    def status_badge(self, obj):
        colors = {
            'active': 'green',
            'frozen': 'orange',
            'closed': 'red',
        }
        return format_html(
            '<span style="color: {};">{}</span>',
            colors.get(obj.status, 'black'),
            obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def add_money(self, request, queryset):
        """Custom action to add money - will prompt for amount via admin interface"""
        # Note: This is a placeholder. For actual implementation, you'd want to:
        # 1. Create a custom admin form to get the amount
        # 2. Or use django-admin-action-forms package
        # For now, this demonstrates the action registration
        self.message_user(request, "To add money, edit the user's balance field directly or create a custom form.")
    add_money.short_description = "Add money to accounts (edit balance field)"
    
    def freeze_accounts(self, request, queryset):
        queryset.update(status='frozen')
        self.message_user(request, f"{queryset.count()} accounts frozen.")
    freeze_accounts.short_description = "Freeze selected accounts"
    
    def activate_accounts(self, request, queryset):
        queryset.update(status='active')
        self.message_user(request, f"{queryset.count()} accounts activated.")
    activate_accounts.short_description = "Activate selected accounts"
