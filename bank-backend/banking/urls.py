from django.urls import path
from banking.views import AccountBalanceView, BillHistoryView, TransactionHistoryView, TransferMoneyView, PayBillView, LoanPlanListView, RequestLoanView

app_name = 'banking'

urlpatterns = [
    path('balance/', AccountBalanceView.as_view(), name='account_balance'),
    path('transactions/', TransactionHistoryView.as_view(), name='transaction_history'),
    path('transfer/', TransferMoneyView.as_view(), name='transfer_money'),
    path('bills/', BillHistoryView.as_view(), name='bill_history'),
    path('bills/pay/', PayBillView.as_view(), name='pay_bill'),
    path('loan-plans/', LoanPlanListView.as_view(), name='loan_plans'),
    path('loans/request/', RequestLoanView.as_view(), name='request_loan'),
]