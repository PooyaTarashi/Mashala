from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.generics import ListAPIView
from rest_framework.filters import OrderingFilter
from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from decimal import Decimal
from .models import Bill, Transaction, LoanPlan, LoanRequest
from users.models import User
from .serializers import AccountBalanceSerializer, BillSerializer, TransferMoneySerializer
from .serializers import TransactionSerializer, PayBillSerializer, LoanPlanSerializer, RequestLoanSerializer
from django.utils import timezone

class AccountBalanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        serializer = AccountBalanceSerializer(user)
        return Response({
            'balance': serializer.data,
            'message': 'Balance retrieved successfully'
        }, status=status.HTTP_200_OK)
    
class TransactionHistoryView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['transaction_type', 'category', 'status']
    ordering_fields = ['created_at', 'amount']
    ordering = ['-created_at']  # Default ordering
    
    def get_queryset(self):
        user = self.request.user
        queryset = Transaction.objects.filter(user=user)
        
        # Date range filtering
        start_date = self.request.query_params.get('start_date', None)
        end_date = self.request.query_params.get('end_date', None)
        
        if start_date and end_date:
            queryset = queryset.filter(created_at__date__gte=start_date, 
                                       created_at__date__lte=end_date)
        
        # Limit parameter (handled by pagination, but can add custom logic)
        limit = self.request.query_params.get('limit', None)
        if limit:
            queryset = queryset[:int(limit)]
            
        return queryset
    
