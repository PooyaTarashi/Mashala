# AI Banking Assistant - Frontend Specification

## Project Overview
A React-based web application that provides an AI-powered conversational banking interface. Users can manage their finances through natural language chat interactions with an intelligent assistant that can fetch data, provide analysis, and generate interactive forms.

---

## Tech Stack
- **Framework**: React 18+ with TypeScript
- **Routing**: React Router v6
- **State Management**: React Context API or Redux Toolkit
- **HTTP Client**: Axios
- **Styling**: Tailwind CSS or Material-UI
- **Form Handling**: React Hook Form
- **Authentication**: JWT tokens stored in localStorage

---

## Application Flow

### 1. Authentication Flow
```
┌─────────────┐
│ Landing     │
│ Page        │
└──────┬──────┘
       │
       ├─────► Login
       └─────► Signup
              │
              ▼
       ┌─────────────┐
       │ Get JWT     │
       │ Token       │
       └──────┬──────┘
              │
              ▼
       ┌─────────────┐
       │ Chat        │
       │ Interface   │
       └─────────────┘
```

### 2. Chat Interaction Flow
```
User enters prompt
       ↓
Show loading indicator
       ↓
Send POST to /api/v1/chat/process/
       ↓
Receive response:
  - message (string)
  - components (array of UI configs)
  - analysis (string | null)
  - metadata (object)
       ↓
Display in chat UI:
  - User message bubble
  - AI message bubble
  - Rendered components (forms/tables)
  - Analysis (if present)
```

---

## API Endpoints

### Authentication

#### 1. User Registration
```http
POST /api/v1/users/register/
Content-Type: application/json

Request:
{
  "username": "string",
  "email": "string",
  "password": "string",
  "first_name": "string",
  "last_name": "string"
}

Response (201 Created):
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "account_number": "string",
  "balance": "0.00",
  "created_at": "datetime"
}
```

#### 2. User Login
```http
POST /api/v1/users/token/
Content-Type: application/json

Request:
{
  "username": "string",
  "password": "string"
}

Response (200 OK):
{
  "access": "jwt-access-token",
  "refresh": "jwt-refresh-token"
}
```

#### 3. Token Refresh
```http
POST /api/v1/users/token/refresh/
Content-Type: application/json

Request:
{
  "refresh": "jwt-refresh-token"
}

Response (200 OK):
{
  "access": "new-jwt-access-token"
}
```

### Chat

#### Chat Process
```http
POST /api/v1/chat/process/
Authorization: Bearer <access-token>
Content-Type: application/json

Request:
{
  "prompt": "Transfer $100 to account ACC123456"
}

Response (200 OK):
{
  "message": "I'll help you transfer $100. Please confirm the details below.",
  "components": [
    {
      "component": "dynamic_form",
      "config": {
        "type": "form",
        "title": "Transfer Money",
        "description": "Transfer funds to another account",
        "fields": [
          {
            "name": "recipient_account",
            "type": "text",
            "label": "Recipient Account Number",
            "placeholder": "Enter account number",
            "required": true,
            "default": "ACC123456",
            "validation": {
              "pattern": "^ACC[0-9]+$",
              "message": "Account number must start with ACC"
            }
          },
          {
            "name": "amount",
            "type": "number",
            "label": "Amount ($)",
            "placeholder": "0.00",
            "required": true,
            "default": 100,
            "validation": {
              "min": 0.01,
              "message": "Amount must be greater than 0"
            }
          },
          {
            "name": "description",
            "type": "textarea",
            "label": "Description (Optional)",
            "placeholder": "What is this transfer for?",
            "required": false,
            "rows": 3
          }
        ],
        "submit_endpoint": "/api/v1/banking/transfer/",
        "submit_method": "POST",
        "submit_button_text": "Transfer Now"
      }
    }
  ],
  "analysis": null,
  "metadata": {
    "rounds": 1,
    "tools_used": ["generate_form"],
    "has_analysis": false
  }
}
```

---

## Component Types

### 1. Dynamic Form Component

The AI returns form configurations that need to be rendered dynamically.

**Form Structure:**
```typescript
interface FormConfig {
  type: 'form';
  title: string;
  description: string;
  fields: FormField[];
  submit_endpoint: string;
  submit_method: 'POST' | 'PUT' | 'PATCH';
  submit_button_text: string;
  show_confirmation?: boolean;
  confirmation_message?: string;
}

interface FormField {
  name: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'hidden';
  label?: string;
  placeholder?: string;
  required: boolean;
  default?: any;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    message: string;
  };
  options?: Array<{value: string; label: string}>; // For select fields
  rows?: number; // For textarea
}
```

**Supported Form Types:**
- `transfer_money` - Money transfer form
- `loan_application` - Loan application form
- `bill_payment` - Bill payment form

