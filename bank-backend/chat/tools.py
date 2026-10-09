"""
Tool functions for LLM function calling in the chat system.

These tools integrate with existing Django views and provide data
for LLM analysis or generate UI components for the frontend.
"""

from typing import List, Dict, Optional
from django.test import RequestFactory
from rest_framework.request import Request
from asgiref.sync import sync_to_async
from banking.views import (
    TransactionHistoryView,
    BillHistoryView, 
    LoanPlanListView,
    AccountBalanceView
)
from banking.models import Transaction, Bill, LoanPlan
from users.models import User
from .schemas import (
    GetTransactionsInput,
    GetBillsInput,
    GenerateFormInput,
    TransactionResponse,
    BillResponse,
    LoanPlanResponse
)


# ============================================================================
# DATA FETCHING TOOLS (For LLM Analysis)
# ============================================================================

def get_transactions(user: User, params: GetTransactionsInput = None) -> List[Dict]:
    """
    Retrieves transaction history for the authenticated user.
    
    This tool fetches transaction records including:
    - Money transfers (sent and received)
    - Bill payments
    - Loan disbursements and repayments
    - Deposits and withdrawals
    
    Transactions are returned in reverse chronological order (newest first).
    The tool can filter by category and include/exclude pending transactions.
    
    Use this tool when the user asks about:
    - "Show my transactions"
    - "My transaction history"
    - "Recent payments"
    - "Where did I spend money?"
    - "Show my loan payments"
    
    Args:
        user: The authenticated user (automatically injected)
        params: Optional filters (limit, category, include_pending)
    
    Returns:
        List of transaction dictionaries with id, type, amount, description,
        category, status, and timestamp. Data is for LLM analysis only.
    """
    params = params or GetTransactionsInput()
    
    # Query transactions (this is synchronous, which is fine - it will be wrapped when called)
    transactions = Transaction.objects.filter(user=user)
    
    # Apply category filter
    if params.category:
        transactions = transactions.filter(category=params.category)
    
    # Apply pending filter
    if not params.include_pending:
        transactions = transactions.filter(status='completed')
    
    # Order by date and limit
    transactions = transactions.order_by('-created_at')[:params.limit]
    
    # Format for LLM consumption (evaluate queryset here)
    result = []
    for t in list(transactions):  # Force evaluation of queryset
        result.append({
            'id': str(t.id),
            'transaction_type': t.transaction_type,
            'amount': str(t.amount),
            'description': t.description,
            'recipient_account': t.recipient_account or '',
            'category': t.category,
            'status': t.status,
            'created_at': t.created_at.isoformat()
        })
    
    return result


def get_bills(user: User, params: GetBillsInput = None) -> List[Dict]:
    """
    Retrieves utility bills for the authenticated user.
    
    This tool returns information about the user's bills including:
    - Internet bills
    - Electricity bills
    - Water bills
    - Gas bills
    
    Bills can be filtered by payment status and bill type. Each bill includes
    the provider name, account number, amount, due date, and current status.
    
    Use this tool when the user asks about:
    - "Show my bills"
    - "What bills do I need to pay?"
    - "My unpaid bills"
    - "Electricity bill status"
    - "Overdue bills"
    - "How much do I owe?"
    
    Args:
        user: The authenticated user (automatically injected)
        params: Optional filters (status, bill_type)
    
    Returns:
        List of bill dictionaries with id, type, provider, amount, due date,
        and status. Data is for LLM analysis only.
    """
    params = params or GetBillsInput()
    
    # Query bills
    bills = Bill.objects.filter(user=user)
    
    # Apply status filter
    if params.status:
        bills = bills.filter(status=params.status)
    
    # Apply bill type filter
    if params.bill_type:
        bills = bills.filter(bill_type=params.bill_type)
    
    # Order by creation date
    bills = bills.order_by('-created_at')
    
    # Format for LLM consumption (evaluate queryset here)
    result = []
    for bill in list(bills):  # Force evaluation of queryset
        result.append({
            'id': str(bill.id),
            'bill_type': bill.bill_type,
            'provider': bill.provider,
            'account_number': bill.account_number,
            'amount': str(bill.amount),
            'due_date': bill.due_date.isoformat() if bill.due_date else None,
            'status': bill.status,
            'created_at': bill.created_at.isoformat(),
            'paid_at': bill.paid_at.isoformat() if bill.paid_at else None
        })
    
    return result


