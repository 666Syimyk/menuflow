from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.routing import APIRouter
import os

from .core.config import settings
from .routers import (
    auth, tariffs, super_admin, admin,
    menu, tables, orders, kitchen, waiter,
    payments, feedback, reports, support, activity_logs,
    uploads, public, subscriptions,
)

app = FastAPI(
    title="MenuFlow API",
    description="QR-based restaurant ordering SaaS platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files statically (not behind /api/v1)
upload_dir = settings.UPLOAD_DIR
os.makedirs(upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

# All API routes under /api/v1 to match frontend expectations
api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth.router)
api_v1.include_router(tariffs.router)
api_v1.include_router(super_admin.router)
api_v1.include_router(subscriptions.router)
api_v1.include_router(admin.router)
api_v1.include_router(menu.router)
api_v1.include_router(tables.router)
api_v1.include_router(orders.router)
api_v1.include_router(kitchen.router)
api_v1.include_router(waiter.router)
api_v1.include_router(payments.router)
api_v1.include_router(feedback.router)
api_v1.include_router(reports.router)
api_v1.include_router(support.router)
api_v1.include_router(activity_logs.router)
api_v1.include_router(uploads.router)
api_v1.include_router(public.router)

app.include_router(api_v1)


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "MenuFlow API"}
