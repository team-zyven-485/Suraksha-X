import {
  RiskZone,
  ReliefCentre,
  EvacuationRoute,
  BlockedRoad,
  SystemAlert,
  RoadSegment,
} from '../../types';

export type DisasterType = 'FLOOD' | 'EARTHQUAKE' | 'CYCLONE' | 'LANDSLIDE' | 'TSUNAMI';

export interface ScenarioMeta {
  id: string;
  name: string;
  disasterType: DisasterType;
  category: string;         // e.g. "Cat-4", "Mw 7.7", "Cat-5"
  region: string;            // e.g. "River Basin District"
  state: string;             // e.g. "Assam"
  riverBasinOrFault: string; // contextual label
  lastUpdated: string;       // timestamp string
  criticalZonesCount: number;
  totalHazardZones: number;
  totalReliefCentres: number;
  totalPopulationAtRisk: number;
  totalVulnerablePopulation: number;
  availableShelterCapacity: number;
  totalShelterCapacity: number;
  totalShelterOccupancy: number;
  hazardIcon: 'Waves' | 'Mountain' | 'Wind' | 'Landmark' | 'Tsunami';
  hazardColor: string;       // tailwind color token e.g. "red", "orange"
}

export interface DemographicSummary {
  totalPopulationAtRisk: number;
  totalVulnerablePopulation: number;
  activeHazardZonesCount: number;
  criticalZonesCount: number;
  reliefCentresCount: number;
  availableShelterCapacity: number;
  totalShelterCapacity: number;
  totalShelterOccupancy: number;
  vulnerabilityDistribution: {
    category: string;
    count: number;
    percentage: number;
  }[];
}

export interface AnalyticsData {
  riskDistributionData: { name: string; zones: number; population: number; vulnerable: number; color: string }[];
  riskTrendData: { time: string; avgRiskScore: number; floodLevelMeters: number; evacuatedCount: number }[];
  zoneComparisonData: { zone: string; riskScore: number; popExposure: number; hazardScore: number; accessScore: number; vulnerable: number }[];
  shelterUtilizationData: { name: string; capacity: number; occupancy: number; available: number; occupancyRate: number; status: string }[];
  evacuationProgressData: { segment: string; target: number; evacuated: number; inTransit: number; remaining: number }[];
}

export interface ScenarioData {
  meta: ScenarioMeta;
  riskZones: RiskZone[];
  reliefCentres: ReliefCentre[];
  evacuationRoutes: EvacuationRoute[];
  blockedRoads: BlockedRoad[];
  roadNetworks: RoadSegment[];
  alerts: SystemAlert[];
  demographics: DemographicSummary;
  analytics: AnalyticsData;
}
