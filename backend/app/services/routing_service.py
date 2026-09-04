"""
Recompute evacuation-route safety using satellite-derived hazard intelligence.

Priority order (per spec): SAFETY > ROAD ACCESSIBILITY > DISTANCE > ETA.
A route whose path substantially intersects the hazard extent is REJECTED
outright (never recommended); AT_RISK routes are heavily penalized so a
slightly longer but safer route wins.
"""
from __future__ import annotations

from typing import Any, Optional

from shapely.geometry import LineString, shape

from app.models.schemas import HazardExtentResponse
from app.services.road_impact import AT_RISK_THRESHOLD, BLOCKED_THRESHOLD, classify_intersection_fraction


def evaluate_route(hazard: HazardExtentResponse, route: dict[str, Any]) -> dict[str, Any]:
    coords = route.get("coordinates", [])
    route_id = route.get("id", "unknown")

    if hazard.status != "available" or not hazard.geojson or len(coords) < 2:
        return {
            "route_id": route_id,
            "risk_status": "SAFE",
            "intersection_fraction": 0.0,
            "rejected": False,
            "penalty": 0,
        }

    hazard_poly = shape(hazard.geojson["geometry"])
    line = LineString([(c[1], c[0]) for c in coords])
    inter = line.intersection(hazard_poly)
    fraction = 0.0 if line.length == 0 or inter.is_empty else min(1.0, inter.length / line.length)
    status, _confidence = classify_intersection_fraction(fraction)

    penalty = 0
    if status == "AT_RISK":
        penalty = 40
    elif status == "BLOCKED":
        penalty = 1000  # effectively disqualifying

    return {
        "route_id": route_id,
        "risk_status": status,
        "intersection_fraction": round(fraction, 3),
        "rejected": status == "BLOCKED",
        "penalty": penalty,
    }


def recommend_route(hazard: HazardExtentResponse, routes: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """
    Returns the recommended route_id (or None if every route is BLOCKED),
    plus the full per-route evaluation so the caller can display why.
    """
    evaluations = [evaluate_route(hazard, r) for r in routes]
    by_id = {e["route_id"]: e for e in evaluations}

    candidates = [r for r in routes if not by_id[r.get("id", "unknown")]["rejected"]]
    if not candidates:
        return {"recommended_route_id": None, "evaluations": evaluations}

    def score(r: dict[str, Any]) -> tuple:
        ev = by_id[r.get("id", "unknown")]
        # Lower is better: safety penalty first, then distance, then ETA.
        return (
            ev["penalty"],
            r.get("distanceKm", r.get("distance_km", 9999)),
            r.get("estimatedTimeMin", r.get("estimated_time_min", 9999)),
        )

    best = min(candidates, key=score)
    return {"recommended_route_id": best.get("id", "unknown"), "evaluations": evaluations}
