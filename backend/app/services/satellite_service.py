"""Satellite observation search/status orchestration (distinct from hazard extent processing)."""
from __future__ import annotations

from app.models.schemas import AOI, SatelliteObservationSummary, SatelliteStatus
from app.services.copernicus_service import CopernicusUnavailable, copernicus_service


def get_status() -> SatelliteStatus:
    configured = copernicus_service.is_configured()
    if not configured:
        return SatelliteStatus(
            connected=False,
            data_mode="DEMO",
            reason="COPERNICUS_CLIENT_ID/COPERNICUS_CLIENT_SECRET not configured on the backend — running in DEMO DATA mode.",
            copernicus_configured=False,
        )
    return SatelliteStatus(
        connected=True,
        data_mode="CONNECTED",
        reason=None,
        copernicus_configured=True,
    )


async def search_latest(aoi: AOI) -> SatelliteObservationSummary:
    if not copernicus_service.is_configured():
        return SatelliteObservationSummary(data_mode="DEMO", status="unavailable")

    try:
        scenes = await copernicus_service.search_sentinel1_grd(aoi.lat, aoi.lng, aoi.radius_km, limit=1)
    except CopernicusUnavailable:
        return SatelliteObservationSummary(data_mode="UNAVAILABLE", status="unavailable")

    if not scenes:
        return SatelliteObservationSummary(data_mode="UNAVAILABLE", status="no_recent_observation")

    latest = scenes[0]
    return SatelliteObservationSummary(
        observation_time=latest.get("properties", {}).get("datetime"),
        observation_id=latest.get("id"),
        data_mode="CONNECTED",
        status="available",
    )
