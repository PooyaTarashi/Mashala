from django.contrib import admin
from django.utils.html import format_html
from .models import ActionSession


@admin.register(ActionSession)
class ActionSessionAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'action_type', 'status_badge', 'submitted_count', 'created_at', 'expires_at']
    list_filter = ['action_type', 'status', 'created_at']
    search_fields = ['user__username', 'user__account_number', 'action_type']
    readonly_fields = ['id', 'created_at', 'submitted_at', 'submitted_count']
    date_hierarchy = 'created_at'
    actions = ['cancel_sessions', 'expire_sessions']
    
    fieldsets = (
        ('Session Info', {
            'fields': ('id', 'user', 'action_type', 'status')
        }),
        ('Form Data', {
            'fields': ('form_data',)
        }),
        ('Tracking', {
            'fields': ('submitted_count', 'created_at', 'submitted_at', 'expires_at')
        }),
    )
    
    def status_badge(self, obj):
        colors = {
            'submitted': 'green',
            'pending': 'orange',
            'expired': 'gray',
            'cancelled': 'red',
        }
        return format_html(
            '<span style="color: {};">{}</span>',
            colors.get(obj.status, 'black'),
            obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def cancel_sessions(self, request, queryset):
        queryset.update(status='cancelled')
        self.message_user(request, f"{queryset.count()} sessions cancelled.")
    cancel_sessions.short_description = "Cancel selected sessions"
    
    def expire_sessions(self, request, queryset):
        queryset.update(status='expired')
        self.message_user(request, f"{queryset.count()} sessions marked as expired.")
    expire_sessions.short_description = "Mark selected sessions as expired"
