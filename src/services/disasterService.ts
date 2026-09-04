import { RiskZone, ReliefCentre, EvacuationRoute, BlockedRoad, SystemAlert, RelocationPlan, RoadSegment } from '../types';
import { ScenarioData, ScenarioMeta, DemographicSummary, AnalyticsData } from '../data/scenarios';
import { getScenario, DEFAULT_SCENARIO_ID } from '../data/scenarios';
import { getSupabaseClient } from '../lib/supabaseClient';

let activeScenarioId = DEFAULT_SCENARIO_ID;

function localScenario(): ScenarioData {
  return getScenario(activeScenarioId);
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Only a couple of relief centres per scenario have an authored, turn-by-turn
// verified corridor — most don't. Rather than let a relocation plan's
// "primary corridor" silently point at a route to a DIFFERENT shelter than
// the one people are actually being sent to, synthesize an honest direct-line
// distance estimate (mirrors CitizenSafeCentres' buildRouteToCentre).
function buildDirectRoute(zone: RiskZone, shelter: ReliefCentre): EvacuationRoute {
  const distanceKm = haversineKm(zone.coordinates, shelter.coordinates);
  const avgSpeedKmh = 25; // conservative evacuation-conditions estimate
  const estimatedTimeMin = Math.max(1, Math.round((distanceKm / avgSpeedKmh) * 60));
  const safetyScore = shelter.safetyScore;
  const safetyLevel: EvacuationRoute['safetyLevel'] = safetyScore >= 80 ? 'HIGH' : safetyScore >= 60 ? 'MODERATE' : 'LOW';

  return {
    id: `direct-${shelter.id}`,
    originId: zone.id,
    originName: zone.name,
    destinationId: shelter.id,
    destinationName: shelter.name,
    distanceKm: Math.round(distanceKm * 10) / 10,
    estimatedTimeMin,
    safetyScore,
    safetyLevel,
    blockedRoadsCount: 0,
    elevationClearanceMeters: shelter.elevationMeters ?? 0,
    coordinates: [
      [zone.coordinates.lat, zone.coordinates.lng],
      [shelter.coordinates.lat, shelter.coordinates.lng],
    ],
    turnByTurn: [
      {
        step: 1,
        instruction: `Proceed directly toward ${shelter.name}. This is a direct-line distance estimate, not a verified road corridor — dispatch a recon team to confirm the actual route before convoy departure.`,
        distance: `${Math.round(distanceKm * 10) / 10} km`,
        roadCondition: 'CLEAR',
      },
    ],
    isRecommended: false,
  };
}

// ---------------------------------------------------------------------------
// Row -> app-model mappers (snake_case DB columns -> the exact camelCase
// TS interfaces the rest of the app already consumes, so no downstream page
// or component needs to change).
// ---------------------------------------------------------------------------
function mapRiskZone(r: any): RiskZone {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    district: r.district,
    riverBasin: r.river_basin,
    riskScore: r.risk_score,
    riskLevel: r.risk_level,
    priority: r.priority,
    population: r.population,
    vulnerablePopulation: r.vulnerable_population,
    exposureLevel: r.exposure_level,
    floodDepthEstMeters: Number(r.flood_depth_est_meters),
    waterLevelTrend: r.water_level_trend,
    recommendedAction: r.recommended_action,
    coordinates: { lat: r.lat, lng: r.lng },
    polygon: r.polygon,
    vulnerabilityBreakdown: r.vulnerability_breakdown,
    reasoning: r.reasoning,
    lastAssessed: r.last_assessed,
  };
}

function mapReliefCentre(r: any): ReliefCentre {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    location: r.location,
    coordinates: { lat: r.lat, lng: r.lng },
    capacity: r.capacity,
    occupancy: r.occupancy,
    available: r.available,
    status: r.status,
    distanceKm: r.distance_km != null ? Number(r.distance_km) : undefined,
    travelTimeMin: r.travel_time_min ?? undefined,
    facilities: r.facilities,
    contactOfficer: r.contact_officer,
    elevationMeters: Number(r.elevation_meters),
    safetyScore: r.safety_score,
  };
}

