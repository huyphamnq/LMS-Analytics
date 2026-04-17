from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import api, auth, settings

app = FastAPI(
    title="Learning Analytics Dashboard API",
    description="API for tracking student learning behave and predicting at-risk students",
    version="1.0.0"
)

# Cấu hình CORS
origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    from fastapi.responses import JSONResponse
    print(f"Global error: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

# Đăng ký các routes
app.include_router(api.router)
app.include_router(auth.router)
app.include_router(settings.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Learning Analytics API. Go to /docs for Swagger UI."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
