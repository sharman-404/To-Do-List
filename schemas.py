from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    approved: bool
    blocked: bool
    class Config:
        from_attributes = True

class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = "work"
    priority: Optional[str] = "medium"
    status: Optional[str] = "pending"
    due_date: Optional[str] = None
    image_path: Optional[str] = None
    ai_generated: Optional[bool] = False

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    # priority and category are intentionally excluded — only admins may change these
    status: Optional[str] = None
    completed: Optional[bool] = None
    due_date: Optional[str] = None

class AdminTodoUpdate(BaseModel):
    priority: Optional[str] = None
    category: Optional[str] = None

class TodoResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    category: str
    priority: str
    status: str
    completed: bool
    due_date: Optional[str] = None
    image_path: Optional[str] = None
    ai_generated: bool
    created_at: datetime
    user_id: int
    class Config:
        from_attributes = True

class CategoryCreate(BaseModel):
    name: str
    emoji: Optional[str] = "📌"
    color: Optional[str] = "slate"
    description: Optional[str] = None

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None

class CategoryResponse(BaseModel):
    id: int
    name: str
    emoji: str
    color: str
    description: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class DashboardStats(BaseModel):
    total_users: int
    total_tasks: int
    completed_tasks: int
    pending_tasks: int