function mapRoute(r: any): EvacuationRoute {
  return {
    id: r.id,
    originId: r.origin_id,
    originName: r.origin_name,
    destinationId: r.destination_id,
    destinationName: r.destination_name,
    distanceKm: Number(r.distance_km),
    estimatedTimeMin: r.estimated_time_min,
    safetyScore: r.safety_score,
    safetyLevel: r.safety_level,
    blockedRoadsCount: r.blocked_roads_count,
    elevationClearanceMeters: Number(r.elevation_clearance_meters),
    coordinates: r.coordinates,
    turnByTurn: r.turn_by_turn,
    isRecommended: r.is_recommended,
  };
}

function mapBlockedRoad(r: any): BlockedRoad {
  return {
    id: r.id,
    name: r.name,
    reason: r.reason,
    coordinates: r.coordinates,
    severity: r.severity,
    reportedAt: r.reported_at,
  };
}

function mapRoadSegment(r: any): RoadSegment {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    status: r.status,
    coordinates: r.coordinates,
    speedLimitKmh: r.speed_limit_kmh,
    lanes: r.lanes,
    elevationMeters: Number(r.elevation_meters),
  };
}

function mapAlert(r: any): SystemAlert {
  return {
    id: r.id,
    title: r.title,
    message: r.message,
    severity: r.severity,
    timestamp: r.timestamp,
    zoneId: r.zone_id ?? undefined,
    read: r.read,
  };
}

function mapScenarioMeta(r: any): ScenarioMeta {
  return {
    id: r.id,
    name: r.name,
    disasterType: r.disaster_type,
    category: r.category,
    region: r.region,
    state: r.state,
    riverBasinOrFault: r.river_basin_or_fault,
    lastUpdated: r.last_updated,
    criticalZonesCount: r.critical_zones_count,
    totalHazardZones: r.total_hazard_zones,
    totalReliefCentres: r.total_relief_centres,
    totalPopulationAtRisk: r.total_population_at_risk,
    totalVulnerablePopulation: r.total_vulnerable_population,
    availableShelterCapacity: r.available_shelter_capacity,
    totalShelterCapacity: r.total_shelter_capacity,
    totalShelterOccupancy: r.total_shelter_occupancy,
    hazardIcon: r.hazard_icon,
    hazardColor: r.hazard_color,
  };
}

function mapDemographics(r: any): DemographicSummary {
  return {
    totalPopulationAtRisk: r.total_population_at_risk,
    totalVulnerablePopulation: r.total_vulnerable_population,
    activeHazardZonesCount: r.active_hazard_zones_count,
    criticalZonesCount: r.critical_zones_count,
    reliefCentresCount: r.relief_centres_count,
    availableShelterCapacity: r.available_shelter_capacity,
    totalShelterCapacity: r.total_shelter_capacity,
    totalShelterOccupancy: r.total_shelter_occupancy,
    vulnerabilityDistribution: r.vulnerability_distribution,
  };
}

function mapAnalytics(r: any): AnalyticsData {
  return {
    riskDistributionData: r.risk_distribution,
    riskTrendData: r.risk_trend,
    zoneComparisonData: r.zone_comparison,
    shelterUtilizationData: r.shelter_utilization,
    evacuationProgressData: r.evacuation_progress,
  };
}

/**
 * Runs a Supabase query and falls back to a local computation if Supabase is
 * unconfigured, the query errors, or returns no rows (e.g. before the seed
 * migration has been applied) — so the app keeps working out of the box.
 */
async function withFallback<T>(
  supabaseQuery: () => PromiseLike<{ data: any; error: any }>,
  mapRows: (rows: any[]) => T,
  fallback: () => T
): Promise<T> {
  const client = getSupabaseClient();
  if (!client) return fallback();

  try {
    const { data, error } = await supabaseQuery();
    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      return fallback();
    }
    return mapRows(data);
  } catch {
    return fallback();
  }
}

