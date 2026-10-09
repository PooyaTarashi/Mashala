from rest_framework import serializers
from users.models import User
from .models import Bill, Transaction, LoanPlan, LoanRequest

class AccountBalanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('account_number', 'balance', 'status')
        read_only_fields = ('account_number', 'balance', 'status')

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            'id', 
            'transaction_type', 
            'amount', 
            'description', 
            'recipient_account',
            'category', 
            'status', 
            'created_at'
        ]
        read_only_fields = fields

class TransferMoneySerializer(serializers.Serializer):
    recipient_account = serializers.CharField(max_length=50)
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=0.01)
    description = serializers.CharField(required=False, allow_blank=True)
    
    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero")
        return value
    
    def validate_recipient_account(self, value):
        from users.models import User
        if not User.objects.filter(account_number=value).exists():
            raise serializers.ValidationError("Recipient account not found")
        return value
    
class BillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bill
        fields = [
            'id',
            'bill_type',
            'provider',
            'account_number',
            'amount',
            'due_date',
            'status',
            'created_at',
            'paid_at'
        ]
        read_only_fields = fields

class PayBillSerializer(serializers.Serializer):
    bill_id = serializers.UUIDField()
    
    def validate_bill_id(self, value):
        if not Bill.objects.filter(id=value).exists():
            raise serializers.ValidationError("Bill not found")
        return value

class LoanPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanPlan
        fields = [
            'id',
            'title',
            'loan_type',
            'min_amount',
            'max_amount',
            'interest_rate',
            'term_months',
            'description',
            'is_active',
            'created_at'
        ]
        read_only_fields = fields

class RequestLoanSerializer(serializers.Serializer):
    loan_type = serializers.ChoiceField(choices=[('car', 'Car Loan'), ('personal', 'Personal Loan'), ('home', 'Home Loan')])
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=0.01)
    salary = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0.01)
    description = serializers.CharField(required=False, allow_blank=True)
    
    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero")
        return value
    
    def validate_salary(self, value):
        if value <= 0:
            raise serializers.ValidationError("Salary must be greater than zero")
        return value