"""
Input validation schemas for API requests
Uses Pydantic for automatic validation and documentation
"""
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime

# ========== AUTH VALIDATION ==========
class UserRegisterReq(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    
    @validator('full_name')
    def full_name_alphanumeric(cls, v):
        if not any(c.isalpha() for c in v):
            raise ValueError('Full name must contain at least one letter')
        return v.strip()
    
    @validator('password')
    def password_strength(cls, v):
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

class UserLoginReq(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)

# ========== STUDENT DATA VALIDATION ==========
class WeeklyMetricsReq(BaseModel):
    week: int = Field(..., ge=1, le=52)
    login_count: int = Field(..., ge=0)
    video_views: int = Field(..., ge=0)
    discussion_posts: int = Field(..., ge=0)
    quiz_attempts: int = Field(..., ge=0)
    assignment_submissions: int = Field(..., ge=0)
    assignment_completion_time: float = Field(..., ge=0)
    forum_activity: int = Field(..., ge=0)
    resource_downloads: int = Field(..., ge=0)
    last_access: Optional[datetime] = None

class StudentLogsReq(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=50)
    course_name: str = Field(..., min_length=1, max_length=100)
    weekly_data: List[WeeklyMetricsReq] = Field(..., min_items=1)

# ========== AI REQUESTS VALIDATION ==========
class AIExplainReq(BaseModel):
    api_key: Optional[str] = None  # Optional, can use config default
    student_data: Dict[str, Any] = Field(...)
    
    @validator('student_data')
    def student_data_not_empty(cls, v):
        if not v:
            raise ValueError('Student data cannot be empty')
        return v

class AIEmailReq(BaseModel):
    api_key: Optional[str] = None  # Optional, can use config default
    student_data: Dict[str, Any] = Field(...)
    recipient_email: Optional[EmailStr] = None

# ========== FILTER VALIDATION ==========
class PaginationReq(BaseModel):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)

class DashboardFilterReq(BaseModel):
    course: Optional[str] = None
    class_name: Optional[str] = None
    risk_level: Optional[str] = Field(None, regex="^(Nguy cơ|An toàn)$")
    pagination: Optional[PaginationReq] = None
