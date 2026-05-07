import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from routes import api, auth, settings
from config import CORS_ORIGINS, API_HOST, API_PORT, API_RELOAD
from middleware import error_handler_middleware, validation_error_handler, global_exception_handler

app = FastAPI(
    title="Learning Analytics Dashboard API",
    description="API for tracking student learning behave and predicting at-risk students",
    version="1.0.0"
)

# Cấu hình CORS từ environment variables
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# Error handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return await validation_error_handler(request, exc)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    return await global_exception_handler(request, exc)

# Đăng ký các routes với versioning (v1)
app.include_router(api.router, prefix="/v1")
app.include_router(auth.router, prefix="/v1")
app.include_router(settings.router, prefix="/v1")

@app.get("/")
def read_root():
    return {"message": "Welcome to Learning Analytics API. Go to /docs for Swagger UI."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=API_HOST, port=API_PORT, reload=API_RELOAD)
