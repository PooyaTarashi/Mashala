"""
Tests for chat tools without calling LLM APIs.

These tests validate tool functionality directly, saving API tokens
while ensuring tools work correctly before integrating with LLM.
"""

from django.test import TestCase
from django.contrib.auth import get_user_model
from banking.models import Transaction, Bill, LoanPlan
from decimal import Decimal
from datetime import datetime, timedelta
from django.utils import timezone
import json

from chat.tools import (
    get_transactions,
    get_bills,
    get_loan_plans,
    get_account_balance,
    generate_form
)
from chat.schemas import (
    GetTransactionsInput,
    GetBillsInput,
    GenerateFormInput
)

User = get_user_model()


class DataFetchingToolsTest(TestCase):
    """Tests for data fetching tools (for LLM analysis)."""
    
    def setUp(self):
        """Create test user and sample data."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            account_number='ACC123456',
            balance=Decimal('5000.00'),
            status='active'
        )
        
        # Create sample transactions
        self.transactions = []
        for i in range(15):
            tx = Transaction.objects.create(
                user=self.user,
                transaction_type='debit' if i % 2 == 0 else 'credit',
                amount=Decimal(f'{(i+1) * 10}.00'),
                description=f'Test transaction {i+1}',
                category=['transfer', 'bill_payment', 'loan', 'deposit'][i % 4],
                status='completed' if i < 12 else 'pending'
            )
            self.transactions.append(tx)
        
        # Create sample bills
        self.bills = []
        bill_types = ['internet', 'electricity', 'water', 'gas']
        statuses = ['unpaid', 'paid', 'overdue']
        for i in range(8):
            bill = Bill.objects.create(
                user=self.user,
                bill_type=bill_types[i % 4],
                provider=f'Provider {i+1}',
                account_number=f'BILL{i:04d}',
                amount=Decimal(f'{50 + (i * 10)}.00'),
                due_date=timezone.now().date() + timedelta(days=i),
                status=statuses[i % 3]
            )
            self.bills.append(bill)
        
        # Create loan plans
        self.loan_plans = []
        loan_types = ['personal', 'car', 'home']
        for i, loan_type in enumerate(loan_types):
            plan = LoanPlan.objects.create(
                title=f'{loan_type.capitalize()} Loan Plan',
                loan_type=loan_type,
                min_amount=Decimal(f'{(i+1) * 1000}.00'),
                max_amount=Decimal(f'{(i+1) * 50000}.00'),
                interest_rate=Decimal(f'{5 + i}.5'),
                term_months=(i+1) * 12,
                description=f'Test {loan_type} loan plan',
                is_active=True
            )
            self.loan_plans.append(plan)
    
    def test_get_transactions_default(self):
        """Test getting transactions with default parameters."""
        params = GetTransactionsInput()
        result = get_transactions(self.user, params)
        
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 10)  # Default limit
        self.assertEqual(result[0]['description'], 'Test transaction 15')  # Newest first
        
        # Verify structure
        first_tx = result[0]
        self.assertIn('id', first_tx)
        self.assertIn('transaction_type', first_tx)
        self.assertIn('amount', first_tx)
        self.assertIn('description', first_tx)
        self.assertIn('category', first_tx)
        self.assertIn('status', first_tx)
        self.assertIn('created_at', first_tx)
    
    def test_get_transactions_with_limit(self):
        """Test getting transactions with custom limit."""
        params = GetTransactionsInput(limit=5)
        result = get_transactions(self.user, params)
        
        self.assertEqual(len(result), 5)
    
    def test_get_transactions_by_category(self):
        """Test filtering transactions by category."""
        params = GetTransactionsInput(category='loan')
        result = get_transactions(self.user, params)
        
        # Should have transactions at indices 2, 6, 10, 14
        self.assertGreater(len(result), 0)
        for tx in result:
            self.assertEqual(tx['category'], 'loan')
    
    def test_get_transactions_exclude_pending(self):
        """Test excluding pending transactions."""
        params = GetTransactionsInput(include_pending=False)
        result = get_transactions(self.user, params)
        
        for tx in result:
            self.assertEqual(tx['status'], 'completed')
    
    def test_get_bills_default(self):
        """Test getting bills with default parameters."""
        params = GetBillsInput()
        result = get_bills(self.user, params)
        
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 8)
        
        # Verify structure
        first_bill = result[0]
        self.assertIn('id', first_bill)
        self.assertIn('bill_type', first_bill)
        self.assertIn('provider', first_bill)
        self.assertIn('amount', first_bill)
        self.assertIn('due_date', first_bill)
        self.assertIn('status', first_bill)
    
    def test_get_bills_by_status(self):
        """Test filtering bills by status."""
        params = GetBillsInput(status='unpaid')
        result = get_bills(self.user, params)
        
        self.assertGreater(len(result), 0)
        for bill in result:
            self.assertEqual(bill['status'], 'unpaid')
    
    def test_get_bills_by_type(self):
        """Test filtering bills by type."""
        params = GetBillsInput(bill_type='electricity')
        result = get_bills(self.user, params)
        
        self.assertGreater(len(result), 0)
        for bill in result:
            self.assertEqual(bill['bill_type'], 'electricity')
    
    def test_get_loan_plans(self):
        """Test getting loan plans."""
        result = get_loan_plans(self.user)
        
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 3)
        
        # Verify structure
        first_plan = result[0]
        self.assertIn('id', first_plan)
        self.assertIn('title', first_plan)
        self.assertIn('loan_type', first_plan)
        self.assertIn('min_amount', first_plan)
        self.assertIn('max_amount', first_plan)
        self.assertIn('interest_rate', first_plan)
        self.assertIn('term_months', first_plan)
        self.assertIn('description', first_plan)
    
    def test_get_account_balance(self):
        """Test getting account balance."""
        result = get_account_balance(self.user)
        
        self.assertIsInstance(result, dict)
        self.assertEqual(result['account_number'], 'ACC123456')
        self.assertEqual(result['balance'], '5000.00')
        self.assertEqual(result['currency'], 'USD')
        self.assertEqual(result['status'], 'active')


class UIGenerationToolTest(TestCase):
    """Tests for UI generation tool (form/table configs)."""
    
    def test_generate_transfer_form(self):
        """Test generating transfer money form."""
        params = GenerateFormInput(form_type='transfer_money')
        result = generate_form(params)
        
        self.assertEqual(result['component'], 'dynamic_form')
        self.assertEqual(result['config']['type'], 'form')
        self.assertEqual(result['config']['title'], 'Transfer Money')
        self.assertEqual(result['config']['submit_endpoint'], '/api/banking/transfer/')
        
        # Check fields
        fields = result['config']['fields']
        field_names = [f['name'] for f in fields]
        self.assertIn('recipient_account', field_names)
        self.assertIn('amount', field_names)
        self.assertIn('description', field_names)
    
    def test_generate_transfer_form_with_prefill(self):
        """Test generating transfer form with prefilled values."""
        params = GenerateFormInput(
            form_type='transfer_money',
            prefill={
                'recipient_account': 'ACC789012',
                'amount': '100.50'
            }
        )
        result = generate_form(params)
        
        fields = result['config']['fields']
        
        # Find recipient_account field
        recipient_field = next(f for f in fields if f['name'] == 'recipient_account')
        self.assertEqual(recipient_field['default'], 'ACC789012')
        
        # Find amount field
        amount_field = next(f for f in fields if f['name'] == 'amount')
        self.assertEqual(amount_field['default'], '100.50')
    
    def test_generate_loan_application_form(self):
        """Test generating loan application form."""
        params = GenerateFormInput(form_type='loan_application')
        result = generate_form(params)
        
        self.assertEqual(result['config']['type'], 'form')
        self.assertEqual(result['config']['title'], 'Apply for Loan')
        self.assertEqual(result['config']['submit_endpoint'], '/api/banking/loans/request/')
        
        fields = result['config']['fields']
        field_names = [f['name'] for f in fields]
        self.assertIn('loan_type', field_names)
        self.assertIn('amount', field_names)
        self.assertIn('salary', field_names)
        self.assertIn('description', field_names)
    
    def test_generate_transaction_table(self):
        """Test generating transaction history table."""
        params = GenerateFormInput(form_type='transaction_history')
        result = generate_form(params)
        
        self.assertEqual(result['config']['type'], 'table')
        self.assertEqual(result['config']['title'], 'Transaction History')
        self.assertEqual(result['config']['data_endpoint'], '/api/banking/transactions/')
        
        # Check columns
        columns = result['config']['columns']
        column_keys = [c['key'] for c in columns]
        self.assertIn('created_at', column_keys)
        self.assertIn('description', column_keys)
        self.assertIn('amount', column_keys)
        self.assertIn('status', column_keys)
    
    def test_generate_transaction_table_with_query_params(self):
        """Test generating transaction table with query parameters."""
        params = GenerateFormInput(
            form_type='transaction_history',
            prefill={'limit': 5, 'category': 'loan'}
        )
        result = generate_form(params)
        
        endpoint = result['config']['data_endpoint']
        self.assertIn('limit=5', endpoint)
        self.assertIn('category=loan', endpoint)
    
    def test_generate_bill_table(self):
        """Test generating bill history table."""
        params = GenerateFormInput(form_type='bill_history')
        result = generate_form(params)
        
        self.assertEqual(result['config']['type'], 'table')
        self.assertEqual(result['config']['title'], 'Bills')
        self.assertEqual(result['config']['data_endpoint'], '/api/banking/bills/')
        
        columns = result['config']['columns']
        column_keys = [c['key'] for c in columns]
        self.assertIn('bill_type', column_keys)
        self.assertIn('amount', column_keys)
        self.assertIn('due_date', column_keys)
        self.assertIn('actions', column_keys)  # Should have pay button
    
    def test_generate_loan_plans_table(self):
        """Test generating loan plans table."""
        params = GenerateFormInput(form_type='loan_plans_list')
        result = generate_form(params)
        
        self.assertEqual(result['config']['type'], 'table')
        self.assertEqual(result['config']['title'], 'Available Loan Plans')
        self.assertEqual(result['config']['data_endpoint'], '/api/banking/loan-plans/')
        
        columns = result['config']['columns']
        column_keys = [c['key'] for c in columns]
        self.assertIn('title', column_keys)
        self.assertIn('interest_rate', column_keys)
        self.assertIn('min_amount', column_keys)
        self.assertIn('max_amount', column_keys)
    
    def test_generate_form_with_custom_endpoint(self):
        """Test generating form with custom API endpoint."""
        params = GenerateFormInput(
            form_type='transfer_money',
            api_endpoint='/api/v2/custom-transfer/'
        )
        result = generate_form(params)
        
        self.assertEqual(result['config']['submit_endpoint'], '/api/v2/custom-transfer/')
    
    def test_generate_form_invalid_type(self):
        """Test generating form with invalid type."""
        params = GenerateFormInput(form_type='invalid_form_type')
        result = generate_form(params)
        
        self.assertIn('error', result)
        self.assertIn('available_types', result)


class ToolIntegrationTest(TestCase):
    """Integration tests for combining tools (simulating LLM workflow)."""
    
    def setUp(self):
        """Create test user with data."""
        self.user = User.objects.create_user(
            username='integrationuser',
            email='integration@example.com',
            password='testpass123',
            account_number='ACC999888',
            balance=Decimal('2500.00'),
            status='active'
        )
        
        # Create transactions
        for i in range(5):
            Transaction.objects.create(
                user=self.user,
                transaction_type='debit',
                amount=Decimal(f'{(i+1) * 20}.00'),
                description=f'Purchase {i+1}',
                category='transfer',
                status='completed'
            )
    
    def test_transaction_analysis_workflow(self):
        """Test workflow: Generate table + Fetch data for analysis."""
        # Step 1: LLM would call generate_form
        form_params = GenerateFormInput(
            form_type='transaction_history',
            prefill={'limit': 5}
        )
        ui_component = generate_form(form_params)
        
        # Verify UI component generated
        self.assertEqual(ui_component['component'], 'dynamic_form')
        self.assertIn('limit=5', ui_component['config']['data_endpoint'])
        
        # Step 2: LLM would call get_transactions for analysis
        data_params = GetTransactionsInput(limit=5)
        analysis_data = get_transactions(self.user, data_params)
        
        # Verify data fetched
        self.assertEqual(len(analysis_data), 5)
        
        # Simulate LLM analysis (in real scenario, LLM analyzes this data)
        total_spent = sum(Decimal(tx['amount']) for tx in analysis_data)
        self.assertEqual(total_spent, Decimal('300.00'))  # 20+40+60+80+100
        
        print("\n=== Transaction Analysis Workflow ===")
        print(f"UI Component: {ui_component['config']['title']}")
        print(f"Data Endpoint: {ui_component['config']['data_endpoint']}")
        print(f"Transactions fetched: {len(analysis_data)}")
        print(f"Total amount: ${total_spent}")
        print("✓ Workflow successful")
    
    def test_transfer_workflow(self):
        """Test workflow: Generate transfer form with known values."""
        # User says: "Transfer $50 to ACC123456"
        form_params = GenerateFormInput(
            form_type='transfer_money',
            prefill={
                'recipient_account': 'ACC123456',
                'amount': '50.00'
            }
        )
        ui_component = generate_form(form_params)
        
        # Verify form generated with prefilled values
        fields = ui_component['config']['fields']
        recipient_field = next(f for f in fields if f['name'] == 'recipient_account')
        amount_field = next(f for f in fields if f['name'] == 'amount')
        
        self.assertEqual(recipient_field['default'], 'ACC123456')
        self.assertEqual(amount_field['default'], '50.00')
        
        print("\n=== Transfer Workflow ===")
        print(f"Form: {ui_component['config']['title']}")
        print(f"Prefilled recipient: {recipient_field['default']}")
        print(f"Prefilled amount: ${amount_field['default']}")
        print(f"Submit endpoint: {ui_component['config']['submit_endpoint']}")
        print("✓ Workflow successful")


class ToolSchemaTest(TestCase):
    """Tests for tool schema generation and validation."""
    
    def test_tool_schemas_generated(self):
        """Test that tool schemas are properly generated."""
        from chat.tool_registry import TOOL_SCHEMAS, validate_tool_schemas
        
        self.assertIsInstance(TOOL_SCHEMAS, list)
        self.assertGreater(len(TOOL_SCHEMAS), 0)
        
        # Validate all schemas
        validate_tool_schemas()
        
        print("\n=== Tool Schemas ===")
        for schema in TOOL_SCHEMAS:
            tool_name = schema['function']['name']
            description = schema['function']['description'][:100]
            print(f"✓ {tool_name}: {description}...")
    
    def test_tool_registry(self):
        """Test tool registry functions."""
        from chat.tool_registry import (
            get_tool_function,
            get_tool_input_model,
            is_data_fetching_tool,
            is_ui_generation_tool,
            get_available_tool_names
        )
        
        # Test tool retrieval
        tool_func = get_tool_function('get_transactions')
        self.assertIsNotNone(tool_func)
        
        # Test input model retrieval
        input_model = get_tool_input_model('get_transactions')
        self.assertEqual(input_model, GetTransactionsInput)
        
        # Test categorization
        self.assertTrue(is_data_fetching_tool('get_transactions'))
        self.assertFalse(is_ui_generation_tool('get_transactions'))
        self.assertTrue(is_ui_generation_tool('generate_form'))
        self.assertFalse(is_data_fetching_tool('generate_form'))
        
        # Test available tools
        tool_names = get_available_tool_names()
        self.assertIn('get_transactions', tool_names)
        self.assertIn('get_bills', tool_names)
        self.assertIn('generate_form', tool_names)
        
        print("\n=== Tool Registry ===")
        print(f"Available tools: {', '.join(tool_names)}")
        print(f"✓ All tools registered correctly")
