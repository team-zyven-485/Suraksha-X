from __future__ import annotations

import os
import time
from collections import defaultdict

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import hazards, roads, routes as routes_api, satellite

app = FastAPI(
    title="SURAKSHA-X Satellite Intelligence API",
    description="Sentinel-1-based flood/hazard detection, road-risk classification, and safe-routing intelligence.",
    version="1.0.0",
)

allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------------------
# Basic per-IP rate limiting. Several endpoints here (satellite/process,
# hazard/detect, roads/impact) are unauthenticated and — once real Copernicus
# credentials are configured — trigger paid API calls and service-role writes
# to Supabase (which bypass RLS entirely). Without this, anyone who can reach
# the backend could spam those endpoints to burn API quota or flood the DB
# with junk rows. In-memory sliding window is enough at this app's scale;
# it resets on restart and isn't shared across replicas, which is an
# acceptable tradeoff here rather than pulling in a Redis dependency.
# ----------------------------------------------------------------------------
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 30
_request_log: dict[str, list[float]] = defaultdict(list)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    cutoff = now - RATE_LIMIT_WINDOW_SECONDS
    timestamps = _request_log[client_ip]
    while timestamps and timestamps[0] < cutoff:
        timestamps.pop(0)
    if len(timestamps) >= RATE_LIMIT_MAX_REQUESTS:
        return JSONResponse(
            status_code=429,
            content={"status": "error", "message": "Too many requests — please slow down."},
        )
    timestamps.append(now)
    return await call_next(request)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Never leak internal stack traces or secrets to the client.
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "An internal error occurred processing the satellite intelligence request."},
    )


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "SURAKSHA-X Satellite Intelligence API",
        "copernicus_configured": bool(os.getenv("COPERNICUS_CLIENT_ID") and os.getenv("COPERNICUS_CLIENT_SECRET")),
    }


app.include_router(satellite.router)
app.include_router(hazards.router)
app.include_router(roads.router)
app.include_router(routes_api.router)
