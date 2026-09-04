"""Pydantic schemas shared across the satellite intelligence API."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

DataMode = Literal["CONNECTED", "DEMO", "UNAVAILABLE"]
HazardStatus = Literal["available", "unavailable", "no_recent_observation", "processing"]
Confidence = Literal["HIGH", "MEDIUM", "LOW"]
RoadRiskStatus = Literal["SAFE", "AT_RISK", "BLOCKED"]


class AOI(BaseModel):
    """Area of Interest — a center point with a radius, or an explicit bbox."""
    lat: float
    lng: float
    radius_km: float = Field(default=15.0, ge=1, le=100)
    scenario_id: Optional[str] = None
    label: Optional[str] = None


class SatelliteStatus(BaseModel):
    connected: bool
    data_mode: DataMode
    reason: Optional[str] = None
    copernicus_configured: bool


class SatelliteObservationSummary(BaseModel):
    source: str = "Sentinel-1"
    product: str = "Sentinel-1 GRD"
    observation_time: Optional[str] = None
    observation_id: Optional[str] = None
    data_mode: DataMode
    status: HazardStatus


class HazardExtentResponse(BaseModel):
    source: str = "Sentinel-1"
    product: str = "Sentinel-1 GRD"
    observation_time: Optional[str] = None
    processed_at: str
    aoi: AOI
    hazard_type: str = "flood"
    status: HazardStatus
    data_mode: DataMode
    detection_method: str = "SAR baseline threshold detection"
    confidence: Confidence
    affected_area_km2: float
    geojson: Optional[dict[str, Any]] = None
    message: Optional[str] = None


class ProcessRequest(BaseModel):
    aoi: AOI
    force_demo: bool = False


class RoadImpact(BaseModel):
    road_id: str
    road_name: str
    status: RoadRiskStatus
    risk_score: int = Field(ge=0, le=100)
    confidence: Confidence
    hazard_source: str = "Sentinel-1"
    data_mode: DataMode
    updated_at: str
    reason: str


class RoadImpactRequest(BaseModel):
    aoi: AOI
    roads: list[dict[str, Any]]


class ErrorResponse(BaseModel):
    status: Literal["unavailable", "error"]
    message: str
