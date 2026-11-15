"""
Optional MongoDB persistence for the satellite pipeline: processed hazard
extents and road-impact classifications, so results survive backend restarts
and dashboards can read history.

If MONGODB_URI isn't configured (or MongoDB is unreachable), every method here
is a no-op — the satellite pipeline still works entirely in-memory (see
hazard_service.py's cache), it just won't have persisted history.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Optional

_client: Optional[Any] = None
_attempted = False


def _db():
    global _client, _attempted
    if _client is not None:
        return _client[os.getenv("MONGODB_DB", "suraksha_x").strip() or "suraksha_x"]
    if _attempted:
        return None
    _attempted = True

    uri = os.getenv("MONGODB_URI", "").strip()
    if not uri:
        return None
    try:
        from pymongo import MongoClient

        client = MongoClient(uri, serverSelectionTimeoutMS=5000, appname="suraksha-x-satellite")
        client.admin.command("ping")  # fail fast instead of on the first request
        _client = client
        return _client[os.getenv("MONGODB_DB", "suraksha_x").strip() or "suraksha_x"]
    except Exception as exc:  # pragma: no cover - degrade gracefully
        print(f"[MongoDB] Backend client init failed: {exc}")
        return None


def is_configured() -> bool:
    return _db() is not None


async def persist_hazard_extent(payload: dict) -> Optional[str]:
    """Insert a processed hazard extent. Returns its new id (string), or None if unavailable/failed."""
    db = _db()
    if db is None:
        return None
    try:
        doc = {**payload, "processed_at": datetime.now(timezone.utc)}
        # pymongo is synchronous: run it off the event loop so a slow database
        # can't stall every other request.
        result = await asyncio.to_thread(db["satellite_hazard_extents"].insert_one, doc)
        return str(result.inserted_id)
    except Exception as exc:
        print(f"[MongoDB] Failed to persist hazard extent: {exc}")
        return None


async def persist_road_impacts(hazard_extent_id: Optional[str], scenario_id: Optional[str], rows: list[dict]) -> None:
    db = _db()
    if db is None or not rows:
        return
    try:
        now = datetime.now(timezone.utc)
        docs = [
            {**row, "hazard_extent_id": hazard_extent_id, "scenario_id": scenario_id, "updated_at": now}
            for row in rows
        ]
        await asyncio.to_thread(db["road_impacts"].insert_many, docs)
    except Exception as exc:
        print(f"[MongoDB] Failed to persist road impacts: {exc}")