**Example React Component:**
```tsx
const DynamicForm: React.FC<{config: FormConfig}> = ({config}) => {
  const {register, handleSubmit, formState: {errors}} = useForm();
  
  const onSubmit = async (data) => {
    const response = await axios.post(
      config.submit_endpoint,
      data,
      {headers: {Authorization: `Bearer ${token}`}}
    );
    // Handle success/error
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <h3>{config.title}</h3>
      <p>{config.description}</p>
      
      {config.fields.map(field => (
        <FormField key={field.name} field={field} register={register} errors={errors} />
      ))}
      
      <button type="submit">{config.submit_button_text}</button>
    </form>
  );
};
```

### 2. Dynamic Table Component

For displaying data like transaction history, bills, loan plans.

**Table Structure:**
```typescript
interface TableConfig {
  type: 'table';
  title: string;
  description: string;
  columns: TableColumn[];
  data_endpoint: string;
  data_method: 'GET';
  pagination: boolean;
  sortable: boolean;
  filterable: boolean;
}

interface TableColumn {
  key: string;
  label: string;
  format: 'text' | 'currency' | 'date' | 'datetime' | 'badge' | 'percentage' | 'actions';
  width?: string;
  align?: 'left' | 'center' | 'right';
  actions?: TableAction[];
}

interface TableAction {
  type: string;
  label: string;
  show_when?: Record<string, any>;
  link?: string;
}
```

**Supported Table Types:**
- `transaction_history` - Transaction list
- `bill_history` - Bills list
- `loan_plans_list` - Available loan plans

---

## Screen Specifications

### 1. Login/Signup Screen

**Route:** `/login` or `/signup`

**Features:**
- Clean, modern design with split screen or centered card
- Form validation (email format, password strength)
- Toggle between login and signup
- Error handling for invalid credentials
- Loading state during authentication
- Redirect to chat after successful login

**State to Store:**
- JWT access token
- JWT refresh token
- User info (username, account_number, balance)

### 2. Chat Interface

**Route:** `/chat`

**Layout:**
```
┌─────────────────────────────────────┐
│  Header: AI Banking Assistant      │
│  User: John Doe | Balance: $1,234  │
├─────────────────────────────────────┤
│                                     │
│  Chat Messages Area                 │
│  (Scrollable)                       │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ User: "Transfer $100"        │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ AI: "I'll help you..."       │  │
│  │                              │  │
│  │ [Transfer Form Component]    │  │
│  │                              │  │
│  │ Amount: $100                 │  │
│  │ To: ACC123                   │  │
│  │ [Transfer Now Button]        │  │
│  └──────────────────────────────┘  │
│                                     │
├─────────────────────────────────────┤
│  Input: "Type your message..."     │
│  [Send Button] 📤                   │
└─────────────────────────────────────┘
```

**Components:**

#### Chat Message
```tsx
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  components?: ComponentConfig[];
  analysis?: string;
  timestamp: Date;
  isLoading?: boolean;
}
```

#### Message Bubble
- User messages: Right-aligned, different color (e.g., blue)
- AI messages: Left-aligned, different color (e.g., gray)
- Timestamp below each message
- Avatar icon for AI

#### Loading State
Show animated dots or spinner when waiting for AI response:
```tsx
<div className="loading">
  <span>●</span>
  <span>●</span>
  <span>●</span>
</div>
```

#### Input Area
- Text input with auto-resize
- Send button (disabled when empty or loading)
- Enter key to send (Shift+Enter for new line)
- Character counter (optional)

**Example Prompts to Show:**
- "What is my account balance?"
- "Show my last 10 transactions"
- "Transfer $50 to ACC123456"
- "What bills do I need to pay?"
- "Apply for a car loan"

---

## State Management

### Global State (Context or Redux)

```typescript
interface AppState {
  auth: {
    isAuthenticated: boolean;
    accessToken: string | null;
    refreshToken: string | null;
    user: User | null;
  };
  chat: {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
  };
}

interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  account_number: string;
  balance: string;
}
```

---

## Error Handling

### API Errors

```typescript
interface ApiError {
  error: string;
  details?: any;
}
```

**Common Error Scenarios:**
1. **401 Unauthorized** - Token expired → Redirect to login
2. **400 Bad Request** - Invalid input → Show error message
3. **500 Server Error** - Backend issue → Show retry option
4. **Network Error** - No connection → Show offline message

**Error Display:**
- Toast notifications for general errors
- Inline validation errors for forms
- Error message in chat for AI processing failures

---

## Styling Guidelines

### Color Scheme
```css
:root {
  --primary: #2563eb;      /* Blue for primary actions */
  --secondary: #64748b;    /* Gray for secondary */
  --success: #10b981;      /* Green for success */
  --danger: #ef4444;       /* Red for errors */
  --warning: #f59e0b;      /* Orange for warnings */
  --bg-primary: #ffffff;   /* White background */
  --bg-secondary: #f8fafc; /* Light gray */
  --text-primary: #0f172a; /* Dark text */
  --text-secondary: #64748b; /* Gray text */
}
```

### Typography
- **Font Family**: Inter, system-ui, or Roboto
- **Headings**: Bold, larger size
- **Body**: Regular weight
- **Code**: Monospace font

### Spacing
- Use 8px grid system (8, 16, 24, 32, 48, 64px)
- Consistent padding in cards and containers
- Proper margin between messages

---