class TransferMoneyView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = TransferMoneySerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'error': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        sender = request.user
        recipient_account = serializer.validated_data['recipient_account']
        amount = serializer.validated_data['amount']
        description = serializer.validated_data.get('description', '')
        
        # Validate sender account status
        if sender.status != 'active':
            return Response({
                'error': 'Your account is not active'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Check if transferring to self
        if sender.account_number == recipient_account:
            return Response({
                'error': 'Cannot transfer to your own account'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check sufficient balance
        if sender.balance < amount:
            return Response({
                'error': 'Insufficient balance'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get recipient
        try:
            recipient = User.objects.select_for_update().get(
                account_number=recipient_account
            )
        except User.DoesNotExist:
            return Response({
                'error': 'Recipient account not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Validate recipient account status
        if recipient.status != 'active':
            return Response({
                'error': 'Recipient account is not active'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Lock sender for update
        sender = User.objects.select_for_update().get(pk=sender.pk)
        
        # Perform transfer
        sender.balance -= amount
        recipient.balance += amount
        
        sender.save()
        recipient.save()
        
        # Create debit transaction for sender
        debit_transaction = Transaction.objects.create(
            user=sender,
            transaction_type='debit',
            amount=amount,
            description=description or f'Transfer to {recipient_account}',
            recipient_account=recipient_account,
            category='transfer',
            status='completed'
        )
        
        # Create credit transaction for recipient
        credit_transaction = Transaction.objects.create(
            user=recipient,
            transaction_type='credit',
            amount=amount,
            description=description or f'Transfer from {sender.account_number}',
            recipient_account=sender.account_number,
            category='transfer',
            status='completed'
        )
        
        return Response({
            'message': 'Transfer successful',
            'transaction': {
                'id': str(debit_transaction.id),
                'amount': str(amount),
                'recipient_account': recipient_account,
                'new_balance': str(sender.balance),
                'timestamp': debit_transaction.created_at
            }
        }, status=status.HTTP_200_OK)
    
class BillHistoryView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = BillSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['bill_type', 'status']
    ordering_fields = ['created_at', 'due_date', 'amount']
    ordering = ['-created_at']  # Default ordering
    
    def get_queryset(self):
        user = self.request.user
        queryset = Bill.objects.filter(user=user)
        
        # Date range filtering
        start_date = self.request.query_params.get('start_date', None)
        end_date = self.request.query_params.get('end_date', None)
        
        if start_date and end_date:
            queryset = queryset.filter(due_date__gte=start_date, 
                                       due_date__lte=end_date)
        
        # Limit parameter
        limit = self.request.query_params.get('limit', None)
        if limit:
            queryset = queryset[:int(limit)]
            
        return queryset

class PayBillView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = PayBillSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'error': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user = request.user
        bill_id = serializer.validated_data['bill_id']
        
        # Validate user account status
        if user.status != 'active':
            return Response({
                'error': 'Your account is not active'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get bill
        try:
            bill = Bill.objects.select_for_update().get(id=bill_id)
        except Bill.DoesNotExist:
            return Response({
                'error': 'Bill not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Check if bill belongs to user
        if bill.user != user:
            return Response({
                'error': 'This bill does not belong to you'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Check if bill is already paid
        if bill.status == 'paid':
            return Response({
                'error': 'Bill is already paid'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check sufficient balance
        if user.balance < bill.amount:
            return Response({
                'error': 'Insufficient balance'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Lock user for update
        user = User.objects.select_for_update().get(pk=user.pk)
        
        # Perform payment
        user.balance -= bill.amount
        user.save()
        
        # Update bill status
        bill.status = 'paid'
        bill.paid_at = timezone.now()
        bill.save()
        
        # Create transaction record
        bill_transaction = Transaction.objects.create(
            user=user,
            transaction_type='debit',
            amount=bill.amount,
            description=f'Bill payment for {bill.bill_type} - {bill.provider}',
            category='bill_payment',
            status='completed'
        )
        
        return Response({
            'message': 'Bill paid successfully',
            'transaction': {
                'id': str(bill_transaction.id),
                'amount': str(bill.amount),
                'bill_type': bill.bill_type,
                'provider': bill.provider,
                'new_balance': str(user.balance),
                'timestamp': bill_transaction.created_at
            }
        }, status=status.HTTP_200_OK)

class LoanPlanListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = LoanPlanSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['loan_type', 'is_active']
    ordering_fields = ['created_at', 'interest_rate', 'min_amount', 'max_amount']
    ordering = ['interest_rate']  # Default ordering
    
    def get_queryset(self):
        queryset = LoanPlan.objects.filter(is_active=True)
        
        # Min/Max amount filtering
        min_amount = self.request.query_params.get('min_amount', None)
        max_amount = self.request.query_params.get('max_amount', None)
        
        if min_amount:
            queryset = queryset.filter(min_amount__gte=min_amount)
        if max_amount:
            queryset = queryset.filter(max_amount__lte=max_amount)
        
        # Limit parameter
        limit = self.request.query_params.get('limit', None)
        if limit:
            queryset = queryset[:int(limit)]
            
        return queryset

class RequestLoanView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = RequestLoanSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'error': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user = request.user
        loan_type = serializer.validated_data['loan_type']
        amount = serializer.validated_data['amount']
        salary = serializer.validated_data['salary']
        description = serializer.validated_data.get('description', '')
        
        # Validate user account status
        if user.status != 'active':
            return Response({
                'error': 'Your account is not active'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Check if there's an active loan plan for this type
        loan_plan = LoanPlan.objects.filter(
            loan_type=loan_type,
            is_active=True,
            min_amount__lte=amount,
            max_amount__gte=amount
        ).first()
        
        if not loan_plan:
            return Response({
                'error': f'No active loan plan available for {loan_type} with amount {amount}'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Create loan request
        loan_request = LoanRequest.objects.create(
            user=user,
            loan_type=loan_type,
            amount=amount,
            salary=salary,
            description=description,
            status='pending'
        )
        
        return Response({
            'message': 'Loan request submitted successfully',
            'loan_request': {
                'id': str(loan_request.id),
                'loan_type': loan_request.loan_type,
                'amount': str(amount),
                'salary': str(salary),
                'status': loan_request.status,
                'timestamp': loan_request.created_at
            }
        }, status=status.HTTP_201_CREATED)