"""Geometry helpers for AOI handling and hazard/road intersection."""
from __future__ import annotations

import math

from shapely.geometry import LineString, Polygon, shape
from shapely.ops import unary_union


def km_to_deg_lat(km: float) -> float:
    return km / 111.0


def km_to_deg_lng(km: float, at_lat: float) -> float:
    return km / (111.0 * max(math.cos(math.radians(at_lat)), 0.1))


def circle_polygon(lat: float, lng: float, radius_km: float, points: int = 48) -> Polygon:
    """Approximate a circular AOI/hazard extent as a lon/lat polygon."""
    dlat = km_to_deg_lat(radius_km)
    dlng = km_to_deg_lng(radius_km, lat)
    coords = []
    for i in range(points):
        theta = 2 * math.pi * i / points
        coords.append((lng + dlng * math.cos(theta), lat + dlat * math.sin(theta)))
    coords.append(coords[0])
    return Polygon(coords)


def irregular_flood_polygon(lat: float, lng: float, radius_km: float, seed: int = 0) -> Polygon:
    """
    Produce a plausible non-circular flood-extent-shaped polygon (rivers/floods
    rarely form perfect circles) by jittering a circle's radius deterministically
    per-vertex. Deterministic on (lat, lng, radius_km, seed) so repeated demo
    calls for the same AOI are stable.
    """
    points = 32
    dlat = km_to_deg_lat(radius_km)
    dlng = km_to_deg_lng(radius_km, lat)
    coords = []
    for i in range(points):
        theta = 2 * math.pi * i / points
        # deterministic pseudo-jitter via sine harmonics, not random.random()
        wobble = 0.65 + 0.35 * abs(math.sin(theta * 3 + seed) * math.cos(theta * 2 - seed))
        coords.append((
            lng + dlng * wobble * math.cos(theta),
            lat + dlat * wobble * math.sin(theta),
        ))
    coords.append(coords[0])
    return Polygon(coords)


def polygon_area_km2(poly: Polygon) -> float:
    """Rough equal-area estimate for small AOIs using an equirectangular approximation."""
    if poly.is_empty:
        return 0.0
    centroid_lat = poly.centroid.y
    lat_km = 111.0
    lng_km = 111.0 * max(math.cos(math.radians(centroid_lat)), 0.1)
    # Project degrees to km directly (fine for small AOIs), then measure shoelace area.
    projected = Polygon([(x * lng_km, y * lat_km) for x, y in poly.exterior.coords])
    return round(projected.area, 2)


def geojson_from_polygon(poly: Polygon) -> dict:
    return {
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[round(x, 6), round(y, 6)] for x, y in poly.exterior.coords]],
        },
    }


def road_line_from_coords(coords: list[list[float]]) -> LineString:
    """RoadSegment.coordinates are [lat, lng] pairs; shapely wants (x=lng, y=lat)."""
    return LineString([(c[1], c[0]) for c in coords])


def intersection_fraction(line: LineString, poly: Polygon) -> float:
    """Fraction (0-1) of a road's length that falls inside the hazard polygon."""
    if line.length == 0:
        return 0.0
    inter = line.intersection(poly)
    if inter.is_empty:
        return 0.0
    return min(1.0, inter.length / line.length)