def get_loan_plans(user: User) -> List[Dict]:
    """
    Retrieves all available loan plans that the user can apply for.
    
    This tool returns information about loan products offered by the bank:
    - Car loans: For vehicle purchases with competitive rates
    - Personal loans: For general purposes with flexible terms
    - Home loans: For property purchases with long-term plans
    
    Each plan includes the interest rate, loan amount range (minimum and maximum),
    term length in months, and detailed description of the loan product.
    
    Use this tool when the user asks about:
    - "What loans are available?"
    - "Show me loan options"
    - "Car loan interest rates"
    - "I want to apply for a loan"
    - "Best loan for me"
    - "Compare loan plans"
    
    Args:
        user: The authenticated user (automatically injected)
    
    Returns:
        List of loan plan dictionaries with details about each offering
        including rates, amounts, and terms. Data is for LLM analysis only.
    """
    # Query active loan plans
    plans = LoanPlan.objects.filter(is_active=True).order_by('interest_rate')
    
    # Format for LLM consumption (evaluate queryset here)
    result = []
    for plan in list(plans):  # Force evaluation of queryset
        result.append({
            'id': str(plan.id),
            'title': plan.title,
            'loan_type': plan.loan_type,
            'min_amount': str(plan.min_amount),
            'max_amount': str(plan.max_amount),
            'interest_rate': str(plan.interest_rate),
            'term_months': plan.term_months,
            'description': plan.description
        })
    
    return result


def get_account_balance(user: User) -> Dict:
    """
    Retrieves the current account balance for the authenticated user.
    
    This tool returns the user's current account balance and account status.
    The balance is returned in USD with 2 decimal places.
    
    Use this tool when the user asks about:
    - "What's my balance?"
    - "How much money do I have?"
    - "Check my account balance"
    - "Show my current balance"
    - "Account balance"
    
    Args:
        user: The authenticated user (automatically injected)
    
    Returns:
        Dictionary with account_number, balance, currency, and status.
        Data is for LLM analysis only.
    """
    return {
        'account_number': user.account_number,
        'balance': str(user.balance),
        'currency': 'USD',
        'status': user.status,
        'last_updated': user.updated_at.isoformat() if hasattr(user, 'updated_at') else None
    }


# ============================================================================
# UI GENERATION TOOL (For Frontend Components)
# ============================================================================

