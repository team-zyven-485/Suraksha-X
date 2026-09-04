"""
Baseline SAR flood/water detection.

This module is intentionally transparent: it implements a configurable
intensity-thresholding + morphological-cleanup detector over a SAR backscatter
array, NOT a trained deep-learning segmentation model. The interface
(`FloodDetector`) is modular so a real model (U-Net, SegFormer, etc.) can be
dropped in later without touching the API layer — see `MODEL_READY` below.

IMPORTANT — current limitation of this prototype: turning a located Sentinel-1
STAC item into an actual downloaded/processed backscatter raster requires a
processing backend (e.g. Sentinel Hub Process API) with its own quota and
byte-level image handling that is out of scope to stand up honestly in this
build. So when a real scene IS found via Copernicus (see copernicus_service),
this module does not fabricate a flood polygon from it — it reports the scene
was located but raster processing is not yet wired up, and the caller should
fall back to DEMO DATA to preview the rest of the pipeline. This keeps the
system honest rather than pretending pixel-level analysis happened.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol

import numpy as np
from shapely.geometry import Polygon

from app.utils.geo import geojson_from_polygon, irregular_flood_polygon, polygon_area_km2

# Flip to True once a real segmentation model is wired into `MLFloodDetector`.
MODEL_READY = False


@dataclass
class DetectionResult:
    mask_water_fraction: float
    polygon: Optional[Polygon]
    method: str
    confidence: str


class FloodDetector(Protocol):
    def detect(self, intensity_db: np.ndarray, threshold_db: float) -> DetectionResult: ...


class BaselineThresholdDetector:
    """
    SAR intensity-threshold water detector.

    Water surfaces are smooth relative to land/vegetation and return very low
    backscatter in VV-polarized Sentinel-1 GRD imagery, so a simple
    below-threshold classification (with a light morphological cleanup to
    remove speckle noise) is a standard, well-documented baseline for SAR
    flood mapping. `threshold_db` is configurable per scene/region.
    """

    method = "SAR intensity threshold (baseline)"

    def detect(self, intensity_db: np.ndarray, threshold_db: float = -17.0) -> DetectionResult:
        water_mask = intensity_db < threshold_db

        # Morphological cleanup: drop isolated single-pixel speckle by requiring
        # at least 3 of 8 neighbours to also be classified as water.
        cleaned = np.zeros_like(water_mask)
        padded = np.pad(water_mask, 1, mode="constant", constant_values=False)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                cleaned = cleaned.astype(int) + padded[1 + dy: 1 + dy + water_mask.shape[0],
                                                        1 + dx: 1 + dx + water_mask.shape[1]].astype(int)
        cleaned_mask = water_mask & (cleaned >= 3)

        fraction = float(cleaned_mask.mean()) if cleaned_mask.size else 0.0
        confidence = "HIGH" if fraction > 0.02 else "MEDIUM" if fraction > 0.005 else "LOW"

        return DetectionResult(
            mask_water_fraction=fraction,
            polygon=None,  # polygonizing a real mask requires the raster's geotransform
            method=self.method,
            confidence=confidence,
        )


def generate_demo_extent(lat: float, lng: float, radius_km: float, seed: int = 0) -> tuple[Polygon, float]:
    """Deterministic demo flood-extent polygon for a given AOI, clearly not real."""
    poly = irregular_flood_polygon(lat, lng, radius_km, seed=seed)
    area = polygon_area_km2(poly)
    return poly, area


def demo_extent_geojson(lat: float, lng: float, radius_km: float, seed: int = 0) -> tuple[dict, float]:
    poly, area = generate_demo_extent(lat, lng, radius_km, seed)
    return geojson_from_polygon(poly), area


baseline_detector = BaselineThresholdDetector()
