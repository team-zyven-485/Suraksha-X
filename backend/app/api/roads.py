from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import RoadImpact, RoadImpactRequest
from app.services import hazard_service, road_impact, supabase_service

router = APIRouter(prefix="/api/roads", tags=["roads"])


@router.post("/impact", response_model=list[RoadImpact])
async def road_impact_endpoint(req: RoadImpactRequest):
    """
    Classify a set of road segments (as sent by the frontend for the active
    scenario) against the satellite-derived hazard extent for the same AOI.
    """
    hazard = await hazard_service.get_hazard_extent(req.aoi, use_cache=True)
    impacts = road_impact.classify_roads(hazard, req.roads)

    extent_id = hazard_service.get_last_extent_id(req.aoi)
    await supabase_service.persist_road_impacts(
        extent_id,
        req.aoi.scenario_id,
        [
            {
                "road_id": r.road_id,
                "road_name": r.road_name,
                "status": r.status,
                "risk_score": r.risk_score,
                "confidence": r.confidence,
                "hazard_source": r.hazard_source,
                "data_mode": r.data_mode,
                "reason": r.reason,
            }
            for r in impacts
        ],
    )

    return impacts
