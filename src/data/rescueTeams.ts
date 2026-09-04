import { RescueTeam } from '../types/sos';

export const initialRescueTeams: RescueTeam[] = [
  {
    id: 'team-alpha',
    name: 'Rescue Unit Alpha',
    specialization: 'Flood & Water Rescue',
    handles: ['FLOOD', 'CYCLONE', 'TSUNAMI'],
    status: 'AVAILABLE',
    baseDistanceKm: 4.2,
    baseEtaMin: 12,
    activeIncidentId: null,
  },
  {
    id: 'team-bravo',
    name: 'Rescue Unit Bravo',
    specialization: 'Structural Collapse & Extraction',
    handles: ['EARTHQUAKE', 'FIRE'],
    status: 'AVAILABLE',
    baseDistanceKm: 6.8,
    baseEtaMin: 18,
    activeIncidentId: null,
  },
  {
    id: 'team-charlie',
    name: 'Rescue Unit Charlie',
    specialization: 'High-Angle & Terrain Rescue',
    handles: ['LANDSLIDE', 'OTHER'],
    status: 'AVAILABLE',
    baseDistanceKm: 8.1,
    baseEtaMin: 24,
    activeIncidentId: null,
  },
  {
    id: 'team-delta',
    name: 'Rescue Unit Delta',
    specialization: 'Medical First Response',
    handles: ['FIRE', 'EARTHQUAKE', 'FLOOD', 'CYCLONE', 'LANDSLIDE', 'TSUNAMI', 'OTHER'],
    status: 'AVAILABLE',
    baseDistanceKm: 5.5,
    baseEtaMin: 15,
    activeIncidentId: null,
  },
];
