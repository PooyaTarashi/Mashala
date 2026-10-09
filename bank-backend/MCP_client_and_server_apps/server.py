import os
import json
from time import time
from mcp.server.fastmcp import FastMCP

# Creating the server instance
mcp = FastMCP(
    name='BankingAssistant',
    host='0.0.0.0',
    port=8050
)

# Creating the session for the account
@mcp.tool()
def create_account_session(account_id: str, account_password: str) -> str:
    """
    Creates an account session if the credentials are valid.
    """
    # Validate account credentials using json file
    with open('data/accounts.json', 'r') as f:
        accounts = json.load(f)
    
    # Check if account exists and password matches
    if account_id in accounts and accounts[account_id].get('password') == account_password:
        # Generate and save a session token with 10 min expiration
        session_token = os.urandom(16).hex()

        with open('data/sessions.json', 'r+') as f:
            sessions = json.load(f)
            # Store session by TOKEN as key
            sessions[session_token] = {
                "account_id": account_id,
                "expires": time() + 600  # 10 minutes from now
            }
            f.seek(0)
            json.dump(sessions, f, indent=2)
            f.truncate()
        return session_token
    else:
        return "Invalid account credentials."

# Creating function to return account balance
@mcp.tool()
def get_account_balance(session_token: str) -> str:
    """
    Returns the account balance for the account associated with the session token.
    Args:
        session_token (str): The session token of the account.
    """
    # Validate session
    with open('data/sessions.json', 'r') as f:
        sessions = json.load(f)
    session = sessions.get(session_token, None)
    
    if session and session['expires'] > time():
        # Load accounts data
        with open('data/accounts.json', 'r') as f:
            accounts = json.load(f)
        account_data = accounts.get(session['account_id'], None)
        if account_data is not None:
            balance = account_data.get('balance', account_data)
            return f"The balance for account {session['account_id']} is ${balance:.2f}"
    return "Invalid session or account not found."


# Creating function to transfer funds
@mcp.tool()
def transfer_funds(session_token: str, to_account: str, amount: float) -> str:
    """
    Transfers funds from the account to another account.
    Args:
        session_token (str): The session token of the account.
        to_account (str): The account to transfer funds to.
        amount (float): The amount to transfer.
    """
    # Validate session
    with open('data/sessions.json', 'r') as f:
        sessions = json.load(f)
    session = sessions.get(session_token, None)
    
    if session and session['expires'] > time():
        # Load accounts data
        with open('data/accounts.json', 'r') as f:
            accounts = json.load(f)
        
        from_account = session['account_id']
        from_account_data = accounts.get(from_account)
        to_account_data = accounts.get(to_account)
        
        if from_account_data is None:
            return "Source account not found."
        if to_account_data is None:
            return "Destination account not found."
        
        # Get current balances
        from_balance = from_account_data.get('balance', from_account_data)
        to_balance = to_account_data.get('balance', to_account_data)
        
        if from_balance >= amount:
            # Update balances
            accounts[from_account]['balance'] = from_balance - amount
            accounts[to_account]['balance'] = to_balance + amount

            with open('data/accounts.json', 'w') as f_write:
                json.dump(accounts, f_write, indent=2)
            return f"Transferred ${amount:.2f} from account {from_account} to {to_account}."
        else:
            return "Insufficient funds."
    return "Invalid session token."


# Running the server
if __name__ == '__main__':
    mcp.run(transport="stdio")