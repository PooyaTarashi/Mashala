"""
Chat views for LLM-powered conversational banking assistant.

This module handles user prompts, orchestrates LLM interactions,
executes tools, and returns structured responses with UI components
and analysis.
"""

import json
import os
from typing import List, Dict, Any, Optional
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from openai import AsyncOpenAI
from pydantic import ValidationError
from asgiref.sync import sync_to_async

from .tool_registry import (
    TOOLS,
    TOOL_SCHEMAS,
    get_tool_function,
    get_tool_input_model,
    is_data_fetching_tool,
    is_ui_generation_tool
)


class ChatProcessView(APIView):
    """
    Processes user chat prompts using LLM with function calling.
    
    Flow:
    1. Receives user prompt
    2. Sends to LLM with available tools
    3. Executes any tool calls
    4. Determines if second round (analysis) is needed
    5. Returns structured response with components and analysis
    """
    
    permission_classes = [IsAuthenticated]
    
    async def dispatch(self, request, *args, **kwargs):
        """
        Override dispatch to handle async views properly with DRF.
        """
        # Setup
        self.args = args
        self.kwargs = kwargs
        self.format_kwarg = self.get_format_suffix(**kwargs)
        
        # Convert Django request to DRF request
        request = self.initialize_request(request, *args, **kwargs)
        self.request = request
        self.headers = self.default_response_headers

        try:
            # Perform initial checks (auth, permissions, throttling)
            await self.initial(request, *args, **kwargs)

            # Get the appropriate handler method
            if request.method.lower() in self.http_method_names:
                handler = getattr(self, request.method.lower(),
                                  self.http_method_not_allowed)
            else:
                handler = self.http_method_not_allowed

            response = await handler(request, *args, **kwargs)

        except Exception as exc:
            response = self.handle_exception(exc)

        self.response = self.finalize_response(request, response, *args, **kwargs)
        return self.response
    
    async def initial(self, request, *args, **kwargs):
        """
        Override to make authentication and permission checks async-compatible.
        Runs before the handler method.
        """
        # Perform content negotiation and store the accepted info on the request
        neg = self.perform_content_negotiation(request)
        request.accepted_renderer, request.accepted_media_type = neg
        
        # Determine the API version, if versioning is in use
        version, scheme = self.determine_version(request, *args, **kwargs)
        request.version, request.versioning_scheme = version, scheme
        
        # Ensure that the incoming request is permitted - wrapped in sync_to_async
        await sync_to_async(self.perform_authentication, thread_sensitive=True)(request)
        await sync_to_async(self.check_permissions, thread_sensitive=True)(request)
        await sync_to_async(self.check_throttles, thread_sensitive=True)(request)
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.openai_client = None
        self.system_prompt = """You are a helpful and professional banking assistant for a mobile banking application.

Your role is to help users with:
- Checking their account balance and transaction history
- Viewing and paying utility bills
- Exploring and applying for loans
- Transferring money to other accounts
- Analyzing their spending patterns and financial health

When users want to perform actions (transfer money, apply for loan, pay bill), use the generate_form tool to create appropriate forms with any known values prefilled.

When users want to view or analyze data (transactions, bills, spending patterns), use the appropriate get_* tools to fetch data, then provide helpful analysis and insights.

Always be:
- Clear and concise in your responses
- Helpful and proactive in suggesting next steps
- Secure - never ask for sensitive information that you shouldn't need
- Polite and professional

If a user's request is unclear, ask clarifying questions before taking action."""
    
    def get_openai_client(self) -> AsyncOpenAI:
        """
        Initializes and returns the OpenAI client.
        
        Uses API key from environment variables. Supports both OpenAI
        and OpenRouter (or other OpenAI-compatible APIs).
        """
        if self.openai_client is None:
            api_key = os.getenv('OPENAI_API_KEY')
            base_url = os.getenv('OPENAI_BASE_URL', None)  # Optional: for OpenRouter, etc.
            
            if not api_key:
                raise ValueError(
                    "OPENAI_API_KEY not found in environment variables. "
                    "Please add it to your .env file."
                )
            
            self.openai_client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url if base_url else None
            )
        
        return self.openai_client
    
    async def execute_tool(
        self,
        tool_name: str,
        tool_arguments: Dict[str, Any],
        user
    ) -> Dict[str, Any]:
        """
        Executes a tool function with validation.
        
        Args:
            tool_name: Name of the tool to execute
            tool_arguments: Arguments to pass to the tool
            user: The authenticated user object
        
        Returns:
            Dictionary with execution result or error
        """
        try:
            # Get tool function and input model
            tool_function = get_tool_function(tool_name)
            input_model = get_tool_input_model(tool_name)
            
            if not tool_function:
                return {
                    'error': f'Unknown tool: {tool_name}',
                    'tool_name': tool_name
                }
            
            # Wrap tool function with sync_to_async since tools use Django ORM
            async_tool_function = sync_to_async(tool_function, thread_sensitive=True)
            
            # Check if this is a UI generation tool (doesn't need user parameter)
            is_ui_tool = is_ui_generation_tool(tool_name)
            
            # Validate and execute based on tool signature
            if input_model:
                # Validate arguments with Pydantic
                try:
                    validated_params = input_model(**tool_arguments)
                    
                    # UI generation tools don't need user parameter
                    if is_ui_tool:
                        result = await async_tool_function(validated_params)
                    else:
                        result = await async_tool_function(user, validated_params)
                        
                except ValidationError as e:
                    # Convert Pydantic errors to JSON-serializable format
                    error_details = []
                    for error in e.errors():
                        error_details.append({
                            'field': '.'.join(str(loc) for loc in error['loc']),
                            'message': error['msg'],
                            'type': error['type']
                        })
                    return {
                        'error': f'Invalid parameters for {tool_name}',
                        'details': error_details,
                        'tool_name': tool_name
                    }
            else:
                # No input model, just pass user
                result = await async_tool_function(user)
            
            return {
                'success': True,
                'result': result,
                'tool_name': tool_name
            }
        
        except Exception as e:
            return {
                'error': f'Error executing {tool_name}: {str(e)}',
                'tool_name': tool_name
            }
    
    def categorize_tool_results(
        self,
        tool_executions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Categorizes tool execution results by type.
        
        Separates results into:
        - components: UI elements for frontend (from ui_generation tools)
        - analysis_data: Data for LLM to analyze (from data_fetching tools)
        
        Args:
            tool_executions: List of tool execution results
        
        Returns:
            Dictionary with 'components' and 'analysis_data' lists
        """
        components = []
        analysis_data = []
        
        for execution in tool_executions:
            tool_name = execution.get('tool_name')
            
            if not execution.get('success'):
                # Handle errors
                continue
            
            result = execution.get('result')
            
            if is_ui_generation_tool(tool_name):
                # UI component for frontend
                components.append(result)
            
            elif is_data_fetching_tool(tool_name):
                # Data for LLM analysis
                analysis_data.append({
                    'tool': tool_name,
                    'data': result
                })
        
        return {
            'components': components,
            'analysis_data': analysis_data
        }
    
    def needs_second_round(self, tool_executions: List[Dict[str, Any]]) -> bool:
        """
        Determines if a second LLM call is needed for analysis.
        
        Second round is needed when data-fetching tools were called,
        indicating the LLM should analyze the fetched data.
        
        Args:
            tool_executions: List of tool execution results
        
        Returns:
            True if second round needed, False otherwise
        """
        for execution in tool_executions:
            tool_name = execution.get('tool_name')
            if is_data_fetching_tool(tool_name) and execution.get('success'):
                return True
        return False
    
    async def post(self, request):
        """
        Handles POST requests with user prompts.
        
        Request body:
        {
            "prompt": "Show my last 10 transactions and analyze them"
        }
        
        Response:
        {
            "message": "LLM's initial response",
            "components": [{"component": "dynamic_form", "config": {...}}],
            "analysis": "LLM's analysis after seeing data (if applicable)",
            "metadata": {"rounds": 1, "tools_used": ["get_transactions"]}
        }
        """
        try:
            # Extract prompt from request
            prompt = request.data.get('prompt')
            
            if not prompt:
                return Response(
                    {'error': 'Prompt is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            user = request.user
            
            # Initialize OpenAI client
            client = self.get_openai_client()
            
            # Prepare messages for first LLM call
            messages = [
                {'role': 'system', 'content': self.system_prompt},
                {'role': 'user', 'content': prompt}
            ]
            
            # Debug: Print message details
            print("\n" + "="*80)
            print("REQUEST TO LLM:")
            print(f"Model: {os.getenv('OPENAI_MODEL', 'gpt-4o')}")
            print(f"\nSystem Prompt Length: {len(self.system_prompt)} characters")
            print(f"User Prompt: {prompt}")
            print(f"User Prompt Length: {len(prompt)} characters")
            print(f"\nNumber of Tools: {len(TOOL_SCHEMAS)}")
            print(f"Tool Names: {[t['function']['name'] for t in TOOL_SCHEMAS]}")
            
            # Estimate tokens (rough: 1 token ≈ 4 characters)
            total_chars = len(self.system_prompt) + len(prompt)
            estimated_tokens = total_chars // 4
            print(f"\nEstimated Input Tokens: ~{estimated_tokens}")
            print("="*80 + "\n")
            
            # First LLM call with tools
            response = await client.chat.completions.create(
                model=os.getenv('OPENAI_MODEL', 'gpt-4o'),
                messages=messages,
                tools=TOOL_SCHEMAS,
                tool_choice='auto',
                temperature=0.7,
                max_tokens=1000  # Limit response length to save credits
            )
            
            assistant_message = response.choices[0].message
            initial_message = assistant_message.content or ""
            
            # Add assistant message to conversation history
            messages.append(assistant_message)
            
            # Track tool executions
            tool_executions = []
            tools_used = []
            
            # Execute tool calls if any
            if assistant_message.tool_calls:
                for tool_call in assistant_message.tool_calls:
                    tool_name = tool_call.function.name
                    tools_used.append(tool_name)
                    
                    try:
                        tool_arguments = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError:
                        tool_arguments = {}
                    
                    # Execute the tool
                    execution_result = await self.execute_tool(
                        tool_name,
                        tool_arguments,
                        user
                    )
                    tool_executions.append(execution_result)
                    
                    # Debug: Print execution result
                    print(f"\n[TOOL EXECUTION] {tool_name}")
                    print(f"Arguments: {tool_arguments}")
                    print(f"Success: {execution_result.get('success')}")
                    if execution_result.get('success'):
                        print(f"Result: {execution_result.get('result')}")
                    else:
                        print(f"Error: {execution_result.get('error')}")
                    
                    # Prepare result for LLM
                    if execution_result.get('success'):
                        if is_ui_generation_tool(tool_name):
                            # For UI tools, just confirm generation
                            llm_result = {
                                'status': 'Component generated successfully',
                                'type': execution_result['result'].get('component')
                            }
                        else:
                            # For data tools, send actual data
                            llm_result = execution_result['result']
                    else:
                        # Send error to LLM
                        llm_result = {
                            'error': execution_result.get('error'),
                            'tool': tool_name
                        }
                    
                    # Add tool result to messages
                    messages.append({
                        'role': 'tool',
                        'tool_call_id': tool_call.id,
                        'content': json.dumps(llm_result, default=str)
                    })
            
            # Categorize results
            categorized = self.categorize_tool_results(tool_executions)
            components = categorized['components']
            analysis_data = categorized['analysis_data']
            
            # Determine if second round is needed
            need_analysis = self.needs_second_round(tool_executions)
            analysis = None
            rounds = 1
            
            if need_analysis and assistant_message.tool_calls:
                # Second LLM call for analysis
                rounds = 2
                
                final_response = await client.chat.completions.create(
                    model=os.getenv('OPENAI_MODEL', 'gpt-4o'),
                    messages=messages,
                    temperature=0.7,
                    max_tokens=1000,  # Limit response length to save credits
                    tool_choice='none'  # No more tool calls
                )
                
                analysis = final_response.choices[0].message.content
            
            # Build response
            response_data = {
                'message': initial_message,
                'components': components,
                'analysis': analysis,
                'metadata': {
                    'rounds': rounds,
                    'tools_used': tools_used,
                    'has_analysis': analysis is not None
                }
            }
            
            return Response(response_data, status=status.HTTP_200_OK)
        
        except ValueError as e:
            # Configuration errors
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        except Exception as e:
            # Unexpected errors - log for debugging
            import traceback
            print(f"Error in ChatProcessView: {str(e)}")
            print(traceback.format_exc())
            
            return Response(
                {
                    'error': 'An error occurred processing your request',
                    'details': str(e)
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
