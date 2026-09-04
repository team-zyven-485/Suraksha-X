"""Classify road segments against a satellite-derived hazard extent."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from shapely.geometry import shape

from app.models.schemas import Confidence, HazardExtentResponse, RoadImpact, RoadRiskStatus

# Thresholds on the fraction of a road segment's length that intersects the
# hazard polygon. Configurable — tune per disaster type / operational policy.
BLOCKED_THRESHOLD = 0.35
AT_RISK_THRESHOLD = 0.05


def classify_intersection_fraction(fraction: float) -> tuple[RoadRiskStatus, Confidence]:
    if fraction >= BLOCKED_THRESHOLD:
        return "BLOCKED", "HIGH"
    if fraction >= AT_RISK_THRESHOLD:
        return "AT_RISK", "MEDIUM" if fraction >= AT_RISK_THRESHOLD * 2 else "LOW"
    return "SAFE", "HIGH"


def classify_roads(hazard: HazardExtentResponse, roads: list[dict[str, Any]]) -> list[RoadImpact]:
    updated_at = datetime.now(timezone.utc).isoformat()

    if hazard.status != "available" or not hazard.geojson:
        # No usable hazard extent — every road is reported SAFE with LOW
        # confidence rather than guessing; this is an explicit, honest state.
        return [
            RoadImpact(
                road_id=r.get("id", "unknown"),
                road_name=r.get("name", "Unnamed Road"),
                status="SAFE",
                risk_score=0,
                confidence="LOW",
                data_mode=hazard.data_mode,
                updated_at=updated_at,
                reason="No satellite-derived hazard extent available for this AOI",
            )
            for r in roads
        ]

    hazard_poly = shape(hazard.geojson["geometry"])
    impacts: list[RoadImpact] = []

    for road in roads:
        coords = road.get("coordinates", [])
        road_id = road.get("id", "unknown")
        road_name = road.get("name", "Unnamed Road")

        if len(coords) < 2:
            impacts.append(RoadImpact(
                road_id=road_id, road_name=road_name, status="SAFE", risk_score=0,
                confidence="LOW", data_mode=hazard.data_mode, updated_at=updated_at,
                reason="Insufficient road geometry to assess",
            ))
            continue

        from shapely.geometry import LineString
        line = LineString([(c[1], c[0]) for c in coords])  # (lat,lng) -> (lng,lat)
        inter = line.intersection(hazard_poly)
        fraction = 0.0 if line.length == 0 or inter.is_empty else min(1.0, inter.length / line.length)

        status, confidence = classify_intersection_fraction(fraction)
        risk_score = min(100, round(fraction * 100 * 1.6))

        if status == "BLOCKED":
            reason = "Road intersects the majority of the satellite-derived hazard extent"
        elif status == "AT_RISK":
            reason = "Road partially intersects the satellite-derived hazard extent"
        else:
            reason = "No significant intersection with satellite-derived hazard extent"

        impacts.append(RoadImpact(
            road_id=road_id,
            road_name=road_name,
            status=status,
            risk_score=risk_score,
            confidence=confidence,
            hazard_source=hazard.source,
            data_mode=hazard.data_mode,
            updated_at=updated_at,
            reason=f"Satellite-derived hazard intersection — {reason}",
        ))

    return impacts
