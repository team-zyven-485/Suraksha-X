"""
Thin client for the Copernicus Data Space Ecosystem.

Handles OAuth2 client-credentials auth and STAC search for Sentinel-1 GRD
scenes over an AOI. This module makes real network calls when credentials are
configured; it never fabricates a successful response. Any failure (missing
credentials, auth failure, network error, empty result set) is surfaced as an
honest "unavailable" outcome so the caller can fall back to DEMO DATA
explicitly rather than silently.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
STAC_SEARCH_URL = "https://catalogue.dataspace.copernicus.eu/stac/search"


@dataclass
class CopernicusUnavailable(Exception):
    reason: str

    def __str__(self) -> str:
        return self.reason


class CopernicusService:
    def __init__(self) -> None:
        self.client_id = os.getenv("COPERNICUS_CLIENT_ID", "").strip()
        self.client_secret = os.getenv("COPERNICUS_CLIENT_SECRET", "").strip()
        self._token: Optional[str] = None
        self._token_expires_at: float = 0.0

    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    async def _get_token(self) -> str:
        if self._token and time.time() < self._token_expires_at - 30:
            return self._token

        if not self.is_configured():
            raise CopernicusUnavailable("COPERNICUS_CLIENT_ID/COPERNICUS_CLIENT_SECRET not configured")

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post(
                    TOKEN_URL,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                    },
                )
            except httpx.RequestError as exc:
                raise CopernicusUnavailable(f"Copernicus identity server unreachable: {exc}") from exc

        if resp.status_code != 200:
            raise CopernicusUnavailable(f"Copernicus authentication failed ({resp.status_code})")

        payload = resp.json()
        self._token = payload["access_token"]
        self._token_expires_at = time.time() + payload.get("expires_in", 600)
        return self._token

    async def search_sentinel1_grd(
        self, lat: float, lng: float, radius_km: float, limit: int = 5
    ) -> list[dict]:
        """
        Search the Copernicus STAC catalog for Sentinel-1 GRD scenes intersecting
        a bounding box around (lat, lng). Returns an empty list (not an
        exception) when the search succeeds but no scenes are found — the
        caller distinguishes "searched, found nothing" from "could not search".
        """
        token = await self._get_token()

        deg = max(radius_km / 111.0, 0.05)
        bbox = [lng - deg, lat - deg, lng + deg, lat + deg]

        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                resp = await client.post(
                    STAC_SEARCH_URL,
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "collections": ["SENTINEL-1"],
                        "bbox": bbox,
                        "limit": limit,
                        "query": {"sar:product_type": {"eq": "GRD"}},
                        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
                    },
                )
            except httpx.RequestError as exc:
                raise CopernicusUnavailable(f"Copernicus STAC search unreachable: {exc}") from exc

        if resp.status_code != 200:
            raise CopernicusUnavailable(f"Copernicus STAC search failed ({resp.status_code})")

        data = resp.json()
        return data.get("features", [])


copernicus_service = CopernicusService()
