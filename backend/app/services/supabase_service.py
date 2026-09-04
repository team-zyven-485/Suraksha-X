"""
Backend-only Supabase client, using the service-role key (never sent to the
frontend). Used to persist processed satellite hazard extents and road-impact
classifications so Admin/Citizen/Rescue dashboards can read history and so
results survive backend restarts.

If SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY aren't configured, every method
here is a no-op — the satellite pipeline still works entirely in-memory
(see hazard_service.py's cache), it just won't have persisted history.
"""
from __future__ import annotations

import os
from typing import Any, Optional

_client: Optional[Any] = None
_attempted = False


def get_supabase():
    global _client, _attempted
    if _client is not None:
        return _client
    if _attempted:
        return None
    _attempted = True

    url = os.getenv('SUPABASE_URL', '').strip()
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '').strip()
    if not url or not key:
        return None

    try:
        from supabase import create_client
        _client = create_client(url, key)
        return _client
    except Exception as exc:  # pragma: no cover - defensive, matches frontend's graceful degradation
        print(f'[Supabase] Backend client init failed: {exc}')
        return None


def is_configured() -> bool:
    return get_supabase() is not None


async def persist_hazard_extent(payload: dict) -> Optional[int]:
    """Insert a processed hazard extent row. Returns its new id, or None if unavailable/failed."""
    client = get_supabase()
    if not client:
        return None
    try:
        result = client.table('satellite_hazard_extents').insert(payload).execute()
        rows = result.data or []
        return rows[0]['id'] if rows else None
    except Exception as exc:
        print(f'[Supabase] Failed to persist hazard extent: {exc}')
        return None


async def persist_road_impacts(hazard_extent_id: Optional[int], scenario_id: Optional[str], rows: list[dict]) -> None:
    client = get_supabase()
    if not client or not rows:
        return
    try:
        payload = [
            {**row, 'hazard_extent_id': hazard_extent_id, 'scenario_id': scenario_id}
            for row in rows
        ]
        client.table('road_impacts').insert(payload).execute()
    except Exception as exc:
        print(f'[Supabase] Failed to persist road impacts: {exc}')
