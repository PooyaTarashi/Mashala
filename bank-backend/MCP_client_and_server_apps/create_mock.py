import json

def fill_mock_data():
    users = {
        "user1": "password1",
        "user2": "password2",
        "user3": "password3"
    }
    accounts = {
        "account1": 1000.00,
        "account2": 1500.50,
        "account3": 2000.75
    }
    sessions = {}
    with open('users.json', 'w') as f:
        json.dump(users, f)
    with open('accounts.json', 'w') as f:
        json.dump(accounts, f)
    with open('sessions.json', 'w') as f:
        json.dump(sessions, f)

if __name__ == "__main__":
    fill_mock_data()