"""
Middleware for error handling and request logging
"""
import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import traceback
from config import DEBUG

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _build_error_response(exc: Exception) -> JSONResponse:
    """Build a consistent error response for unhandled exceptions."""
    if DEBUG:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": str(exc),
                "type": type(exc).__name__,
                "traceback": traceback.format_exc(),
            },
        )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )

async def error_handler_middleware(request: Request, call_next):
    """Log all requests and handle errors"""
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        logger.error(f"Unhandled error: {str(e)}\n{traceback.format_exc()}")
        return _build_error_response(e)


async def global_exception_handler(request: Request, exc: Exception):
    """Fallback exception handler for FastAPI-level unhandled exceptions."""
    logger.error(f"Unhandled exception handler caught: {str(exc)}\n{traceback.format_exc()}")
    return _build_error_response(exc)

async def validation_error_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors with detailed information"""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(x) for x in error["loc"][1:]),
            "message": error["msg"],
            "type": error["type"]
        })
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation error",
            "errors": errors
        }
    )
