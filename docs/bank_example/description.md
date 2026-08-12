# AI Wallet — User Guide and Banking Knowledge

## Overview

AI Wallet is a mock banking application that allows registered users to manage basic banking activities through an authenticated account.

The system supports:

* viewing account balance and account status;
* viewing transaction history;
* transferring money to another account;
* viewing and paying bills;
* viewing available loan plans;
* submitting loan requests.

Users must authenticate before accessing banking functionality.

---

## Accounts and Authentication

### Creating an account

A new user can register with:

* username;
* email address;
* password;
* password confirmation;
* first name;
* last name.

The password confirmation must match the original password.

After successful registration, the system issues authentication tokens.

### Logging in

Users authenticate using their **username and password**.

The login system uses JWT authentication and returns access and refresh tokens.

Authenticated banking requests require a valid access token.

### Refreshing authentication

A refresh token can be used to obtain a new access token.

Depending on the backend's configured token-rotation behavior, refreshing may also return a new refresh token.

---

# Account Balance

An authenticated user can retrieve information about their bank account.

The balance information includes:

* account number;
* current balance;
* account status.

Some banking operations depend on the account being active.

For example, transfers and loan requests can be rejected when the user's account is not active.

---

# Transactions

Users can retrieve their transaction history.

Transaction history is paginated and can be filtered.

## Transaction filters

Transactions can be filtered by transaction type:

* debit;
* credit.

They can also be filtered by category:

* bill payment;
* transfer;
* loan;
* deposit;
* withdrawal.

Transactions can additionally be filtered by status:

* pending;
* completed;
* failed.

Date filters are available using a start date and end date.

Results can also be ordered, including descending ordering by prefixing the ordering field with `-`.

A result limit can be provided to control the number of returned records.

---

# Money Transfers

Users can transfer money from their account to another account.

A transfer requires:

* recipient account number;
* amount.

A description may optionally be included.

The transfer amount must be at least `0.01`.

After a successful transfer, the backend returns information including:

* transaction ID;
* transferred amount;
* recipient;
* new account balance;
* timestamp.

## Why can a transfer fail?

A transfer may fail when:

* the submitted input is invalid;
* the user attempts to transfer money to their own account;
* the account does not contain sufficient funds;
* the sender's account is not active;
* the recipient account cannot be found.

The backend remains responsible for deciding whether a transfer is permitted.

---

# Bills

Users can retrieve bills associated with their account.

The bill list is paginated.

## Bill types

The backend currently recognizes these bill types:

* internet;
* electricity;
* water;
* gas.

## Bill statuses

Bills can have these statuses:

* unpaid;
* paid;
* overdue.

Users can filter bills by:

* bill type;
* status;
* start date;
* end date;
* ordering;
* result limit.

---

# Paying Bills

A user can pay one of their bills.

A bill payment requires the ID of the bill being paid.

The backend checks whether the payment is valid before completing it.

A bill payment may fail when:

* the bill is invalid;
* the bill has already been paid;
* the user cannot afford the bill;
* the user's account is inactive;
* the bill belongs to another user;
* the bill cannot be found.

After a successful bill payment, the backend returns payment transaction information and the user's new balance.

---

# Loans

AI Wallet provides loan plans and allows users to submit loan requests.

## Available loan types

The backend currently recognizes three loan types:

* car;
* personal;
* home.

Users can retrieve active loan plans.

Loan plans may be filtered by:

* loan type;
* active status;
* minimum amount;
* maximum amount;
* ordering;
* result limit.

Loan plans are ordered by interest rate by default.

---

# Requesting a Loan

A loan request requires:

* loan type;
* requested amount;
* salary.

A description is optional.

Both the requested amount and salary must be at least `0.01`.

A successfully submitted loan request initially has a **pending** status.

The response includes information such as:

* request ID;
* loan type;
* amount;
* salary;
* status;
* timestamp.

## Why can a loan request fail?

A request may fail when:

* the submitted values are invalid;
* there is no matching active loan plan;
* the user's account is not active.

The available backend documentation does not specify the complete loan approval process after a request has been submitted.

---

# What AI Wallet Does Not Currently Specify

The available backend documentation does not define:

