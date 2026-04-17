from database import users
import json

def check_users():
    all_users = list(users.find({}))
    for u in all_users:
        u['_id'] = str(u['_id'])
        if 'password' in u:
            u['password'] = '[REDACTED]'
    print(json.dumps(all_users, indent=2))

if __name__ == "__main__":
    check_users()
