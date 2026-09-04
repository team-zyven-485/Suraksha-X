from __future__ import annotations

from fastapi import APIRouter, Query

from app.models.schemas import AOI, HazardExtentResponse, ProcessRequest
from app.services import hazard_service

router = APIRouter(prefix="/api/hazard", tags=["hazard"])


@router.get("/extent", response_model=HazardExtentResponse)
async def get_extent(
    scenario_id: str | None = Query(default=None),
    lat: float | None = Query(default=None),
    lng: float | None = Query(default=None),
    radius_km: float | None = Query(default=None),
    demo: bool = Query(default=False, description="Force DEMO DATA regardless of Copernicus configuration"),
):
    """Return the (cached, if fresh) hazard extent GeoJSON for an AOI/scenario."""
    aoi = hazard_service.resolve_aoi(scenario_id, lat, lng, radius_km)
    return await hazard_service.get_hazard_extent(aoi, force_demo=demo, use_cache=True)


@router.post("/detect", response_model=HazardExtentResponse)
async def detect(req: ProcessRequest):
    """Trigger a fresh hazard detection for the given AOI (bypasses cache)."""
    return await hazard_service.get_hazard_extent(req.aoi, force_demo=req.force_demo, use_cache=False)
