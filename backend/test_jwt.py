from datetime import datetime, timedelta
from jose import jwt, JWTError

SECRET_KEY = "your_secret_key_change_this_for_production"
ALGORITHM = "HS256"

def test_token():
    email = "admin@gmail.com"
    expire = datetime.utcnow() + timedelta(minutes=60)
    to_encode = {"sub": email, "exp": expire}
    
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    print(f"Generated Token: {token}")
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        print(f"Decoded Payload: {payload}")
        if payload.get("sub") == email:
            print("Token validation SUCCESS")
        else:
            print("Token validation FAILED: sub mismatch")
    except JWTError as e:
        print(f"Token validation FAILED: {e}")

if __name__ == "__main__":
    test_token()
