// Mirrors backend/app/models/schemas.py — keep in sync.

export type DataMode = 'CONNECTED' | 'DEMO' | 'UNAVAILABLE';
export type HazardStatus = 'available' | 'unavailable' | 'no_recent_observation' | 'processing';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type RoadRiskStatus = 'SAFE' | 'AT_RISK' | 'BLOCKED';

export interface AOI {
  lat: number;
  lng: number;
  radius_km: number;
  scenario_id?: string | null;
  label?: string | null;
}

export interface SatelliteStatus {
  connected: boolean;
  data_mode: DataMode;
  reason?: string | null;
  copernicus_configured: boolean;
}

export interface SatelliteObservationSummary {
  source: string;
  product: string;
  observation_time?: string | null;
  observation_id?: string | null;
  data_mode: DataMode;
  status: HazardStatus;
}

export interface HazardExtentResponse {
  source: string;
  product: string;
  observation_time?: string | null;
  processed_at: string;
  aoi: AOI;
  hazard_type: string;
  status: HazardStatus;
  data_mode: DataMode;
  detection_method: string;
  confidence: Confidence;
  affected_area_km2: number;
  geojson?: GeoJSON.Feature | null;
  message?: string | null;
}

export interface RoadImpact {
  road_id: string;
  road_name: string;
  status: RoadRiskStatus;
  risk_score: number;
  confidence: Confidence;
  hazard_source: string;
  data_mode: DataMode;
  updated_at: string;
  reason: string;
}

export interface RouteEvaluation {
  route_id: string;
  risk_status: RoadRiskStatus;
  intersection_fraction: number;
  rejected: boolean;
  penalty: number;
}

export interface RouteRecommendation {
  data_mode: DataMode;
  hazard_status: HazardStatus;
  recommended_route_id: string | null;
  evaluations: RouteEvaluation[];
}

export interface ApiErrorResponse {
  status: 'unavailable' | 'error';
  message: string;
}
