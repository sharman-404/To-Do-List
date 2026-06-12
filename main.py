import os, datetime, base64, json, httpx, schemas
from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from database import engine, Base, SessionLocal, get_db
import models_db as Models
from auth import hash_password, verify_password, create_access_token, verify_token
from dotenv import load_dotenv

load_dotenv()
 
# Create base tables
Base.metadata.create_all(bind=engine)
app = FastAPI(title="Bloom AI - Todo & User Management", version="1.0.0")
templates = Jinja2Templates(directory="templates")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AQ.Ab8RN6L3OVPAbMmV8MuDJfrvtem5WAlAbB3kwJwDStBvyQUp8A")
GEMINI_VISION_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

@app.get("/", response_class=HTMLResponse)
def root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html") 
@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html")
@app.get("/signup", response_class=HTMLResponse)
def signup_page(request: Request):
    return templates.TemplateResponse(request=request, name="signup.html")
@app.get("/dashboard", response_class=HTMLResponse)
def dashboard_page(request: Request):
    return templates.TemplateResponse(request=request, name="dashboard.html")
@app.get("/tasks", response_class=HTMLResponse)
def tasks_page(request: Request):
    return templates.TemplateResponse(request=request, name="tasks.html")
@app.get("/admin", response_class=HTMLResponse)
def admin_page(request: Request):
    return templates.TemplateResponse(request=request, name="admin.html")
 
# Setup auth scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")

# Static files & template settings
if os.path.isdir("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")
 
# Helper to verify token and get current active user
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = verify_token(token)
    username = payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(Models.User).filter(Models.User.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    if user.blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is blocked. Please reach out to an administrator."
        )
    return user
 
# Helper to require Administrator role
def get_current_admin(current_user: Models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation requires administrator privilege."
        )
    return current_user
 
# Seed default admin user on first boot if missing
@app.on_event("startup")
def seed_admin_user():
    db = SessionLocal()
    try:
        admin = db.query(Models.User).filter(Models.User.username == "admin").first()
        if not admin:
            hashed = hash_password("Admin@123")
            new_admin = Models.User(
                username="admin",
                email="admin@bloom.ai",
                password_hash=hashed,
                role="admin",
                approved=True,
                blocked=False
            )
            db.add(new_admin)
            db.commit()
            print("🚀 Successfully seeded default administrator user: username='admin', pwd='Admin@123'")
    except Exception as e:
        db.rollback()
        print(f"⚠️ Failed to seed administrator user: {e}")
    finally:
        db.close()
 
