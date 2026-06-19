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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "YOUR API KEY")
GEMINI_VISION_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

@app.get("/", response_class=HTMLResponse)
def root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html") 
@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    response = templates.TemplateResponse(request=request, name="login.html")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response
@app.get("/signup", response_class=HTMLResponse)
def signup_page(request: Request):
    response = templates.TemplateResponse(request=request, name="signup.html")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response
@app.get("/dashboard", response_class=HTMLResponse)
def dashboard_page(request: Request):
    response = templates.TemplateResponse(request=request, name="dashboard.html")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response
@app.get("/tasks", response_class=HTMLResponse)
def tasks_page(request: Request):
    response = templates.TemplateResponse(request=request, name="tasks.html")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response
@app.get("/admin", response_class=HTMLResponse)
def admin_page(request: Request):
    response = templates.TemplateResponse(request=request, name="admin.html")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response
 
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
 
# Seed default admin user + categories on first boot
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

        # Seed default categories if none exist
        if db.query(Models.Category).count() == 0:
            defaults = [
                Models.Category(name="work",     emoji="💼", color="sky",     description="Professional tasks and work deliverables"),
                Models.Category(name="personal",  emoji="👤", color="violet",  description="Personal goals and lifestyle tasks"),
                Models.Category(name="learning",  emoji="📚", color="indigo",  description="Study, courses and skill development"),
                Models.Category(name="health",    emoji="❤️", color="emerald", description="Fitness, wellness and medical tasks"),
                Models.Category(name="other",     emoji="✨", color="slate",   description="Miscellaneous tasks"),
            ]
            db.add_all(defaults)
            db.commit()
            print("🌱 Seeded 5 default categories.")
    except Exception as e:
        db.rollback()
        print(f"⚠️ Startup seed failed: {e}")
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
    # Fetch valid categories dynamically from the DB
    valid_categories = {c.name for c in db.query(Models.Category).all()}

    if body.priority is not None and body.priority not in valid_priorities:
        raise HTTPException(status_code=400, detail="Priority must be 'high', 'medium', or 'low'.")
    if body.category is not None and body.category not in valid_categories:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Valid categories are: {', '.join(sorted(valid_categories))}."
        )

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
async def suggest_priority(req: PrioritySuggestRequest, db: Session = Depends(get_db)):
    """Uses Gemini to suggest a priority level (high/medium/low) AND category for a task.
    Categories are sourced dynamically from the admin-managed Category table."""

    # ── Fetch admin-defined categories from DB ────────────────────────────────
    db_categories = db.query(Models.Category).order_by(Models.Category.name).all()
    # Fallback to sensible defaults if table is somehow empty
    if db_categories:
        category_names = [c.name for c in db_categories]
        category_rules = "\n".join(
            f"- {c.name}: {c.description or c.name + ' related tasks'}"
            for c in db_categories
        )
        fallback_category = category_names[0]
    else:
        category_names = ["work", "personal", "learning", "health", "other"]
        category_rules = (
            "- work: professional tasks, meetings, projects, deadlines, emails, office-related\n"
            "- personal: personal errands, family, social activities, chores, finances\n"
            "- learning: studying, courses, books, research, skill-building, tutorials\n"
            "- health: exercise, medical appointments, diet, mental wellness, sleep\n"
            "- other: anything that does not clearly fit the above categories"
        )
        fallback_category = "work"

    valid_category_set = set(category_names)

    if not GEMINI_API_KEY:
        return {"priority": "medium", "category": fallback_category, "reason": "AI key not configured."}

    prompt = (
        f"You are a strict task classifier. Analyze the task and assign the correct priority AND category.\n\n"
        f"PRIORITY RULES:\n"
        f"- high: urgent, life/health/emergency related, deadline today or tomorrow, critical consequences if missed\n"
        f"  Examples: medical emergencies, urgent deadlines, anything with words like 'urgent', 'emergency', 'ASAP', 'critical', 'blood', 'hospital', 'surgery'\n"
        f"- medium: important but not urgent, deadline within a week, professional tasks, scheduled activities\n"
        f"  Examples: work meetings, gym sessions, learning tasks, planned errands\n"
        f"- low: optional, leisure, no deadline, recreational, can be skipped without consequence\n"
        f"  Examples: gaming, watching movies, casual hobbies, someday tasks\n\n"
        f"CATEGORY RULES (you MUST pick one of the exact names listed below — no other values are allowed):\n"
        f"{category_rules}\n\n"
        f"Valid category values: {json.dumps(category_names)}\n\n"
        f"Task title: {req.title}\n"
        f"Description: {req.description or 'none'}\n"
        f"Due date: {req.due_date or 'not specified'}\n\n"
        f"Respond with ONLY this JSON, no explanation, no markdown:\n"
        f"{{\"priority\": \"medium\", \"category\": \"{fallback_category}\", \"reason\": \"one short sentence\"}}"
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

        # Validate against the live admin-defined category set
        category = result.get("category", fallback_category).lower().strip()
        if category not in valid_category_set:
            category = fallback_category

        print(f"[Priority AI] Final priority: {priority}, category: {category}")
        return {"priority": priority, "category": category, "reason": result.get("reason", "")}
    except Exception as e:
        print(f"[Priority AI] Parse error: {e}, raw text was: {resp.text[:500]}")
        return {"priority": "medium", "category": fallback_category, "reason": "Could not parse AI response."}
 
# ── NEW: OCR / AI extract endpoint ───────────────────────────────────────────
class OcrExtractRequest(BaseModel):
    image_base64: str   # full data URI e.g. "data:image/png;base64,..."
    mime_type: str      # e.g. "image/png"
 
@app.post("/api/ai/extract")
async def ai_extract_tasks(req: OcrExtractRequest, db: Session = Depends(get_db)):
    """
    Accepts a base64-encoded image, sends it to Gemini Vision,
    and returns structured task objects parsed from the image text.
    Categories are sourced dynamically from the admin-managed Category table.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured on the server.")

    # ── Fetch admin-defined categories from DB ────────────────────────────────
    db_categories = db.query(Models.Category).order_by(Models.Category.name).all()
    if db_categories:
        category_names = [c.name for c in db_categories]
        fallback_category = category_names[0]
    else:
        category_names = ["work", "personal", "learning", "health", "other"]
        fallback_category = "work"
    valid_categories = set(category_names)
 
    # Strip the data URI prefix if present to get raw base64
    raw_b64 = req.image_base64
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]
 
    # Validate it's actually base64
    try:
        base64.b64decode(raw_b64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data.")
 
    category_list_str = "/".join(category_names)
    prompt = (
        "You are an OCR and task extraction assistant. Analyze this image carefully.\n"
        "1. Extract ALL visible text from the image.\n"
        "2. Identify any tasks, to-dos, action items, or goals from that text.\n"
        f"3. For each task assign: title, description, priority (high/medium/low), "
        f"category (you MUST use one of these exact values: {category_list_str}), "
        f"and dueDate (YYYY-MM-DD or null).\n\n"
        f"Valid category values are ONLY: {json.dumps(category_names)} — do not invent new ones.\n\n"
        "Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):\n"
        "{\n"
        "  \"extractedText\": \"<all text found in image>\",\n"
        "  \"tasks\": [\n"
        f"    {{\"title\": \"...\", \"description\": \"...\", \"priority\": \"medium\", "
        f"\"category\": \"{fallback_category}\", \"dueDate\": null}}\n"
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
        sanitized = []
        for t in tasks:
            raw_cat = (t.get("category") or fallback_category).lower().strip()
            sanitized.append({
                "title": str(t.get("title", "Untitled Task"))[:200],
                "description": str(t.get("description", ""))[:500] if t.get("description") else None,
                "priority": t.get("priority", "medium") if t.get("priority") in valid_priorities else "medium",
                "category": raw_cat if raw_cat in valid_categories else fallback_category,
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
 
 
# ── Public: list categories (any authenticated user) ──────────────────────────
@app.get("/api/categories", response_model=List[schemas.CategoryResponse])
def list_categories_public(
    current_user: Models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return all admin-defined categories. Used by the task form and filter UI."""
    return db.query(Models.Category).order_by(Models.Category.name).all()

# ── category CRUD endpoints (admin only) ─────────────────────────────────────

@app.get("/api/admin/categories", response_model=List[schemas.CategoryResponse])
def list_categories(
    _admin: Models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Return all categories ordered alphabetically."""
    return db.query(Models.Category).order_by(Models.Category.name).all()

@app.post("/api/admin/categories", response_model=schemas.CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    data: schemas.CategoryCreate,
    _admin: Models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new category. Name must be unique."""
    name_clean = data.name.strip().lower()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Category name cannot be empty.")
    existing = db.query(Models.Category).filter(Models.Category.name == name_clean).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{name_clean}' already exists.")
    cat = Models.Category(
        name=name_clean,
        emoji=data.emoji or "📌",
        color=data.color or "slate",
        description=data.description
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat

@app.get("/api/admin/categories/{category_id}", response_model=schemas.CategoryResponse)
def get_category(
    category_id: int,
    _admin: Models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    cat = db.query(Models.Category).filter(Models.Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    return cat

@app.put("/api/admin/categories/{category_id}", response_model=schemas.CategoryResponse)
def update_category(
    category_id: int,
    data: schemas.CategoryUpdate,
    _admin: Models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update name, emoji, color, or description of an existing category."""
    cat = db.query(Models.Category).filter(Models.Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    if data.name is not None:
        name_clean = data.name.strip().lower()
        if not name_clean:
            raise HTTPException(status_code=400, detail="Category name cannot be empty.")
        conflict = db.query(Models.Category).filter(
            Models.Category.name == name_clean,
            Models.Category.id != category_id
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail=f"Category '{name_clean}' already exists.")
        cat.name = name_clean
    if data.emoji is not None:
        cat.emoji = data.emoji
    if data.color is not None:
        cat.color = data.color
    if data.description is not None:
        cat.description = data.description
    db.commit()
    db.refresh(cat)
    return cat

@app.delete("/api/admin/categories/{category_id}")
def delete_category(
    category_id: int,
    _admin: Models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Delete a category. Todos that reference it are reassigned to 'other'
    (or left as-is if 'other' is also being deleted — rare edge case).
    """
    cat = db.query(Models.Category).filter(Models.Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    # Reassign todos that use this category to 'other'
    affected = db.query(Models.Todo).filter(Models.Todo.category == cat.name).all()
    fallback = "other" if cat.name != "other" else "work"
    for todo in affected:
        todo.category = fallback
    db.delete(cat)
    db.commit()
    return {
        "detail": f"Category '{cat.name}' deleted. {len(affected)} task(s) reassigned to '{fallback}'."
    }

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
