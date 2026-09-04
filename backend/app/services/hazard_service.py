"""Orchestrates satellite search + baseline detection into a hazard extent response."""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Optional

from app.models.schemas import AOI, HazardExtentResponse
from app.services.copernicus_service import CopernicusUnavailable, copernicus_service
from app.services.flood_detection import demo_extent_geojson
from app.services import supabase_service

# Approximate AOI seed per demo scenario, matching the frontend's 5 disaster
# scenarios so the satellite-derived extent lands in the right region on the
# Leaflet map. Kept independent of the frontend (Python backend, TS frontend).
SCENARIO_AOI_SEEDS: dict[str, dict] = {
    "flood-assam": {"lat": 26.185, "lng": 91.735, "radius_km": 12, "label": "Village A, River Basin District, Assam"},
    "earthquake-gujarat": {"lat": 23.244, "lng": 69.665, "radius_km": 8, "label": "Old Town Bhuj, Kutch District, Gujarat"},
    "cyclone-odisha": {"lat": 19.803, "lng": 85.831, "radius_km": 15, "label": "Puri Beach Front, Odisha"},
    "landslide-uttarakhand": {"lat": 30.556, "lng": 79.565, "radius_km": 6, "label": "Joshimath, Chamoli, Uttarakhand"},
    "tsunami-tamilnadu": {"lat": 13.049, "lng": 80.282, "radius_km": 14, "label": "Marina Beach Corridor, Chennai"},
}

# Simple in-process cache: {aoi_key: (HazardExtentResponse, cached_at_epoch)}
_cache: dict[str, tuple[HazardExtentResponse, float]] = {}
_CACHE_TTL_SECONDS = 300

# Supabase row id of the most recently persisted hazard extent per AOI key,
# so road-impact persistence can reference which observation it came from.
_last_extent_id: dict[str, int] = {}


def get_last_extent_id(aoi: AOI) -> "int | None":
    return _last_extent_id.get(_cache_key(aoi))


def resolve_aoi(scenario_id: Optional[str], lat: Optional[float], lng: Optional[float], radius_km: Optional[float]) -> AOI:
    if scenario_id and scenario_id in SCENARIO_AOI_SEEDS:
        seed = SCENARIO_AOI_SEEDS[scenario_id]
        return AOI(
            lat=lat if lat is not None else seed["lat"],
            lng=lng if lng is not None else seed["lng"],
            radius_km=radius_km if radius_km is not None else seed["radius_km"],
            scenario_id=scenario_id,
            label=seed["label"],
        )
    if lat is not None and lng is not None:
        return AOI(lat=lat, lng=lng, radius_km=radius_km or 15.0, scenario_id=scenario_id)
    # Fallback default AOI (flood-assam) so the endpoint never hard-fails on missing params.
    seed = SCENARIO_AOI_SEEDS["flood-assam"]
    return AOI(lat=seed["lat"], lng=seed["lng"], radius_km=seed["radius_km"], scenario_id="flood-assam", label=seed["label"])


def _cache_key(aoi: AOI) -> str:
    return f"{aoi.scenario_id or 'custom'}:{round(aoi.lat, 3)}:{round(aoi.lng, 3)}:{round(aoi.radius_km, 1)}"


def _demo_seed_for(aoi: AOI) -> int:
    # Deterministic per-AOI seed so repeated demo calls are stable, but
    # different scenarios get visually distinct polygon shapes.
    return abs(hash(aoi.scenario_id or f"{aoi.lat}:{aoi.lng}")) % 1000


async def get_hazard_extent(aoi: AOI, force_demo: bool = False, use_cache: bool = True) -> HazardExtentResponse:
    key = _cache_key(aoi)
    if use_cache and key in _cache:
        cached, cached_at = _cache[key]
        if time.time() - cached_at < _CACHE_TTL_SECONDS:
            return cached

    result = await _compute_hazard_extent(aoi, force_demo=force_demo)
    _cache[key] = (result, time.time())

    # Persist to Supabase (service-role, backend-only) so processed
    # observations survive restarts and are visible in the database. No-op
    # if Supabase isn't configured on this backend deployment.
    row_id = await supabase_service.persist_hazard_extent({
        "scenario_id": aoi.scenario_id,
        "source": result.source,
        "product": result.product,
        "observation_time": result.observation_time,
        "aoi": aoi.model_dump(),
        "hazard_type": result.hazard_type,
        "status": result.status,
        "data_mode": result.data_mode,
        "detection_method": result.detection_method,
        "confidence": result.confidence,
        "affected_area_km2": result.affected_area_km2,
        "geojson": result.geojson,
        "message": result.message,
    })
    if row_id is not None:
        _last_extent_id[key] = row_id

    return result


async def _compute_hazard_extent(aoi: AOI, force_demo: bool) -> HazardExtentResponse:
    processed_at = datetime.now(timezone.utc).isoformat()

    if not force_demo and copernicus_service.is_configured():
        try:
            scenes = await copernicus_service.search_sentinel1_grd(aoi.lat, aoi.lng, aoi.radius_km)
        except CopernicusUnavailable as exc:
            return HazardExtentResponse(
                observation_time=None,
                processed_at=processed_at,
                aoi=aoi,
                status="unavailable",
                data_mode="UNAVAILABLE",
                confidence="LOW",
                affected_area_km2=0.0,
                geojson=None,
                message=f"Satellite data temporarily unavailable: {exc}",
            )

        if not scenes:
            return HazardExtentResponse(
                observation_time=None,
                processed_at=processed_at,
                aoi=aoi,
                status="no_recent_observation",
                data_mode="UNAVAILABLE",
                confidence="LOW",
                affected_area_km2=0.0,
                geojson=None,
                message="NO RECENT OBSERVATION — no suitable Sentinel-1 GRD scene found for this AOI in the search window.",
            )

        latest = scenes[0]
        observation_time = latest.get("properties", {}).get("datetime")
        scene_id = latest.get("id", "unknown")

        # A real scene was located, but this deployment does not yet have a
        # raster download/processing backend wired up (see flood_detection.py
        # docstring) — report that honestly instead of fabricating a polygon.
        return HazardExtentResponse(
            observation_time=observation_time,
            processed_at=processed_at,
            aoi=aoi,
            status="unavailable",
            data_mode="CONNECTED",
            confidence="LOW",
            affected_area_km2=0.0,
            geojson=None,
            message=(
                f"Located Sentinel-1 scene {scene_id} (observed {observation_time}), "
                "but raster processing is not yet connected in this deployment. "
                "Use demo data to preview the downstream hazard/road/routing pipeline."
            ),
        )

    # DEMO DATA path — clearly labeled, deterministic per-AOI polygon.
    # Sized well below the AOI radius so the demo extent plausibly covers only
    # the origin zone and its immediate corridor, not the entire road network
    # (otherwise every road would trivially show as BLOCKED).
    geojson, area_km2 = demo_extent_geojson(aoi.lat, aoi.lng, min(aoi.radius_km * 0.25, 4.0), seed=_demo_seed_for(aoi))
    return HazardExtentResponse(
        observation_time=None,
        processed_at=processed_at,
        aoi=aoi,
        status="available",
        data_mode="DEMO",
        detection_method="Demo sample data (not derived from a real satellite observation)",
        confidence="MEDIUM",
        affected_area_km2=area_km2,
        geojson=geojson,
        message="DEMO DATA — sample flood extent for demonstration. Not a real satellite observation.",
    )
