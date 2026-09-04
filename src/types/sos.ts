export type UserRole = 'citizen' | 'admin' | 'rescue';

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  teamId?: string | null;
}

export type SOSStatus =
  | 'REQUESTED'
  | 'VERIFIED'
  | 'ASSIGNED'
  | 'DISPATCHED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'RESCUED'
  | 'CLOSED';

export type RescuePriority = 'P1' | 'P2' | 'P3';

export type CommunicationMode = 'Mobile Network' | 'Satellite Fallback (Simulated)';

// Broader than the 5 admin ScenarioData disaster types — citizens can report
// hazards (e.g. Fire) that aren't necessarily the currently active admin scenario.
export type SOSDisasterType =
  | 'FLOOD'
  | 'EARTHQUAKE'
  | 'CYCLONE'
  | 'LANDSLIDE'
  | 'TSUNAMI'
  | 'FIRE'
  | 'OTHER';

export const SOS_DISASTER_TYPE_LABELS: Record<SOSDisasterType, string> = {
  FLOOD: 'Flood',
  EARTHQUAKE: 'Earthquake',
  CYCLONE: 'Cyclone',
  LANDSLIDE: 'Landslide',
  TSUNAMI: 'Tsunami',
  FIRE: 'Fire',
  OTHER: 'Other Emergency',
};

export interface SOSCoordinates {
  lat: number;
  lng: number;
}

export interface AffectedZoneFlag {
  zoneId: string;
  zoneName: string;
  distanceKm: number;
  riskLevel: string;
}

export interface SOSInstructions {
  priority: RescuePriority;
  requiredAction: string;
  notes: string;
  issuedBy: string;
  issuedAt: string;
}

export interface SOSIncident {
  id: string;
  citizenId: string;
  citizenName: string;
  scenarioId: string;
  zoneId: string | null;
  zoneName: string;
  location: string;
  coordinates: SOSCoordinates;
  isDemoLocation: boolean;
  disasterType: SOSDisasterType;
  hazard: string;
  riskScore: number;
  vulnerabilityTags: string[];
  affectedZones: AffectedZoneFlag[];
  recommendedTeamId: string | null;
  priority: RescuePriority;
  status: SOSStatus;
  communicationMode: CommunicationMode;
  assignedTeamId: string | null;
  instructions: SOSInstructions | null;
  etaMin: number | null;
  timestamp: string;
  statusHistory: { status: SOSStatus; timestamp: string }[];
}

export type RescueTeamStatus = 'AVAILABLE' | 'ASSIGNED' | 'DISPATCHED' | 'BUSY';

export interface RescueTeam {
  id: string;
  name: string;
  specialization: string;
  handles: SOSDisasterType[];
  status: RescueTeamStatus;
  baseDistanceKm: number;
  baseEtaMin: number;
  activeIncidentId: string | null;
}
