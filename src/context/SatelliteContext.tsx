import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useDisaster } from './DisasterContext';
import { satelliteApi, SatelliteApiError } from '../lib/satelliteApi';
import {
  AOI,
  DataMode,
  HazardExtentResponse,
  RoadImpact,
  RouteRecommendation,
  SatelliteStatus,
} from '../types/satellite';

interface SatelliteContextType {
  backendStatus: SatelliteStatus | null;
  hazard: HazardExtentResponse | null;
  roadImpacts: RoadImpact[];
  routeRecommendation: RouteRecommendation | null;
  isLoading: boolean;
  error: string | null;
  lastAoi: AOI | null;
  refreshStatus: () => Promise<void>;
  processLatestObservation: (forceDemo?: boolean) => Promise<void>;
  useDemoData: () => Promise<void>;
  getRoadImpact: (roadId: string) => RoadImpact | undefined;
  getRouteEvaluation: (routeId: string) => RouteRecommendation['evaluations'][number] | undefined;
  isZoneInHazardExtent: (lat: number, lng: number) => boolean;
}

const SatelliteContext = createContext<SatelliteContextType | undefined>(undefined);

// Lightweight ray-casting point-in-polygon test — avoids pulling in a turf
// dependency just for this one check. Coordinates are [lng, lat] per GeoJSON.
function pointInPolygon(lng: number, lat: number, geojson: GeoJSON.Feature | null | undefined): boolean {
  if (!geojson || geojson.geometry?.type !== 'Polygon') return false;
  const ring = (geojson.geometry as GeoJSON.Polygon).coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export const SatelliteProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { scenarioMeta, riskZones, roadNetworks, routes, selectedRoute, setSelectedRoute, addToast } = useDisaster();

  const [backendStatus, setBackendStatus] = useState<SatelliteStatus | null>(null);
  const [hazard, setHazard] = useState<HazardExtentResponse | null>(null);
  const [roadImpacts, setRoadImpacts] = useState<RoadImpact[]>([]);
  const [routeRecommendation, setRouteRecommendation] = useState<RouteRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAoi, setLastAoi] = useState<AOI | null>(null);

  const buildAoi = useCallback((): AOI => {
    const topZone = [...riskZones].sort((a, b) => b.riskScore - a.riskScore)[0];
    return {
      lat: topZone?.coordinates.lat ?? 20.5937,
      lng: topZone?.coordinates.lng ?? 78.9629,
      radius_km: 12,
      scenario_id: scenarioMeta.id,
      label: scenarioMeta.region,
    };
  }, [riskZones, scenarioMeta]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await satelliteApi.getStatus();
      setBackendStatus(status);
      setError(null);
    } catch (err) {
      setBackendStatus(null);
      setError(err instanceof SatelliteApiError ? err.message : 'Satellite backend unreachable.');
    }
  }, []);

  const runPipeline = useCallback(
    async (aoi: AOI, forceDemo: boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        const hazardResult = await satelliteApi.processObservation(aoi, forceDemo);
        setHazard(hazardResult);
        setLastAoi(aoi);

        if (hazardResult.status === 'available' && roadNetworks.length > 0) {
          const impacts = await satelliteApi.getRoadImpact(
            aoi,
            roadNetworks.map((r) => ({ id: r.id, name: r.name, coordinates: r.coordinates }))
          );
          setRoadImpacts(impacts);
        } else {
          setRoadImpacts([]);
        }

        if (hazardResult.status === 'available' && routes.length > 0) {
          const rec = await satelliteApi.recommendRoute(
            aoi,
            routes.map((r) => ({
              id: r.id,
              distanceKm: r.distanceKm,
              estimatedTimeMin: r.estimatedTimeMin,
              coordinates: r.coordinates,
            }))
          );
          setRouteRecommendation(rec);

          // Dynamic route update: if the currently selected route got rejected
          // (BLOCKED) by the fresh hazard extent, switch to the recommended
          // safer alternative and tell the user why.
          if (rec.recommended_route_id && selectedRoute && selectedRoute.id !== rec.recommended_route_id) {
            const currentEval = rec.evaluations.find((e) => e.route_id === selectedRoute.id);
            if (currentEval?.rejected) {
              const newRoute = routes.find((r) => r.id === rec.recommended_route_id);
              if (newRoute) {
                setSelectedRoute(newRoute);
                addToast(
                  'warning',
                  'ROUTE UPDATED',
                  'Route changed due to updated hazard information.'
                );
              }
            }
          }
        } else {
          setRouteRecommendation(null);
        }
      } catch (err) {
        setError(err instanceof SatelliteApiError ? err.message : 'Satellite data temporarily unavailable.');
      } finally {
        setIsLoading(false);
      }
    },
    [roadNetworks, routes, selectedRoute, setSelectedRoute, addToast]
  );

  const processLatestObservation = useCallback(
    async (forceDemo = false) => {
      await runPipeline(buildAoi(), forceDemo);
    },
    [buildAoi, runPipeline]
  );

  const useDemoData = useCallback(async () => {
    await runPipeline(buildAoi(), true);
  }, [buildAoi, runPipeline]);

  // On mount and whenever the active scenario changes, check backend status
  // and load an initial hazard extent so the map/panel aren't empty.
  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (riskZones.length === 0) return;
    runPipeline(buildAoi(), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioMeta.id, riskZones.length]);

  const getRoadImpact = (roadId: string) => roadImpacts.find((r) => r.road_id === roadId);
  const getRouteEvaluation = (routeId: string) =>
    routeRecommendation?.evaluations.find((e) => e.route_id === routeId);
  const isZoneInHazardExtent = (lat: number, lng: number) => pointInPolygon(lng, lat, hazard?.geojson);

  return (
    <SatelliteContext.Provider
      value={{
        backendStatus,
        hazard,
        roadImpacts,
        routeRecommendation,
        isLoading,
        error,
        lastAoi,
        refreshStatus,
        processLatestObservation,
        useDemoData,
        getRoadImpact,
        getRouteEvaluation,
        isZoneInHazardExtent,
      }}
    >
      {children}
    </SatelliteContext.Provider>
  );
};

export const useSatellite = () => {
  const context = useContext(SatelliteContext);
  if (!context) {
    throw new Error('useSatellite must be used within a SatelliteProvider');
  }
  return context;
};