* transfer fees;
* daily or monthly transfer limits;
* bill-payment fees;
* exact JWT expiration times;
* loan approval formulas;
* credit-score requirements;
* penalties for overdue bills;
* interest-rate calculation rules beyond loan-plan data returned by the backend;
* how long loan approval takes;
* whether transfers can be cancelled or reversed.

The assistant should not invent answers to these questions.

If these rules are added to the banking application later, they should also be added to the documentation used by the AI assistant.

---

# Example Questions and Answers

The following are examples of questions that the AI Wallet documentation can answer.

## Account

**Q: What information can I see about my account?**

You can retrieve your account number, current balance, and account status.

**Q: Do I need to log in to see my balance?**

Yes. Banking endpoints require authentication.

**Q: What do I use to log in?**

Use your username and password.

---

## Transfers

**Q: What information do I need to transfer money?**

You need the recipient's account number and the amount you want to transfer. You may also provide an optional description.

**Q: What is the minimum transfer amount?**

The transfer amount must be at least `0.01`.

**Q: Can I transfer money to my own account?**

No. The backend treats a self-transfer as an invalid transfer.

**Q: Why was my transfer rejected?**

A transfer can be rejected because of invalid input, insufficient funds, an inactive sender account, a self-transfer, or because the recipient account does not exist.

**Q: What happens after a successful transfer?**

The system returns transfer information including the transaction ID, amount, recipient, new balance, and timestamp.

**Q: Can I transfer money if my account is inactive?**

No. The backend can reject a transfer when the sender account is not active.

---

## Transactions

**Q: Can I see my previous transactions?**

Yes. AI Wallet provides paginated transaction history.

**Q: Can I see only debit transactions?**

Yes. Transaction history can be filtered by transaction type, including `debit` and `credit`.

**Q: Can I search for only my transfer transactions?**

Yes. Transaction history can be filtered by category, and `transfer` is one of the supported categories.

**Q: What transaction categories are available?**

The documented categories are bill payment, transfer, loan, deposit, and withdrawal.

**Q: Can I filter transactions by date?**

Yes. Transaction history supports start-date and end-date filters.

**Q: Can I look for failed transactions?**

Yes. Transactions can be filtered by status: pending, completed, or failed.

---

## Bills

**Q: What types of bills can I have?**

The currently documented bill types are internet, electricity, water, and gas.

**Q: Can I see only my unpaid bills?**

Yes. Bills can be filtered by status, including `unpaid`, `paid`, and `overdue`.

**Q: Can I pay a bill that has already been paid?**

No. The backend can reject attempts to pay an already-paid bill.

**Q: Why couldn't I pay my bill?**

Possible reasons include insufficient funds, an inactive account, an invalid or already-paid bill, a bill belonging to another user, or a bill that cannot be found.

**Q: Can I pay somebody else's bill?**

The backend can reject a payment when the bill belongs to another user.

---

## Loans

**Q: What kinds of loans are available?**

AI Wallet currently supports car, personal, and home loan plans.

**Q: What information do I need to request a loan?**

You need to provide the loan type, requested amount, and your salary. You may also provide an optional description.

**Q: What happens when I request a loan?**

A valid loan request is submitted with a pending status.

**Q: Can I request any amount I want?**

The requested amount must be at least `0.01`, but the backend also requires a matching active loan plan. The available documentation does not establish that every amount will have a matching plan.

**Q: Why was my loan request rejected?**

The documented reasons include invalid input, no matching active loan plan, or an inactive account.

**Q: Does submitting a loan request mean the loan is approved?**

No. A successfully submitted request has a pending status. The available documentation does not describe the complete approval process.

---

# Questions the Assistant Should Not Guess About

Some questions cannot currently be answered from the documented banking rules.

For example:

**Q: What is the daily transfer limit?**

The available documentation does not specify a daily transfer limit.

**Q: How much does a transfer cost?**

The available documentation does not specify transfer fees.

**Q: What credit score do I need for a home loan?**

The available documentation does not specify credit-score requirements.

**Q: How long does loan approval take?**

The available documentation does not specify a loan-processing time.

**Q: What happens if I leave a bill overdue for a month?**

The backend recognizes an `overdue` bill status, but the available documentation does not specify penalties or other consequences.

For questions like these, the assistant should indicate that the information is not available rather than inventing a banking policy.
