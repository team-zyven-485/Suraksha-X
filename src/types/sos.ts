export type UserRole = 'citizen' | 'admin' | 'rescue';

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  teamId?: string | null;
  /**
   * True when this session exists only on this device (the server could not
   * be reached, or the app is running as a static demo). An offline session
   * has no server token, so it can only ever see local sample data.
   */
  offline?: boolean;
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

export type CommunicationMode =
  | 'Mobile Network'
  // The SOS was raised with no connection, stored on the device, and
  // transmitted automatically once the network came back.
  | 'Offline Queue (Store & Forward)';

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

export const SOS_DISASTER_TYPES: SOSDisasterType[] = [
  'FLOOD',
  'EARTHQUAKE',
  'CYCLONE',
  'LANDSLIDE',
  'TSUNAMI',
  'FIRE',
  'OTHER',
];

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
  /**
   * 'QUEUED' = raised on this device with no connection and not yet received
   * by the server. Absent/'SYNCED' = the server has it.
   */
  syncState?: 'SYNCED' | 'QUEUED';
  /** Device-generated id that makes re-sending a queued SOS idempotent. */
  clientRequestId?: string | null;
}

export type RescueTeamStatus = 'AVAILABLE' | 'ASSIGNED' | 'DISPATCHED' | 'BUSY';

export interface TeamLocation {
  lat: number;
  lng: number;
  /** GPS accuracy in metres, when the device reports it. */
  accuracy: number | null;
  /** ISO time of the last update; old updates are shown as stale. */
  updatedAt: string;
  /** True for the "demo drive": positions are generated, not read from a GPS. */
  simulated: boolean;
}

export interface RescueTeam {
  id: string;
  name: string;
  specialization: string;
  handles: SOSDisasterType[];
  status: RescueTeamStatus;
  baseDistanceKm: number;
  baseEtaMin: number;
  activeIncidentId: string | null;
  /** Live position shared by the team's phone. Only visible to staff and to the citizen the team is assigned to. */
  location?: TeamLocation | null;
}
