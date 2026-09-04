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

export const mockRoadNetworks: RoadSegment[] = [
  {
    id: 'road-nh-12-corridor',
    name: 'NH-12 National Highway Trunk Corridor',
    type: 'HIGHWAY',
    status: 'CAUTION',
    speedLimitKmh: 60,
    lanes: 4,
    elevationMeters: 22,
    coordinates: [
      [26.140, 91.680],
      [26.155, 91.700],
      [26.175, 91.720],
      [26.195, 91.745],
      [26.220, 91.770],
      [26.240, 91.800],
    ],
  },
  {
    id: 'road-elevated-bypass-b',
    name: 'Route B North Elevated Flood Bypass',
    type: 'ELEVATED',
    status: 'CLEAR',
    speedLimitKmh: 50,
    lanes: 2,
    elevationMeters: 38,
    coordinates: [
      [26.185, 91.735],
      [26.198, 91.728],
      [26.205, 91.720],
      [26.215, 91.705],
    ],
  },
  {
    id: 'road-central-arterial',
    name: 'Central District Spine Arterial',
    type: 'ARTERIAL',
    status: 'CLEAR',
    speedLimitKmh: 45,
    lanes: 4,
    elevationMeters: 28,
    coordinates: [
      [26.130, 91.740],
      [26.150, 91.750],
      [26.175, 91.765],
      [26.190, 91.780],
      [26.210, 91.800],
    ],
  },
  {
    id: 'road-west-bund-connector',
    name: 'West Estuary Ring Connector',
    type: 'SECONDARY',
    status: 'CAUTION',
    speedLimitKmh: 40,
    lanes: 2,
    elevationMeters: 16,
    coordinates: [
      [26.145, 91.690],
      [26.160, 91.705],
      [26.178, 91.715],
      [26.190, 91.710],
    ],
  },
  {
    id: 'road-east-polder-link',
    name: 'East Polder - Sports Complex Link Road',
    type: 'SECONDARY',
    status: 'CLEAR',
    speedLimitKmh: 40,
    lanes: 2,
    elevationMeters: 24,
    coordinates: [
      [26.210, 91.765],
      [26.195, 91.785],
      [26.180, 91.810],
      [26.170, 91.820],
    ],
  },
  {
    id: 'road-hill-crest-access',
    name: 'North Hill Crest Emergency Access Spur',
    type: 'ELEVATED',
    status: 'CLEAR',
    speedLimitKmh: 35,
    lanes: 2,
    elevationMeters: 48,
    coordinates: [
      [26.205, 91.720],
      [26.210, 91.712],
      [26.218, 91.702],
      [26.225, 91.695],
    ],
  },
];
