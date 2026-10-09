"""
Pydantic schemas for chat tool inputs and outputs.

These models provide type validation and automatic schema generation
for OpenAI function calling.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import datetime
from decimal import Decimal


# ============================================================================
# INPUT SCHEMAS (Tool Parameters)
# ============================================================================

class GetTransactionsInput(BaseModel):
    """Input parameters for retrieving user transactions."""
    
    limit: int = Field(
        default=10,
        description="Maximum number of transactions to return. Default is 10.",
        ge=1,
        le=100
    )
    
    category: Optional[Literal['bill_payment', 'transfer', 'loan', 'deposit', 'withdrawal']] = Field(
        default=None,
        description="Filter transactions by category. Options: bill_payment, transfer, loan, deposit, withdrawal. Leave empty to get all categories."
    )
    
    include_pending: bool = Field(
        default=True,
        description="Whether to include pending transactions. Set to false to show only completed transactions."
    )


class GetBillsInput(BaseModel):
    """Input parameters for retrieving user bills."""
    
    status: Optional[Literal['unpaid', 'paid', 'overdue']] = Field(
        default=None,
        description="Filter bills by payment status. Options: unpaid, paid, overdue. Leave empty to get all bills."
    )
    
    bill_type: Optional[Literal['internet', 'electricity', 'water', 'gas']] = Field(
        default=None,
        description="Filter bills by type. Options: internet, electricity, water, gas. Leave empty to get all types."
    )


class GenerateFormInput(BaseModel):
    """Input parameters for generating dynamic forms or tables."""
    
    form_type: Literal[
        'transfer_money',
        'loan_application', 
        'bill_payment',
        'transaction_history',
        'bill_history',
        'loan_plans_list'
    ] = Field(
        ...,
        description="Type of form or table to generate. Options: transfer_money (form to transfer funds), loan_application (form to apply for loan), bill_payment (form to pay bills), transaction_history (table showing transactions), bill_history (table showing bills), loan_plans_list (table showing available loan plans)."
    )
    
    prefill: Optional[dict] = Field(
        default=None,
        description="Dictionary of values to prefill in the form or use as query parameters for tables. Example: {'to_account': 'ACC12345', 'amount': '100'} for transfer form, or {'limit': 10} for transaction table."
    )
    
    api_endpoint: Optional[str] = Field(
        default=None,
        description="Override the default API endpoint for form submission or data fetching. Use this if you need a custom endpoint."
    )


# ============================================================================
# OUTPUT SCHEMAS (Tool Responses)
# ============================================================================

class TransactionResponse(BaseModel):
    """Represents a single transaction."""
    
    id: str
    transaction_type: str
    amount: str
    description: str
    category: str
    status: str
    created_at: str
    recipient_account: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "transaction_type": "debit",
                "amount": "50.00",
                "description": "Payment to John",
                "category": "transfer",
                "status": "completed",
                "created_at": "2025-11-20T10:30:00Z",
                "recipient_account": "ACC12345"
            }
        }


class BillResponse(BaseModel):
    """Represents a single bill."""
    
    id: str
    bill_type: str
    provider: str
    account_number: str
    amount: str
    due_date: Optional[str] = None
    status: str
    created_at: str
    paid_at: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174001",
                "bill_type": "electricity",
                "provider": "City Electric",
                "account_number": "ELEC123456",
                "amount": "85.50",
                "due_date": "2025-11-30",
                "status": "unpaid",
                "created_at": "2025-11-01T00:00:00Z",
                "paid_at": None
            }
        }


class LoanPlanResponse(BaseModel):
    """Represents a loan plan."""
    
    id: str
    title: str
    loan_type: str
    min_amount: str
    max_amount: str
    interest_rate: str
    term_months: int
    description: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174002",
                "title": "Personal Loan - Standard",
                "loan_type": "personal",
                "min_amount": "1000.00",
                "max_amount": "50000.00",
                "interest_rate": "8.50",
                "term_months": 36,
                "description": "Flexible personal loan with competitive rates"
            }
        }


class AccountBalanceResponse(BaseModel):
    """Represents account balance information."""
    
    account_number: str
    balance: str
    currency: str = "USD"
    last_updated: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "account_number": "ACC12345",
                "balance": "1250.75",
                "currency": "USD",
                "last_updated": "2025-11-20T15:45:00Z"
            }
        }


class FormGenerationResponse(BaseModel):
    """Response from form generation tool."""
    
    component: Literal['dynamic_form']
    config: dict
    
    class Config:
        json_schema_extra = {
            "example": {
                "component": "dynamic_form",
                "config": {
                    "type": "form",
                    "title": "Transfer Money",
                    "fields": [],
                    "submit_endpoint": "/api/banking/transfer/"
                }
            }
        }
