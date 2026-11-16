import { RiskZone, ReliefCentre, EvacuationRoute, BlockedRoad, SystemAlert, RelocationPlan, RoadSegment } from '../types';
import { ScenarioData, ScenarioMeta, DemographicSummary, AnalyticsData } from '../data/scenarios';
import { getScenario, DEFAULT_SCENARIO_ID } from '../data/scenarios';

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

// Scenario data is bundled with the app (src/data/scenarios) rather than
// fetched, so every dashboard works with no connection at all. The server /
// MongoDB persist the things that change at runtime: SOS incidents, rescue
// team status, relocation plans and CAP broadcast logs.
export const disasterService = {
  setActiveScenario(id: string) {
    activeScenarioId = id;
  },

  getActiveScenarioId(): string {
    return activeScenarioId;
  },

  async getScenarioMeta(): Promise<ScenarioMeta> {
    return localScenario().meta;
  },

  async getDemographics(): Promise<DemographicSummary> {
    return localScenario().demographics;
  },

  async getAnalytics(): Promise<AnalyticsData> {
    return localScenario().analytics;
  },

  async getRiskZones(): Promise<RiskZone[]> {
    return [...localScenario().riskZones];
  },

  async getRiskZoneById(id: string): Promise<RiskZone | undefined> {
    const zones = await this.getRiskZones();
    return zones.find((z) => z.id === id);
  },

  async getReliefCentres(): Promise<ReliefCentre[]> {
    return [...localScenario().reliefCentres];
  },

  async getReliefCentreById(id: string): Promise<ReliefCentre | undefined> {
    const centres = await this.getReliefCentres();
    return centres.find((s) => s.id === id);
  },

  async getRoutes(): Promise<EvacuationRoute[]> {
    return [...localScenario().evacuationRoutes];
  },

  async getBlockedRoads(): Promise<BlockedRoad[]> {
    return [...localScenario().blockedRoads];
  },

  async getRoadNetworks(): Promise<RoadSegment[]> {
    return [...localScenario().roadNetworks];
  },

  async getAlerts(): Promise<SystemAlert[]> {
    return [...localScenario().alerts];
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
          status: 'PENDING',
          priority: 'CRITICAL',
          estimatedTime: '5 min',
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