# ── authentication endpoints ──────────────────────────────────────────────────
@app.post("/api/signup", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def signup(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(Models.User).filter(Models.User.username == user_data.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username is already registered")
    db_email = db.query(Models.User).filter(Models.User.email == user_data.email).first()
    if db_email:
        raise HTTPException(status_code=400, detail="Email is already registered")
    is_first_user = db.query(Models.User).count() == 0
    hashed = hash_password(user_data.password)
    new_user = Models.User(
        username=user_data.username,
        email=user_data.email,
        password_hash=hashed,
        role="admin" if is_first_user else "user",
        approved=True if is_first_user else False,
        blocked=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user
 
@app.post("/api/login", response_model=schemas.TokenResponse)
def login(user_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(Models.User).filter(Models.User.username == user_data.username).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    if not user.approved:
        raise HTTPException(status_code=403, detail="Your account is pending administrator approval.")
    if user.blocked:
        raise HTTPException(status_code=403, detail="Your account is blocked by administrative settings.")
    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username
    } 
@app.post("/api/token", response_model=schemas.TokenResponse)
def token_login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Models.User).filter(Models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    if not user.approved:
        raise HTTPException(status_code=403, detail="Your account is pending approval.")
    if user.blocked:
        raise HTTPException(status_code=403, detail="Your account is blocked.")
    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username
    }
@app.get("/api/me", response_model=schemas.UserResponse)
def read_users_me(current_user: Models.User = Depends(get_current_user)):
    return current_user
# ── todo endpoints ────────────────────────────────────────────────────────────
@app.post("/api/todos", response_model=schemas.TodoResponse, status_code=status.HTTP_201_CREATED)
def create_todo(todo_data: schemas.TodoCreate, current_user: Models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    db_todo = Models.Todo(
        title=todo_data.title,
        description=todo_data.description,
        category=todo_data.category or "work",
        priority=todo_data.priority or "medium",
        status=todo_data.status or "pending",
        completed=False,
        due_date=todo_data.due_date,
        image_path=todo_data.image_path,
        ai_generated=todo_data.ai_generated or False,
        user_id=current_user.id
    )
    db.add(db_todo)
    db.commit()
    db.refresh(db_todo)
    return db_todo
 
@app.get("/api/todos", response_model=List[schemas.TodoResponse])
def get_todos(current_user: Models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Models.Todo).filter(Models.Todo.user_id == current_user.id).all()
 
@app.put("/api/todos/{todo_id}/toggle", response_model=schemas.TodoResponse)
def toggle_todo(todo_id: int, current_user: Models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_todo = db.query(Models.Todo).filter(Models.Todo.id == todo_id, Models.Todo.user_id == current_user.id).first()
    if not db_todo:
        raise HTTPException(status_code=404, detail="Todo item not found")
    db_todo.completed = not db_todo.completed
    db_todo.status = "completed" if db_todo.completed else "pending"
    db.commit()
    db.refresh(db_todo)
    return db_todo
 
@app.put("/api/todos/{todo_id}", response_model=schemas.TodoResponse)
def update_todo(todo_id: int, todo_update: schemas.TodoUpdate, current_user: Models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    db_todo = db.query(Models.Todo).filter(Models.Todo.id == todo_id, Models.Todo.user_id == current_user.id).first()
    if not db_todo:
        raise HTTPException(status_code=404, detail="Todo item not found")
    # priority and category are intentionally excluded from TodoUpdate — only admins may change these
    for key, val in todo_update.dict(exclude_unset=True).items():
        if key == "completed" and val is not None:
            db_todo.completed = val
            db_todo.status = "completed" if val else "pending"
        else:
            setattr(db_todo, key, val)
    db.commit()
    db.refresh(db_todo)
    return db_todo
 
@app.delete("/api/todos/{todo_id}")
def delete_todo(todo_id: int, current_user: Models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_todo = db.query(Models.Todo).filter(Models.Todo.id == todo_id, Models.Todo.user_id == current_user.id).first()
    if not db_todo:
        raise HTTPException(status_code=404, detail="Todo item not found")
    db.delete(db_todo)
    db.commit()
    return {"detail": "Todo item successfully deleted"}
 
# ── admin endpoints ───────────────────────────────────────────────────────────
@app.get("/api/admin/users", response_model=List[schemas.UserResponse])
def admin_get_users(admin: Models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(Models.User).all()
 
@app.get("/api/admin/pending-users", response_model=List[schemas.UserResponse])
def admin_get_pending_users(admin: Models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(Models.User).filter(Models.User.approved == False).all()
 
@app.put("/api/admin/approve/{user_id}", response_model=schemas.UserResponse)
def admin_approve_user(user_id: int, admin: Models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(Models.User).filter(Models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Target user not found")
    user.approved = True
    db.commit()
    db.refresh(user)
    return user
 
@app.put("/api/admin/block/{user_id}", response_model=schemas.UserResponse)
def admin_block_user(user_id: int, admin: Models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(Models.User).filter(Models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Target user not found")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot block an administrative user")
    user.blocked = True
    db.commit()
    db.refresh(user)
    return user
 
@app.put("/api/admin/unblock/{user_id}", response_model=schemas.UserResponse)
def admin_unblock_user(user_id: int, admin: Models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(Models.User).filter(Models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Target user not found")
    user.blocked = False
    db.commit()
    db.refresh(user)
    return user
 
@app.get("/api/admin/todos", response_model=List[schemas.TodoResponse])
def admin_get_all_todos(admin: Models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(Models.Todo).all()
 
@app.get("/api/admin/user/{user_id}/todos", response_model=List[schemas.TodoResponse])
def admin_get_user_todos(user_id: int, admin: Models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(Models.Todo).filter(Models.Todo.user_id == user_id).all()
 
@app.get("/api/admin/stats", response_model=schemas.DashboardStats)
def admin_get_stats(admin: Models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
    total_users = db.query(Models.User).count()
    total_tasks = db.query(Models.Todo).count()
    completed_tasks = db.query(Models.Todo).filter(Models.Todo.completed == True).count()
    pending_tasks = total_tasks - completed_tasks
    return {
        "total_users": total_users,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "pending_tasks": pending_tasks
    }
 
# ── Admin: override priority and/or category on any task ─────────────────────
@app.put("/api/admin/todos/{todo_id}/override", response_model=schemas.TodoResponse)
def admin_override_todo(
    todo_id: int,
    body: schemas.AdminTodoUpdate,
    admin: Models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    valid_priorities = {"high", "medium", "low"}
    valid_categories = {"work", "personal", "learning", "health", "other"}

    if body.priority is not None and body.priority not in valid_priorities:
        raise HTTPException(status_code=400, detail="Priority must be 'high', 'medium', or 'low'.")
    if body.category is not None and body.category not in valid_categories:
        raise HTTPException(status_code=400, detail="Category must be 'work', 'personal', 'learning', 'health', or 'other'.")

    db_todo = db.query(Models.Todo).filter(Models.Todo.id == todo_id).first()
    if not db_todo:
        raise HTTPException(status_code=404, detail="Todo item not found")

    if body.priority is not None:
        db_todo.priority = body.priority
    if body.category is not None:
        db_todo.category = body.category

    db.commit()
    db.refresh(db_todo)
    return db_todo

# Legacy single-field priority endpoint kept for backwards compatibility
class PriorityOverride(BaseModel):
    priority: str  # "high" | "medium" | "low"
 
@app.put("/api/admin/todos/{todo_id}/priority", response_model=schemas.TodoResponse)
def admin_set_todo_priority(
    todo_id: int,
    body: PriorityOverride,
    admin: Models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    if body.priority not in ("high", "medium", "low"):
        raise HTTPException(status_code=400, detail="Priority must be 'high', 'medium', or 'low'.")
    db_todo = db.query(Models.Todo).filter(Models.Todo.id == todo_id).first()
    if not db_todo:
        raise HTTPException(status_code=404, detail="Todo item not found")
    db_todo.priority = body.priority
    db.commit()
    db.refresh(db_todo)
    return db_todo
 
# ── NEW: AI priority suggestion endpoint ──────────────────────────────────────
class PrioritySuggestRequest(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = "work"
    due_date: Optional[str] = None
 
@app.post("/api/ai/suggest-priority")
async def suggest_priority(req: PrioritySuggestRequest):
    """Uses Gemini to suggest a priority level (high/medium/low) AND category for a task."""
    if not GEMINI_API_KEY:
        return {"priority": "medium", "category": "work", "reason": "AI key not configured, defaulting to medium/work."}
 
    prompt = (
        f"You are a strict task classifier. Analyze the task and assign the correct priority AND category.\n\n"
        f"PRIORITY RULES:\n"
        f"- high: urgent, life/health/emergency related, deadline today or tomorrow, critical consequences if missed\n"
        f"  Examples: medical emergencies, urgent deadlines, anything with words like 'urgent', 'emergency', 'ASAP', 'critical', 'blood', 'hospital', 'surgery'\n"
        f"- medium: important but not urgent, deadline within a week, professional tasks, scheduled activities\n"
        f"  Examples: work meetings, gym sessions, learning tasks, planned errands\n"
        f"- low: optional, leisure, no deadline, recreational, can be skipped without consequence\n"
        f"  Examples: gaming, watching movies, casual hobbies, someday tasks\n\n"
        f"CATEGORY RULES:\n"
        f"- work: professional tasks, meetings, projects, deadlines, emails, office-related\n"
        f"- personal: personal errands, family, social activities, chores, finances\n"
        f"- learning: studying, courses, books, research, skill-building, tutorials\n"
        f"- health: exercise, medical appointments, diet, mental wellness, sleep\n"
        f"- other: anything that does not clearly fit the above categories\n\n"
        f"Task title: {req.title}\n"
        f"Description: {req.description or 'none'}\n"
        f"Due date: {req.due_date or 'not specified'}\n\n"
        f"Respond with ONLY this JSON, no explanation, no markdown:\n"
        f"{{\"priority\": \"medium\", \"category\": \"work\", \"reason\": \"one short sentence\"}}"
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 1024, "thinkingConfig": {"thinkingBudget": 0}}
    }
 
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{GEMINI_VISION_URL}?key={GEMINI_API_KEY}",
            json=payload
        )

    print(f"[Priority AI] Status: {resp.status_code}")
    print(f"[Priority AI] Raw response: {resp.text}")

    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="Gemini quota exceeded. Please wait and try again.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {resp.status_code}")
    try:
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        print(f"[Priority AI] Extracted text: {text}")
        
        # Strip possible markdown fences
        text = text.replace("```json", "").replace("```", "").strip()
        result = json.loads(text)

        priority = result.get("priority", "medium").lower().strip()
        if priority not in ("high", "medium", "low"):
            priority = "medium"

        category = result.get("category", "work").lower().strip()
        if category not in ("work", "personal", "learning", "health", "other"):
            category = "other"

        print(f"[Priority AI] Final priority: {priority}, category: {category}")
        return {"priority": priority, "category": category, "reason": result.get("reason", "")}
    except Exception as e:
        print(f"[Priority AI] Parse error: {e}, raw text was: {resp.text[:500]}")
        return {"priority": "medium", "category": "work", "reason": "Could not parse AI response."}
 
# ── NEW: OCR / AI extract endpoint ───────────────────────────────────────────
class OcrExtractRequest(BaseModel):
    image_base64: str   # full data URI e.g. "data:image/png;base64,..."
    mime_type: str      # e.g. "image/png"
 
@app.post("/api/ai/extract")
async def ai_extract_tasks(req: OcrExtractRequest):
    """
    Accepts a base64-encoded image, sends it to Gemini Vision,
    and returns structured task objects parsed from the image text.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured on the server.")
 
    # Strip the data URI prefix if present to get raw base64
    raw_b64 = req.image_base64
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]
 
    # Validate it's actually base64
    try:
        base64.b64decode(raw_b64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data.")
 
    prompt = (
        "You are an OCR and task extraction assistant. Analyze this image carefully.\n"
        "1. Extract ALL visible text from the image.\n"
        "2. Identify any tasks, to-dos, action items, or goals from that text.\n"
        "3. For each task assign: title, description, priority (high/medium/low), "
        "category (work/personal/learning/health/other), and dueDate (YYYY-MM-DD or null).\n\n"
        "Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):\n"
        "{\n"
        "  \"extractedText\": \"<all text found in image>\",\n"
        "  \"tasks\": [\n"
        "    {\"title\": \"...\", \"description\": \"...\", \"priority\": \"medium\", "
        "\"category\": \"work\", \"dueDate\": null}\n"
        "  ]\n"
        "}"
    )
 
    payload = {
        "contents": [{
            "parts": [
                {
                    "inline_data": {
                        "mime_type": req.mime_type,
                        "data": raw_b64
                    }
                },
                {"text": prompt}
            ]
        }],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 2048}
    }
 
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{GEMINI_VISION_URL}?key={GEMINI_API_KEY}",
            json=payload
        )
 
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini Vision API returned status {resp.status_code}: {resp.text[:300]}"
        )
 
    try:
        raw_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Strip markdown fences if model adds them
        raw_text = raw_text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw_text)
 
        tasks = parsed.get("tasks", [])
        extracted_text = parsed.get("extractedText", "")
 
        # Sanitize each task
        valid_priorities = {"high", "medium", "low"}
        valid_categories = {"work", "personal", "learning", "health", "other"}
        sanitized = []
        for t in tasks:
            sanitized.append({
                "title": str(t.get("title", "Untitled Task"))[:200],
                "description": str(t.get("description", ""))[:500] if t.get("description") else None,
                "priority": t.get("priority", "medium") if t.get("priority") in valid_priorities else "medium",
                "category": t.get("category", "work") if t.get("category") in valid_categories else "work",
                "dueDate": t.get("dueDate")
            })
 
        return {
            "success": True,
            "extractedText": extracted_text,
            "tasks": sanitized
        }
 
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse Gemini response as JSON: {str(e)}")
    except (KeyError, IndexError) as e:
        raise HTTPException(status_code=502, detail=f"Unexpected Gemini response structure: {str(e)}")
 
 
# ── AI insights endpoint (existing, kept intact) ──────────────────────────────
class InsightsRequest(BaseModel):
    tasks: list
 
@app.post("/api/ai/insights")
async def get_ai_insights(req: InsightsRequest):
    if not GEMINI_API_KEY:
        return {"insights": []}
 
    prompt = (
        "You are a productivity AI. Analyze these tasks and return 3 actionable insights.\n"
        "Respond ONLY with a JSON array like:\n"
        "[{\"type\": \"recommendation\", \"title\": \"...\", \"message\": \"...\", \"date\": \"Today\"}]\n"
        "Types: alert, recommendation, trend.\n\n"
        f"Tasks: {json.dumps(req.tasks)}"
    )
 
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 800}
    }
 
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{GEMINI_VISION_URL}?key={GEMINI_API_KEY}",
            json=payload
        )
 
    if resp.status_code != 200:
        return {"insights": []}
 
    try:
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        text = text.replace("```json", "").replace("```", "").strip()
        insights = json.loads(text)
        return {"insights": insights}
    except Exception:
        return {"insights": []}
 
 
# ── debug and diagnostic utility routes ───────────────────────────────────────
@app.get("/approve-all")
def approve_all_users_diagnostic(db: Session = Depends(get_db)):
    users = db.query(Models.User).filter(Models.User.approved == False).all()
    count = len(users)
    for u in users:
        u.approved = True
    db.commit()
    return {"detail": f"Successfully approved {count} pending user accounts."}
 
@app.get("/check-users")
def check_users_diagnostic(db: Session = Depends(get_db)):
    users = db.query(Models.User).all()
    return [{"id": u.id, "username": u.username, "approved": u.approved, "role": u.role} for u in users]
 
@app.get("/debug-users")
def debug_users_diagnostic(db: Session = Depends(get_db)):
    users = db.query(Models.User).all()
    return [{
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "role": u.role,
        "approved": u.approved,
        "blocked": u.blocked
    } for u in users]
 
@app.get("/reset-admin")
def reset_admin_password_diagnostic(db: Session = Depends(get_db)):
    admin = db.query(Models.User).filter(Models.User.username == "admin").first()
    if not admin:
        hashed = hash_password("Admin@123")
        admin = Models.User(
            username="admin",
            email="admin@bloom.ai",
            password_hash=hashed,
            role="admin",
            approved=True,
            blocked=False
        )
        db.add(admin)
    else:
        admin.password_hash = hash_password("Admin@123")
        admin.approved = True
        admin.blocked = False
    db.commit()
    return {"detail": "Admin password successfully reset to 'Admin@123', state set to approved/active."}
