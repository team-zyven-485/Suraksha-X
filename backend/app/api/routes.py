from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.models.schemas import AOI
from app.services import hazard_service, routing_service

router = APIRouter(prefix="/api/routes", tags=["routes"])


class RouteRecommendRequest(BaseModel):
    aoi: AOI
    routes: list[dict[str, Any]]


@router.post("/recommend")
async def recommend(req: RouteRecommendRequest):
    """
    Given the current scenario's evacuation route candidates, return which one
    is recommended under satellite-informed safety rules (never BLOCKED,
    heavily penalize AT_RISK), plus per-route risk detail for the UI.
    """
    hazard = await hazard_service.get_hazard_extent(req.aoi, use_cache=True)
    result = routing_service.recommend_route(hazard, req.routes)
    return {
        "data_mode": hazard.data_mode,
        "hazard_status": hazard.status,
        **result,
    }
