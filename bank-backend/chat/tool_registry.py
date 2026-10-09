"""
Tool registry for OpenAI function calling.

This module manages the mapping between tool names and their implementations,
and automatically generates OpenAI-compatible tool schemas from Python functions
and Pydantic models.
"""

import inspect
from typing import Dict, List, Any, Optional, Callable
from pydantic import BaseModel
from pydantic_core import PydanticUndefined
from .tools import (
    get_transactions,
    get_bills,
    get_loan_plans,
    get_account_balance,
    generate_form
)
from .schemas import (
    GetTransactionsInput,
    GetBillsInput,
    GenerateFormInput
)


# ============================================================================
# SCHEMA GENERATION UTILITIES
# ============================================================================

def extract_description_from_docstring(docstring: str) -> str:
    """
    Extracts the main description from a function's docstring.
    
    Takes the first paragraph (lines before first blank line or Args: section)
    as the main description for the LLM to understand the tool's purpose.
    """
    if not docstring:
        return "No description available"
    
    lines = docstring.strip().split('\n')
    description_lines = []
    
    for line in lines:
        line = line.strip()
        
        # Stop at first blank line or Args/Returns section
        if not line or line.startswith(('Args:', 'Returns:', 'Raises:', 'Note:', 'Example:')):
            break
        
        description_lines.append(line)
    
    # Join and clean up
    description = ' '.join(description_lines)
    return description


def pydantic_to_openai_schema(model: type[BaseModel]) -> Dict[str, Any]:
    """
    Converts a Pydantic model to OpenAI function parameters schema.
    
    Extracts field names, types, descriptions, and validation constraints
    from the Pydantic model and formats them for OpenAI's function calling API.
    """
    schema = model.model_json_schema()
    
    # Extract properties and required fields
    properties = {}
    required = []
    
    for field_name, field_info in model.model_fields.items():
        field_schema = schema.get('properties', {}).get(field_name, {})
        
        # Build OpenAI-compatible property definition
        property_def = {
            'type': field_schema.get('type', 'string'),
            'description': field_info.description or f"The {field_name} parameter"
        }
        
        # Add enum values if present (from Literal types)
        if 'enum' in field_schema:
            property_def['enum'] = field_schema['enum']
        
        # Add anyOf if present (for Optional types)
        if 'anyOf' in field_schema:
            # Extract the non-null type
            for type_option in field_schema['anyOf']:
                if type_option.get('type') != 'null':
                    property_def['type'] = type_option.get('type', 'string')
                    if 'enum' in type_option:
                        property_def['enum'] = type_option['enum']
        
        # Add default value if present (not PydanticUndefined)
        if field_info.default is not PydanticUndefined and field_info.default is not None:
            property_def['default'] = field_info.default
        
        # Add numerical constraints if present
        if hasattr(field_info, 'ge') and field_info.ge is not None:
            property_def['minimum'] = field_info.ge
        if hasattr(field_info, 'le') and field_info.le is not None:
            property_def['maximum'] = field_info.le
        
        properties[field_name] = property_def
        
        # Check if field is required
        if field_info.is_required():
            required.append(field_name)
    
    return {
        'type': 'object',
        'properties': properties,
        'required': required
    }


def function_to_openai_schema(
    func: Callable,
    input_model: Optional[type[BaseModel]] = None
) -> Dict[str, Any]:
    """
    Converts a Python function into an OpenAI tool schema.
    
    Extracts the function name and description from the docstring,
    and if an input model is provided, generates the parameters schema
    from the Pydantic model.
    
    Args:
        func: The Python function to convert
        input_model: Optional Pydantic model for parameter validation
    
    Returns:
        OpenAI-compatible tool schema dictionary
    """
    # Extract function name
    function_name = func.__name__
    
    # Extract description from docstring
    docstring = inspect.getdoc(func)
    description = extract_description_from_docstring(docstring or "")
    
    # Build base schema
    schema = {
        'type': 'function',
        'function': {
            'name': function_name,
            'description': description,
            'parameters': {
                'type': 'object',
                'properties': {},
                'required': []
            }
        }
    }
    
    # Add parameters from Pydantic model if provided
    if input_model:
        schema['function']['parameters'] = pydantic_to_openai_schema(input_model)
    
    return schema


# ============================================================================
# TOOL REGISTRY
# ============================================================================