export const disasterService = {
  setActiveScenario(id: string) {
    activeScenarioId = id;
  },

  getActiveScenarioId(): string {
    return activeScenarioId;
  },

  async getScenarioMeta(): Promise<ScenarioMeta> {
    const client = getSupabaseClient();
    if (!client) return localScenario().meta;
    try {
      const { data, error } = await client.from('scenarios').select('*').eq('id', activeScenarioId).maybeSingle();
      if (error || !data) return localScenario().meta;
      return mapScenarioMeta(data);
    } catch {
      return localScenario().meta;
    }
  },

  async getDemographics(): Promise<DemographicSummary> {
    const client = getSupabaseClient();
    if (!client) return localScenario().demographics;
    try {
      const { data, error } = await client.from('demographics').select('*').eq('scenario_id', activeScenarioId).maybeSingle();
      if (error || !data) return localScenario().demographics;
      return mapDemographics(data);
    } catch {
      return localScenario().demographics;
    }
  },

  async getAnalytics(): Promise<AnalyticsData> {
    const client = getSupabaseClient();
    if (!client) return localScenario().analytics;
    try {
      const { data, error } = await client.from('analytics_snapshots').select('*').eq('scenario_id', activeScenarioId).maybeSingle();
      if (error || !data) return localScenario().analytics;
      return mapAnalytics(data);
    } catch {
      return localScenario().analytics;
    }
  },

  async getRiskZones(): Promise<RiskZone[]> {
    return withFallback(
      () => getSupabaseClient()!.from('risk_zones').select('*').eq('scenario_id', activeScenarioId),
      (rows) => rows.map(mapRiskZone),
      () => [...localScenario().riskZones]
    );
  },

  async getRiskZoneById(id: string): Promise<RiskZone | undefined> {
    const zones = await this.getRiskZones();
    return zones.find((z) => z.id === id);
  },

  async getReliefCentres(): Promise<ReliefCentre[]> {
    return withFallback(
      () => getSupabaseClient()!.from('relief_centres').select('*').eq('scenario_id', activeScenarioId),
      (rows) => rows.map(mapReliefCentre),
      () => [...localScenario().reliefCentres]
    );
  },

  async getReliefCentreById(id: string): Promise<ReliefCentre | undefined> {
    const centres = await this.getReliefCentres();
    return centres.find((s) => s.id === id);
  },

  async getRoutes(): Promise<EvacuationRoute[]> {
    return withFallback(
      () => getSupabaseClient()!.from('evacuation_routes').select('*').eq('scenario_id', activeScenarioId),
      (rows) => rows.map(mapRoute),
      () => [...localScenario().evacuationRoutes]
    );
  },

  async getBlockedRoads(): Promise<BlockedRoad[]> {
    return withFallback(
      () => getSupabaseClient()!.from('blocked_roads').select('*').eq('scenario_id', activeScenarioId),
      (rows) => rows.map(mapBlockedRoad),
      () => [...localScenario().blockedRoads]
    );
  },

  async getRoadNetworks(): Promise<RoadSegment[]> {
    return withFallback(
      () => getSupabaseClient()!.from('road_networks').select('*').eq('scenario_id', activeScenarioId),
      (rows) => rows.map(mapRoadSegment),
      () => [...localScenario().roadNetworks]
    );
  },

  async getAlerts(): Promise<SystemAlert[]> {
    return withFallback(
      () => getSupabaseClient()!.from('alerts').select('*').eq('scenario_id', activeScenarioId),
      (rows) => rows.map(mapAlert),
      () => [...localScenario().alerts]
    );
  },

  async generateRelocationPlan(
    zoneId: string,
    options?: { preferredShelterId?: string; preferredRouteId?: string }
  ): Promise<RelocationPlan> {
    const [zones, centres, routes] = await Promise.all([
      this.getRiskZones(),
      this.getReliefCentres(),
      this.getRoutes(),
    ]);

    const zone = zones.find((z) => z.id === zoneId) || zones[0];

    const availableShelters = [...centres].sort((a, b) => {
      const aScore = a.safetyScore * 0.4 + (a.available > 0 ? 30 : 0) + (1 / (a.distanceKm || 10)) * 30;
      const bScore = b.safetyScore * 0.4 + (b.available > 0 ? 30 : 0) + (1 / (b.distanceKm || 10)) * 30;
      return bScore - aScore;
    });

    // Honor an explicitly chosen shelter (e.g. "Select Alternative" on the
    // Planner) rather than silently overwriting it with the algorithm's own
    // pick. Otherwise prefer a shelter that can actually fit the zone's whole
    // vulnerable population before falling back to merely-nonzero capacity —
    // picking a shelter too small for the group being sent there and calling
    // the plan "AUTHORIZED" without saying so is its own kind of bug.
    const preferredShelter = options?.preferredShelterId
      ? availableShelters.find((s) => s.id === options.preferredShelterId)
      : undefined;
    const fullFitShelter = availableShelters.find((s) => s.available >= zone.vulnerablePopulation);
    const recommendedShelter =
      preferredShelter || fullFitShelter || availableShelters.find((s) => s.available > 0) || availableShelters[0];
    const alternativeShelters = availableShelters.filter((s) => s.id !== recommendedShelter.id).slice(0, 3);
    const shelterShortfall = Math.max(0, zone.vulnerablePopulation - recommendedShelter.available);

    const routesForZone = routes.filter((r) => r.originId === zone.id);
    const allRoutes = routesForZone.length > 0 ? routesForZone : routes;
    const preferredRoute = options?.preferredRouteId
      ? allRoutes.find((r) => r.id === options.preferredRouteId)
      : undefined;
    // Never let "PRIMARY CORRIDOR" point at a different relief centre than
    // "ASSIGNED SHELTER": prefer an explicit route choice, then an authored
    // route that actually terminates at the assigned shelter, and only
    // synthesize a direct-line estimate if neither exists — never fall back
    // to some other shelter's route just because it happens to be flagged
    // "recommended".
    const primaryRoute =
      preferredRoute ||
      allRoutes.find((r) => r.destinationId === recommendedShelter.id) ||
      buildDirectRoute(zone, recommendedShelter);
    const alternativeRoutes = allRoutes.filter((r) => r.id !== primaryRoute.id);

    const plan: RelocationPlan = {
      id: `PLAN-${Date.now().toString().slice(-6)}`,
      zoneId: zone.id,
      zoneName: zone.name,
      riskScore: zone.riskScore,
      priority: zone.priority,
      totalPopulation: zone.population,
      vulnerablePopulation: zone.vulnerablePopulation,
      recommendedShelter,
      alternativeShelters,
      primaryRoute,
      alternativeRoutes,
      reasoning: `Priority assessment for ${zone.name}: hazard exposure index ${zone.vulnerabilityBreakdown.hazardExposureScore}/100, ${zone.vulnerablePopulation} vulnerable residents identified, ${recommendedShelter.available} capacity slots verified at ${recommendedShelter.name}. ${
        shelterShortfall > 0
          ? `PARTIAL CAPACITY: ${recommendedShelter.name} can only take ${recommendedShelter.available} of ${zone.vulnerablePopulation} — ${shelterShortfall} residents will need an overflow shelter or additional transport. `
          : ''
      }${zone.reasoning}`,
      generatedAt: new Date().toLocaleTimeString(),
      status: 'AUTHORIZED',
      checklist: [
        {
          id: 'chk-1',
          task: `Notify local emergency response team & community leaders in ${zone.name}`,
          assignee: 'NDRF Quick Response Team Alpha',
          status: 'COMPLETED',
          priority: 'CRITICAL',
          estimatedTime: `Done (${new Date().toLocaleTimeString()})`,
        },
        {
          id: 'chk-2',
          task: `Prepare ${recommendedShelter.code} (${recommendedShelter.name}) reception beds & triage`,
          assignee: `${recommendedShelter.contactOfficer.name} (${recommendedShelter.contactOfficer.designation})`,
          status: 'IN_PROGRESS',
          priority: 'CRITICAL',
          estimatedTime: '10 min',
        },
        {
          id: 'chk-3',
          task: `Clear recommended evacuation corridor & post traffic marshals`,
          assignee: 'Traffic Control Division / State Police',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          estimatedTime: '8 min',
        },
        {
          id: 'chk-4',
          task: 'Prioritize and mobilize transport for vulnerable residents (Elderly & Pediatric groups)',
          assignee: 'Civil Defense Transport Brigade',
          status: 'IN_PROGRESS',
          priority: 'CRITICAL',
          estimatedTime: '15 min',
        },
        {
          id: 'chk-5',
          task: `Begin phased convoy evacuation toward ${recommendedShelter.name}`,
          assignee: 'Incident Commander Alpha',
          status: 'PENDING',
          priority: 'HIGH',
          estimatedTime: `${primaryRoute.estimatedTimeMin} min`,
        },
        {
          id: 'chk-6',
          task: 'Monitor hazard sensors & telemetry continuously at active zone perimeter',
          assignee: 'Hazard Monitoring Unit',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          estimatedTime: 'Continuous',
        },
        ...(shelterShortfall > 0
          ? [
              {
                id: 'chk-7',
                task: `Arrange overflow shelter or secondary transport for ${shelterShortfall} residents exceeding ${recommendedShelter.code}'s available capacity`,
                assignee: 'Incident Commander Alpha',
                status: 'PENDING' as const,
                priority: 'CRITICAL' as const,
                estimatedTime: '20 min',
              },
            ]
          : []),
      ],
    };

    return plan;
  },
};
