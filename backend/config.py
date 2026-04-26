"""
Configuration management for LMS Analytics
Loads environment variables from .env file
"""
import os
from dotenv import load_dotenv
from typing import List

# Load environment variables from .env file
load_dotenv()

# ========== SECURITY ==========
SECRET_KEY: str = os.getenv("SECRET_KEY", "your_super_secret_key_change_this_in_production")
ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# ========== DATABASE ==========
MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "lms_analytics")

# ========== API ==========
API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
API_PORT: int = int(os.getenv("API_PORT", "8000"))
API_RELOAD: bool = os.getenv("API_RELOAD", "True").lower() == "true"

# ========== CORS ==========
CORS_ORIGINS_STR: str = os.getenv("CORS_ORIGINS", "http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8000,http://localhost:8000")
CORS_ORIGINS: List[str] = [origin.strip() for origin in CORS_ORIGINS_STR.split(",")]

# ========== AI/GENERATIVE ==========
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

# ========== ENVIRONMENT ==========
ENV: str = os.getenv("ENV", "development")
DEBUG: bool = ENV == "development"

# ========== VALIDATION ==========
if not SECRET_KEY or SECRET_KEY == "your_super_secret_key_change_this_in_production":
    if ENV == "production":
        raise ValueError("SECRET_KEY must be set in production!")
    print("⚠️  WARNING: Using default SECRET_KEY. Please change in production!")
