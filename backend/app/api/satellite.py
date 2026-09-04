from __future__ import annotations

from fastapi import APIRouter, Query

from app.models.schemas import AOI, ProcessRequest, SatelliteObservationSummary, SatelliteStatus
from app.services import hazard_service, satellite_service

router = APIRouter(prefix="/api/satellite", tags=["satellite"])


@router.get("/status", response_model=SatelliteStatus)
async def status():
    """Whether the backend has Copernicus credentials configured (CONNECTED-capable) or is DEMO-only."""
    return satellite_service.get_status()


@router.get("/search", response_model=SatelliteObservationSummary)
@router.get("/latest", response_model=SatelliteObservationSummary)
async def latest_observation(
    scenario_id: str | None = Query(default=None),
    lat: float | None = Query(default=None),
    lng: float | None = Query(default=None),
    radius_km: float | None = Query(default=None),
):
    """Search/return the latest suitable Sentinel-1 GRD observation for an AOI."""
    aoi = hazard_service.resolve_aoi(scenario_id, lat, lng, radius_km)
    return await satellite_service.search_latest(aoi)


@router.post("/process")
async def process_observation(req: ProcessRequest):
    """
    Process the selected AOI's latest observation into a hazard extent.
    Delegates to the hazard service — this is the endpoint the Admin
    "PROCESS LATEST OBSERVATION" / "REFRESH SATELLITE DATA" buttons call.
    """
    hazard = await hazard_service.get_hazard_extent(req.aoi, force_demo=req.force_demo, use_cache=False)
    return hazard
