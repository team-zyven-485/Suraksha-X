from __future__ import annotations

import os

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