## Performance Considerations

1. **Virtualization**: For long chat histories, use virtual scrolling (react-window)
2. **Debouncing**: Debounce input to prevent excessive API calls
3. **Lazy Loading**: Code-split routes and heavy components
4. **Memoization**: Use React.memo for expensive components
5. **Token Refresh**: Implement automatic token refresh before expiration

---

## Security Best Practices

1. **Token Storage**: Store JWT in httpOnly cookies or secure localStorage
2. **XSS Prevention**: Sanitize user input before rendering
3. **HTTPS Only**: Ensure all API calls use HTTPS
4. **Token Expiration**: Handle expired tokens gracefully
5. **Logout**: Clear all tokens on logout

---

## Testing Scenarios

### Authentication
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Signup with new user
- [ ] Signup with existing username
- [ ] Token refresh on expiration
- [ ] Logout and clear session

### Chat Functionality
- [ ] Send message and receive response
- [ ] Display AI message with form component
- [ ] Display AI message with table component
- [ ] Display AI message with analysis
- [ ] Handle loading state
- [ ] Handle API errors
- [ ] Scroll to bottom on new message

### Form Submission
- [ ] Fill and submit transfer form
- [ ] Validate required fields
- [ ] Show success message after submission
- [ ] Handle submission errors
- [ ] Prefill form fields from AI

### Responsive Design
- [ ] Mobile view (< 768px)
- [ ] Tablet view (768px - 1024px)
- [ ] Desktop view (> 1024px)

---

## Example Implementation Checklist

### Phase 1: Basic Setup
- [ ] Initialize React project with TypeScript
- [ ] Set up routing (React Router)
- [ ] Configure Axios with interceptors
- [ ] Create auth context/slice
- [ ] Implement login/signup pages

### Phase 2: Chat Interface
- [ ] Create chat layout
- [ ] Implement message display
- [ ] Add input component
- [ ] Connect to chat API
- [ ] Handle loading states

### Phase 3: Dynamic Components
- [ ] Create DynamicForm component
- [ ] Create DynamicTable component
- [ ] Add form validation
- [ ] Handle form submission
- [ ] Display API responses

### Phase 4: Polish
- [ ] Add animations and transitions
- [ ] Implement error handling
- [ ] Add toast notifications
- [ ] Optimize performance
- [ ] Test on multiple devices

---

## Sample Code Structure

```
src/
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── SignupForm.tsx
│   ├── chat/
│   │   ├── ChatInterface.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── ChatInput.tsx
│   │   └── LoadingIndicator.tsx
│   ├── dynamic/
│   │   ├── DynamicForm.tsx
│   │   ├── DynamicTable.tsx
│   │   └── FormField.tsx
│   └── layout/
│       ├── Header.tsx
│       └── Layout.tsx
├── context/
│   ├── AuthContext.tsx
│   └── ChatContext.tsx
├── hooks/
│   ├── useAuth.ts
│   └── useChat.ts
├── services/
│   ├── api.ts
│   ├── authService.ts
│   └── chatService.ts
├── types/
│   ├── auth.types.ts
│   ├── chat.types.ts
│   └── component.types.ts
├── utils/
│   ├── formatters.ts
│   └── validators.ts
├── pages/
│   ├── LoginPage.tsx
│   ├── SignupPage.tsx
│   └── ChatPage.tsx
├── App.tsx
└── main.tsx
```

---

## API Integration Example

```typescript
// services/chatService.ts
import axios from 'axios';

const API_BASE = 'http://localhost:8000/api/v1';

export const sendChatMessage = async (prompt: string, token: string) => {
  const response = await axios.post(
    `${API_BASE}/chat/process/`,
    { prompt },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
};

// Usage in component
const handleSendMessage = async () => {
  setIsLoading(true);
  try {
    const response = await sendChatMessage(inputValue, accessToken);
    
    setMessages(prev => [...prev, 
      { role: 'user', content: inputValue, timestamp: new Date() },
      { 
        role: 'assistant', 
        content: response.message,
        components: response.components,
        analysis: response.analysis,
        timestamp: new Date()
      }
    ]);
  } catch (error) {
    // Handle error
  } finally {
    setIsLoading(false);
  }
};
```

---

## Deployment Notes

- **Environment Variables**: 
  - `VITE_API_BASE_URL` - Backend API URL
  - `VITE_WS_URL` - WebSocket URL (if adding real-time features)

- **Build Command**: `npm run build`
- **Output**: `dist/` folder
- **Deploy to**: Vercel, Netlify, or serve with nginx

---

## Future Enhancements

1. **Real-time Updates**: WebSocket for instant notifications
2. **Voice Input**: Speech-to-text for prompts
3. **Dark Mode**: Theme toggle
4. **Multi-language**: i18n support
5. **Analytics**: Track user interactions
6. **Attachments**: Upload documents for loan applications
7. **Chat History**: Persistent conversation storage
8. **Suggested Prompts**: Quick action buttons

---

This specification provides everything needed to build a complete, production-ready React frontend for the AI Banking Assistant. Use this as your guide for implementation! 🚀
