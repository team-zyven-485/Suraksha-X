import {
  AOI,
  ApiErrorResponse,
  HazardExtentResponse,
  RoadImpact,
  RouteRecommendation,
  SatelliteObservationSummary,
  SatelliteStatus,
} from '../types/satellite';

// No secrets live here — only the backend base URL. All Copernicus/Supabase
// credentials stay server-side in the FastAPI backend's environment.
function apiBaseUrl(): string {
  const env = (import.meta as any).env || {};
  return env.VITE_API_BASE_URL || 'http://localhost:8000';
}

export class SatelliteApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SatelliteApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch {
    throw new SatelliteApiError('Satellite backend unreachable. Is the API server running?');
  }

  if (!response.ok) {
    let message = `Satellite API error (${response.status})`;
    try {
      const body: ApiErrorResponse = await response.json();
      if (body?.message) message = body.message;
    } catch {
      // ignore parse failure, use default message
    }
    throw new SatelliteApiError(message);
  }

  return response.json() as Promise<T>;
}

export const satelliteApi = {
  getStatus: () => request<SatelliteStatus>('/api/satellite/status'),

  getLatestObservation: (aoi: Partial<AOI> & { scenario_id?: string }) => {
    const params = new URLSearchParams();
    if (aoi.scenario_id) params.set('scenario_id', aoi.scenario_id);
    if (aoi.lat != null) params.set('lat', String(aoi.lat));
    if (aoi.lng != null) params.set('lng', String(aoi.lng));
    if (aoi.radius_km != null) params.set('radius_km', String(aoi.radius_km));
    return request<SatelliteObservationSummary>(`/api/satellite/latest?${params.toString()}`);
  },

  processObservation: (aoi: AOI, forceDemo = false) =>
    request<HazardExtentResponse>('/api/satellite/process', {
      method: 'POST',
      body: JSON.stringify({ aoi, force_demo: forceDemo }),
    }),

  getHazardExtent: (aoi: Partial<AOI> & { scenario_id?: string }, demo = false) => {
    const params = new URLSearchParams();
    if (aoi.scenario_id) params.set('scenario_id', aoi.scenario_id);
    if (aoi.lat != null) params.set('lat', String(aoi.lat));
    if (aoi.lng != null) params.set('lng', String(aoi.lng));
    if (aoi.radius_km != null) params.set('radius_km', String(aoi.radius_km));
    if (demo) params.set('demo', 'true');
    return request<HazardExtentResponse>(`/api/hazard/extent?${params.toString()}`);
  },

  getRoadImpact: (aoi: AOI, roads: { id: string; name: string; coordinates: [number, number][] }[]) =>
    request<RoadImpact[]>('/api/roads/impact', {
      method: 'POST',
      body: JSON.stringify({ aoi, roads }),
    }),

  recommendRoute: (
    aoi: AOI,
    routes: { id: string; distanceKm: number; estimatedTimeMin: number; coordinates: [number, number][] }[]
  ) =>
    request<RouteRecommendation>('/api/routes/recommend', {
      method: 'POST',
      body: JSON.stringify({ aoi, routes }),
    }),
};