# Map of tool names to their implementations and input models
TOOLS: Dict[str, Dict[str, Any]] = {
    'get_transactions': {
        'function': get_transactions,
        'input_model': GetTransactionsInput,
        'category': 'data_fetching',
        'description': 'Fetches transaction history for LLM analysis'
    },
    'get_bills': {
        'function': get_bills,
        'input_model': GetBillsInput,
        'category': 'data_fetching',
        'description': 'Fetches bills for LLM analysis'
    },
    'get_loan_plans': {
        'function': get_loan_plans,
        'input_model': None,
        'category': 'data_fetching',
        'description': 'Fetches available loan plans for LLM analysis'
    },
    'get_account_balance': {
        'function': get_account_balance,
        'input_model': None,
        'category': 'data_fetching',
        'description': 'Fetches user account balance for LLM analysis'
    },
    'generate_form': {
        'function': generate_form,
        'input_model': GenerateFormInput,
        'category': 'ui_generation',
        'description': 'Generates form/table configuration for frontend rendering'
    }
}


# Generate OpenAI-compatible tool schemas
TOOL_SCHEMAS: List[Dict[str, Any]] = [
    function_to_openai_schema(
        tool_info['function'],
        tool_info['input_model']
    )
    for tool_info in TOOLS.values()
]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_tool_function(tool_name: str) -> Optional[Callable]:
    """
    Retrieves the implementation function for a given tool name.
    
    Args:
        tool_name: Name of the tool to retrieve
    
    Returns:
        The tool function, or None if not found
    """
    tool_info = TOOLS.get(tool_name)
    return tool_info['function'] if tool_info else None


def get_tool_input_model(tool_name: str) -> Optional[type[BaseModel]]:
    """
    Retrieves the input model (Pydantic schema) for a given tool name.
    
    Args:
        tool_name: Name of the tool
    
    Returns:
        The Pydantic model class, or None if no model is defined
    """
    tool_info = TOOLS.get(tool_name)
    return tool_info['input_model'] if tool_info else None


def get_tool_category(tool_name: str) -> Optional[str]:
    """
    Gets the category of a tool (data_fetching or ui_generation).
    
    This helps determine how to handle the tool's results:
    - data_fetching: Results go to LLM for analysis
    - ui_generation: Results go to frontend as components
    
    Args:
        tool_name: Name of the tool
    
    Returns:
        Category string, or None if tool not found
    """
    tool_info = TOOLS.get(tool_name)
    return tool_info['category'] if tool_info else None


def is_data_fetching_tool(tool_name: str) -> bool:
    """
    Checks if a tool is a data fetching tool (returns data for LLM analysis).
    
    Args:
        tool_name: Name of the tool
    
    Returns:
        True if tool fetches data for LLM, False otherwise
    """
    return get_tool_category(tool_name) == 'data_fetching'


def is_ui_generation_tool(tool_name: str) -> bool:
    """
    Checks if a tool is a UI generation tool (returns component configs).
    
    Args:
        tool_name: Name of the tool
    
    Returns:
        True if tool generates UI components, False otherwise
    """
    return get_tool_category(tool_name) == 'ui_generation'


def get_available_tool_names() -> List[str]:
    """
    Returns a list of all available tool names.
    
    Returns:
        List of tool name strings
    """
    return list(TOOLS.keys())


def get_tool_info(tool_name: str) -> Optional[Dict[str, Any]]:
    """
    Gets complete information about a tool.
    
    Args:
        tool_name: Name of the tool
    
    Returns:
        Dictionary with function, input_model, category, and description
    """
    return TOOLS.get(tool_name)


# ============================================================================
# VALIDATION
# ============================================================================

def validate_tool_schemas():
    """
    Validates that all tool schemas are properly formatted.
    Raises an exception if any schema is invalid.
    
    This is useful for testing to ensure all tools are properly configured.
    """
    for schema in TOOL_SCHEMAS:
        assert 'type' in schema, "Schema must have 'type' field"
        assert schema['type'] == 'function', "Schema type must be 'function'"
        assert 'function' in schema, "Schema must have 'function' field"
        
        func_schema = schema['function']
        assert 'name' in func_schema, "Function schema must have 'name'"
        assert 'description' in func_schema, "Function schema must have 'description'"
        assert 'parameters' in func_schema, "Function schema must have 'parameters'"
        
        params = func_schema['parameters']
        assert 'type' in params, "Parameters must have 'type'"
        assert 'properties' in params, "Parameters must have 'properties'"


# Run validation on import (optional - comment out if not needed)
# validate_tool_schemas()
