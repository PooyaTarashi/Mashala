# Chat System Testing Guide

## Running Tests (No LLM API Calls)

The test suite validates all tools without making expensive LLM API calls.

### Run All Tests
```bash
python manage.py test chat
```

### Run Specific Test Classes
```bash
# Test data fetching tools only
python manage.py test chat.tests.DataFetchingToolsTest

# Test UI generation tools only
python manage.py test chat.tests.UIGenerationToolTest

# Test tool integration workflows
python manage.py test chat.tests.ToolIntegrationTest

# Test tool registry and schemas
python manage.py test chat.tests.ToolSchemaTest
```

### Run Specific Tests
```bash
# Test transaction fetching
python manage.py test chat.tests.DataFetchingToolsTest.test_get_transactions_default

# Test form generation
python manage.py test chat.tests.UIGenerationToolTest.test_generate_transfer_form
```

---

## Testing with LLM (Uses API Tokens)

### Prerequisites
1. Add OpenAI API key to `.env`:
```env
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4o
```

2. Ensure you have an authenticated user and JWT token

### Get JWT Token
```bash
# Register or login to get token
curl -X POST http://localhost:8000/api/v1/users/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'

# Response will include:
# {
#   "tokens": {
#     "access": "eyJ...",
#     "refresh": "eyJ..."
#   }
# }
```

### Test Endpoints with LLM

#### 1. Simple Query (Single Round)
```bash
# Transfer money
curl -X POST http://localhost:8000/api/v1/chat/process/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Transfer 50 dollars to ACC123456"
  }'

# Expected Response:
# {
#   "message": "I'll help you transfer $50. Please review and confirm...",
#   "components": [
#     {
#       "component": "dynamic_form",
#       "config": {
#         "type": "form",
#         "title": "Transfer Money",
#         "fields": [...],
#         "submit_endpoint": "/api/banking/transfer/"
#       }
#     }
#   ],
#   "analysis": null,
#   "metadata": {
#     "rounds": 1,
#     "tools_used": ["generate_form"]
#   }
# }
```

#### 2. Data Analysis (Two Rounds)
```bash
# View and analyze transactions
curl -X POST http://localhost:8000/api/v1/chat/process/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Show my last 10 transactions and analyze my spending"
  }'

# Expected Response:
# {
#   "message": "I'll show your recent transactions and analyze them.",
#   "components": [
#     {
#       "component": "dynamic_form",
#       "config": {
#         "type": "table",
#         "title": "Transaction History",
#         "data_endpoint": "/api/banking/transactions/?limit=10"
#       }
#     }
#   ],
#   "analysis": "Based on your transactions, you've spent $XXX on...",
#   "metadata": {
#     "rounds": 2,
#     "tools_used": ["generate_form", "get_transactions"]
#   }
# }
```

#### 3. Check Balance
```bash
curl -X POST http://localhost:8000/api/v1/chat/process/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is my account balance?"
  }'
```

#### 4. View Bills
```bash
curl -X POST http://localhost:8000/api/v1/chat/process/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Show my unpaid bills"
  }'
```

#### 5. Explore Loan Options
```bash
curl -X POST http://localhost:8000/api/v1/chat/process/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Show me available loan options"
  }'
```

#### 6. Apply for Loan
```bash
curl -X POST http://localhost:8000/api/v1/chat/process/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "I want to apply for a car loan of $25000"
  }'
```

---

## Using Postman

### Import Configuration
1. Create a new request in Postman
2. Method: `POST`
3. URL: `http://localhost:8000/api/v1/chat/process/`
4. Headers:
   - `Authorization: Bearer YOUR_ACCESS_TOKEN`
   - `Content-Type: application/json`
5. Body (raw JSON):
```json
{
  "prompt": "Show my last 5 transactions"
}
```

### Sample Prompts to Test

**Simple Actions (Single Round):**
- "Transfer 100 dollars to ACC789012"
- "I want to apply for a personal loan"
- "Pay my electricity bill"

**Data Queries (Two Rounds):**
- "Show my last 10 transactions and analyze them"
- "List my unpaid bills and tell me the total"
- "Show loan options and recommend one for me"
- "Analyze my spending patterns"

**Information Requests:**
- "What's my account balance?"
- "Show all my bills"
- "What loan plans are available?"

---

## Troubleshooting

### Error: "OPENAI_API_KEY not found"
Add the API key to your `.env` file:
```env
OPENAI_API_KEY=sk-your-key-here
```

### Error: "Authentication credentials were not provided"
You need a valid JWT token. Login first:
```bash
curl -X POST http://localhost:8000/api/v1/users/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "your_user", "password": "your_pass"}'
```

### Error: "No transactions found"
Create some test data first or use Django admin to add transactions.

### LLM doesn't call tools correctly
Check:
1. Tool schemas are properly generated (run `ToolSchemaTest`)
2. Tool descriptions are clear and detailed
3. System prompt guides LLM correctly

---

## Cost Estimation

### Token Usage per Request:

**Single Round (Form Generation Only):**
- Input: ~500-800 tokens (system prompt + user prompt + tool schemas)
- Output: ~100-200 tokens
- **Total: ~800 tokens (~$0.01 with gpt-4o)**

**Two Rounds (Data + Analysis):**
- Round 1: ~800 tokens
- Round 2: ~1500 tokens (includes data in context)
- **Total: ~2300 tokens (~$0.03 with gpt-4o)**

### Tips to Save Tokens:
1. Use unit tests (no API calls)
2. Use `gpt-4o-mini` for development (`OPENAI_MODEL=gpt-4o-mini`)
3. Test with shorter prompts
4. Cache responses during development

---

## CI/CD Testing

### GitHub Actions Example
```yaml
- name: Run Chat Tests (No LLM)
  run: |
    python manage.py test chat --settings=config.settings_test
```

Unit tests don't require API keys and run quickly in CI/CD pipelines.