def generate_form(params: GenerateFormInput) -> Dict:
    """
    Generates a dynamic form or table configuration for the React frontend.
    
    This tool creates JSON configurations that the frontend uses to render:
    - Forms: For user actions like transfers, loan applications, bill payments
    - Tables: For displaying data like transaction history, bills, loan plans
    
    Forms include field definitions, validation rules, and prefilled values.
    Tables include column definitions, API endpoints for data fetching, and
    query parameters.
    
    The generated configuration tells the frontend:
    1. What type of component to render (form or table)
    2. What fields/columns to display
    3. What API endpoint to call for submission/data
    4. What default values to prefill
    
    Use this tool when the user wants to:
    - Perform an action (transfer, apply for loan, pay bill)
    - View data in a structured format (transaction list, bill list)
    - Fill out a form with some values already known
    
    Args:
        params: Configuration parameters (form_type, prefill, api_endpoint)
    
    Returns:
        Dictionary with component type and configuration. This is sent to
        the frontend for rendering, not to the LLM for analysis.
    """
    print(f"\n[generate_form] Called with params: {params}")
    print(f"[generate_form] form_type: {params.form_type}")
    print(f"[generate_form] prefill: {params.prefill}")
    
    form_type = params.form_type
    prefill = params.prefill or {}
    api_endpoint = params.api_endpoint
    
    # Define form configurations
    form_configs = {
        'transfer_money': {
            'type': 'form',
            'title': 'Transfer Money',
            'description': 'Transfer funds to another account',
            'fields': [
                {
                    'name': 'recipient_account',
                    'type': 'text',
                    'label': 'Recipient Account Number',
                    'placeholder': 'Enter account number (e.g., ACCB7101D467EE34)',
                    'required': True,
                    'validation': {
                        'pattern': '^ACC[A-Z0-9]+$',
                        'message': 'Account number must start with ACC followed by alphanumeric characters'
                    }
                },
                {
                    'name': 'amount',
                    'type': 'number',
                    'label': 'Amount ($)',
                    'placeholder': '0.00',
                    'required': True,
                    'validation': {
                        'min': 0.01,
                        'message': 'Amount must be greater than 0'
                    }
                },
                {
                    'name': 'description',
                    'type': 'textarea',
                    'label': 'Description (Optional)',
                    'placeholder': 'What is this transfer for?',
                    'required': False,
                    'rows': 3
                }
            ],
            'submit_endpoint': '/api/banking/transfer/',
            'submit_method': 'POST',
            'submit_button_text': 'Transfer Now'
        },
        
        'loan_application': {
            'type': 'form',
            'title': 'Apply for Loan',
            'description': 'Submit your loan application',
            'fields': [
                {
                    'name': 'loan_type',
                    'type': 'select',
                    'label': 'Loan Type',
                    'required': True,
                    'options': [
                        {'value': 'personal', 'label': 'Personal Loan'},
                        {'value': 'car', 'label': 'Car Loan'},
                        {'value': 'home', 'label': 'Home Loan'}
                    ]
                },
                {
                    'name': 'amount',
                    'type': 'number',
                    'label': 'Loan Amount ($)',
                    'placeholder': '0.00',
                    'required': True,
                    'validation': {
                        'min': 1000,
                        'message': 'Minimum loan amount is $1,000'
                    }
                },
                {
                    'name': 'salary',
                    'type': 'number',
                    'label': 'Monthly Salary ($)',
                    'placeholder': '0.00',
                    'required': True,
                    'validation': {
                        'min': 0.01,
                        'message': 'Please enter your monthly salary'
                    }
                },
                {
                    'name': 'description',
                    'type': 'textarea',
                    'label': 'Purpose of Loan',
                    'placeholder': 'Explain why you need this loan',
                    'required': True,
                    'rows': 4
                }
            ],
            'submit_endpoint': '/api/banking/loans/request/',
            'submit_method': 'POST',
            'submit_button_text': 'Submit Application'
        },
        
        'bill_payment': {
            'type': 'form',
            'title': 'Pay Bill',
            'description': 'Pay your utility bill',
            'fields': [
                {
                    'name': 'bill_id',
                    'type': 'hidden',
                    'required': True
                }
            ],
            'submit_endpoint': '/api/banking/bills/pay/',
            'submit_method': 'POST',
            'submit_button_text': 'Pay Now',
            'show_confirmation': True,
            'confirmation_message': 'Are you sure you want to pay this bill?'
        },
        
        'transaction_history': {
            'type': 'table',
            'title': 'Transaction History',
            'description': 'Your recent transactions',
            'columns': [
                {
                    'key': 'created_at',
                    'label': 'Date',
                    'format': 'datetime',
                    'width': '150px'
                },
                {
                    'key': 'description',
                    'label': 'Description',
                    'format': 'text',
                    'width': 'auto'
                },
                {
                    'key': 'category',
                    'label': 'Category',
                    'format': 'badge',
                    'width': '120px'
                },
                {
                    'key': 'transaction_type',
                    'label': 'Type',
                    'format': 'badge',
                    'width': '100px'
                },
                {
                    'key': 'amount',
                    'label': 'Amount',
                    'format': 'currency',
                    'width': '120px',
                    'align': 'right'
                },
                {
                    'key': 'status',
                    'label': 'Status',
                    'format': 'badge',
                    'width': '100px'
                }
            ],
            'data_endpoint': '/api/banking/transactions/',
            'data_method': 'GET',
            'pagination': True,
            'sortable': True,
            'filterable': True
        },
        
        'bill_history': {
            'type': 'table',
            'title': 'Bills',
            'description': 'Your utility bills',
            'columns': [
                {
                    'key': 'bill_type',
                    'label': 'Type',
                    'format': 'badge',
                    'width': '120px'
                },
                {
                    'key': 'provider',
                    'label': 'Provider',
                    'format': 'text',
                    'width': '150px'
                },
                {
                    'key': 'amount',
                    'label': 'Amount',
                    'format': 'currency',
                    'width': '120px',
                    'align': 'right'
                },
                {
                    'key': 'due_date',
                    'label': 'Due Date',
                    'format': 'date',
                    'width': '120px'
                },
                {
                    'key': 'status',
                    'label': 'Status',
                    'format': 'badge',
                    'width': '100px'
                },
                {
                    'key': 'actions',
                    'label': 'Actions',
                    'format': 'actions',
                    'width': '100px',
                    'actions': [
                        {
                            'type': 'pay',
                            'label': 'Pay',
                            'show_when': {'status': 'unpaid'}
                        }
                    ]
                }
            ],
            'data_endpoint': '/api/banking/bills/',
            'data_method': 'GET',
            'pagination': True,
            'sortable': True,
            'filterable': True
        },
        
        'loan_plans_list': {
            'type': 'table',
            'title': 'Available Loan Plans',
            'description': 'Compare our loan offerings',
            'columns': [
                {
                    'key': 'title',
                    'label': 'Plan Name',
                    'format': 'text',
                    'width': '200px'
                },
                {
                    'key': 'loan_type',
                    'label': 'Type',
                    'format': 'badge',
                    'width': '120px'
                },
                {
                    'key': 'interest_rate',
                    'label': 'Interest Rate',
                    'format': 'percentage',
                    'width': '120px',
                    'align': 'right'
                },
                {
                    'key': 'min_amount',
                    'label': 'Min Amount',
                    'format': 'currency',
                    'width': '120px',
                    'align': 'right'
                },
                {
                    'key': 'max_amount',
                    'label': 'Max Amount',
                    'format': 'currency',
                    'width': '120px',
                    'align': 'right'
                },
                {
                    'key': 'term_months',
                    'label': 'Term (Months)',
                    'format': 'number',
                    'width': '120px',
                    'align': 'center'
                },
                {
                    'key': 'actions',
                    'label': 'Actions',
                    'format': 'actions',
                    'width': '100px',
                    'actions': [
                        {
                            'type': 'apply',
                            'label': 'Apply',
                            'link': '/chat?prompt=Apply for {{loan_type}} loan'
                        }
                    ]
                }
            ],
            'data_endpoint': '/api/banking/loan-plans/',
            'data_method': 'GET',
            'pagination': False,
            'sortable': True,
            'filterable': True
        }
    }
    
    # Get the requested form config
    form_config = form_configs.get(form_type)
    if not form_config:
        return {
            'error': f'Unknown form type: {form_type}',
            'available_types': list(form_configs.keys())
        }
    
    # Apply prefill values
    if prefill:
        if form_config['type'] == 'form':
            # Prefill form fields
            for field in form_config['fields']:
                field_name = field['name']
                if field_name in prefill:
                    field['default'] = prefill[field_name]
        
        elif form_config['type'] == 'table':
            # Add prefill as query parameters to data endpoint
            query_params = '&'.join([f'{k}={v}' for k, v in prefill.items()])
            if '?' in form_config['data_endpoint']:
                form_config['data_endpoint'] += f'&{query_params}'
            else:
                form_config['data_endpoint'] += f'?{query_params}'
    
    # Override API endpoint if provided
    if api_endpoint:
        if form_config['type'] == 'form':
            form_config['submit_endpoint'] = api_endpoint
        else:
            form_config['data_endpoint'] = api_endpoint
    
    # Return the component configuration
    result = {
        'component': 'dynamic_form',
        'config': form_config
    }
    
    print(f"[generate_form] Returning: {result.keys()}")
    print(f"[generate_form] Component type: {result['component']}")
    print(f"[generate_form] Config keys: {result['config'].keys()}")
    
    return result
