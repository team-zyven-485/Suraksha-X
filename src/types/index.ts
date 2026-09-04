export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'SAFE';

export type PriorityLevel = 'P1' | 'P2' | 'P3' | 'P4';

export type ShelterStatus = 'AVAILABLE' | 'NEAR_CAPACITY' | 'FULL' | 'UNAVAILABLE';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface RiskZone {
  id: string;
  name: string;
  code: string;
  district: string;
  riverBasin: string;
  riskScore: number; // 0 - 100
  riskLevel: RiskLevel;
  priority: PriorityLevel;
  population: number;
  vulnerablePopulation: number;
  exposureLevel: 'Extreme' | 'Very High' | 'High' | 'Moderate' | 'Low';
  floodDepthEstMeters: number;
  waterLevelTrend: 'RISING_RAPID' | 'RISING_SLOW' | 'STABLE' | 'RECEDING';
  recommendedAction: string;
  coordinates: Coordinates;
  polygon: [number, number][];
  vulnerabilityBreakdown: {
    elderly: number; // count
    children: number;
    pwd: number; // persons with disabilities
    highDensityHouseholds: number;
    accessibilityScore: number; // 0-100 (lower means harder to access)
    shelterAvailabilityScore: number;
    hazardExposureScore: number;
    populationExposureScore: number;
  };
  reasoning: string;
  lastAssessed: string;
}

export interface ReliefCentre {
  id: string;
  name: string;
  code: string;
  location: string;
  coordinates: Coordinates;
  capacity: number;
  occupancy: number;
  available: number;
  status: ShelterStatus;
  distanceKm?: number;
  travelTimeMin?: number;
  facilities: {
    medicalUnit: boolean;
    foodRationsDays: number;
    cleanWaterLiters: number;
    backupPower: boolean;
    sanitationBlocks: number;
    wheelchairAccessible: boolean;
  };
  contactOfficer: {
    name: string;
    designation: string;
    phone: string;
    channel: string;
  };
  elevationMeters: number;
  safetyScore: number; // 0-100
}

export interface RoutePoint {
  lat: number;
  lng: number;
  instruction?: string;
}

export interface EvacuationRoute {
  id: string;
  originId: string;
  originName: string;
  destinationId: string;
  destinationName: string;
  distanceKm: number;
  estimatedTimeMin: number;
  safetyScore: number; // 0-100
  safetyLevel: 'HIGH' | 'MODERATE' | 'LOW';
  blockedRoadsCount: number;
  elevationClearanceMeters: number;
  coordinates: [number, number][];
  turnByTurn: {
    step: number;
    instruction: string;
    distance: string;
    roadCondition: 'CLEAR' | 'WATERLOGGED_PASSABLE' | 'CONGESTED';
  }[];
  isRecommended: boolean;
}

export interface BlockedRoad {
  id: string;
  name: string;
  reason: string;
  coordinates: [number, number][];
  severity: 'TOTAL_BLOCKAGE' | 'SUBMERGED_UNSAFE' | 'LANDSLIDE_RISK';
  reportedAt: string;
}

export interface SystemAlert {
  id: string;
  title: string;
  message: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  timestamp: string;
  zoneId?: string;
  read: boolean;
}

export interface ActionPlanStep {
  id: string;
  task: string;
  assignee: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  estimatedTime: string;
}

export interface RelocationPlan {
  id: string;
  zoneId: string;
  zoneName: string;
  riskScore: number;
  priority: PriorityLevel;
  totalPopulation: number;
  vulnerablePopulation: number;
  recommendedShelter: ReliefCentre;
  alternativeShelters: ReliefCentre[];
  primaryRoute: EvacuationRoute;
  alternativeRoutes: EvacuationRoute[];
  reasoning: string;
  generatedAt: string;
  status: 'PROPOSED' | 'AUTHORIZED' | 'EXECUTING' | 'COMPLETED';
  checklist: ActionPlanStep[];
}

export interface RoadSegment {
  id: string;
  name: string;
  type: 'HIGHWAY' | 'ARTERIAL' | 'ELEVATED' | 'SECONDARY' | 'LOCAL';
  status: 'CLEAR' | 'CAUTION' | 'RESTRICTED';
  coordinates: [number, number][];
  speedLimitKmh: number;
  lanes: number;
  elevationMeters: number;
}

export interface MapLayerState {
  hazardZones: boolean;
  populationClusters: boolean;
  vulnerabilityIndicators: boolean;
  reliefCentres: boolean;
  roadNetwork: boolean;
  blockedRoads: boolean;
  evacuationRoutes: boolean;
  satelliteFloodExtent: boolean;
  // Legacy aliases for backward compatibility
  populationHeatmap?: boolean;
  vulnerabilityOverlay?: boolean;
}
