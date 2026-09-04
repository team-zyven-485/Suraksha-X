import { EvacuationRoute, BlockedRoad } from '../types';

export const mockBlockedRoads: BlockedRoad[] = [
  {
    id: 'block-01',
    name: 'NH-12 River Causeway Bridge',
    reason: 'Active 1.8m flash water surge & structural scour alarm',
    coordinates: [
      [26.188, 91.718],
      [26.192, 91.714],
    ],
    severity: 'SUBMERGED_UNSAFE',
    reportedAt: '19:15:00 UTC+5:30',
  },
  {
    id: 'block-02',
    name: 'Sector 4 Canal Underpass',
    reason: 'Total silt blockage and submerged power lines',
    coordinates: [
      [26.170, 91.738],
      [26.173, 91.745],
    ],
    severity: 'TOTAL_BLOCKAGE',
    reportedAt: '19:05:00 UTC+5:30',
  },
  {
    id: 'block-03',
    name: 'South Estuary Low Road',
    reason: 'Embankment soil sliding across 250m section',
    coordinates: [
      [26.152, 91.712],
      [26.155, 91.722],
    ],
    severity: 'LANDSLIDE_RISK',
    reportedAt: '18:50:00 UTC+5:30',
  },
];

export const mockEvacuationRoutes: EvacuationRoute[] = [
  {
    id: 'route-village-a-rc03-primary',
    originId: 'zone-village-a',
    originName: 'Village A (North Bank)',
    destinationId: 'shelter-03',
    destinationName: 'Relief Centre #03 (Govt Higher Secondary Complex)',
    distanceKm: 4.2,
    estimatedTimeMin: 18,
    safetyScore: 95,
    safetyLevel: 'HIGH',
    blockedRoadsCount: 1, // Bypasses the blocked NH-12 causeway
    elevationClearanceMeters: 14.5,
    isRecommended: true,
    coordinates: [
      [26.185, 91.735], // Village A center
      [26.190, 91.732], // Sector North Gate
      [26.198, 91.728], // Route B Elevation Highway
      [26.205, 91.720], // Junction C Arterial Overpass
      [26.210, 91.712], // Hill Access Ramp
      [26.215, 91.705], // Relief Centre #03 Gate
    ],
    turnByTurn: [
      {
        step: 1,
        instruction: 'Muster at Village A North Community Ground & embark high-clearance transit convoys.',
        distance: '0.4 km',
        roadCondition: 'CLEAR',
      },
      {
        step: 2,
        instruction: 'Turn northwest onto Route B Elevated Bypass to avoid low-lying culverts.',
        distance: '1.2 km',
        roadCondition: 'CLEAR',
      },
      {
        step: 3,
        instruction: 'Cross Junction C via the reinforced concrete flyover (Traffic Control Post Alpha deployed).',
        distance: '1.4 km',
        roadCondition: 'CLEAR',
      },
      {
        step: 4,
        instruction: 'Ascend North Hill Ridge access spur directly to Relief Centre #03 Reception Bay.',
        distance: '1.2 km',
        roadCondition: 'CLEAR',
      },
    ],
  },
  {
    id: 'route-village-a-rc03-alt1',
    originId: 'zone-village-a',
    originName: 'Village A (North Bank)',
    destinationId: 'shelter-03',
    destinationName: 'Relief Centre #03 (Govt Higher Secondary Complex)',
    distanceKm: 5.8,
    estimatedTimeMin: 29,
    safetyScore: 74,
    safetyLevel: 'MODERATE',
    blockedRoadsCount: 0,
    elevationClearanceMeters: 6.2,
    isRecommended: false,
    coordinates: [
      [26.185, 91.735],
      [26.180, 91.745],
      [26.195, 91.760],
      [26.215, 91.740],
      [26.222, 91.718],
      [26.215, 91.705],
    ],
    turnByTurn: [
      {
        step: 1,
        instruction: 'Exit Village A via Eastern Bund Road.',
        distance: '0.8 km',
        roadCondition: 'WATERLOGGED_PASSABLE',
      },
      {
        step: 2,
        instruction: 'Follow East Meander Loop toward High Canal Road.',
        distance: '2.3 km',
        roadCondition: 'CONGESTED',
      },
      {
        step: 3,
        instruction: 'Turn west onto Plateau Link Highway.',
        distance: '1.9 km',
        roadCondition: 'CLEAR',
      },
      {
        step: 4,
        instruction: 'Arrive at Relief Centre #03 North Entrance.',
        distance: '0.8 km',
        roadCondition: 'CLEAR',
      },
    ],
  },
  {
    id: 'route-village-a-rc01-alt2',
    originId: 'zone-village-a',
    originName: 'Village A (North Bank)',
    destinationId: 'shelter-01',
    destinationName: 'Relief Centre #01 (District Sports Stadium)',
    distanceKm: 8.4,
    estimatedTimeMin: 38,
    safetyScore: 68,
    safetyLevel: 'MODERATE',
    blockedRoadsCount: 2,
    elevationClearanceMeters: 4.8,
    isRecommended: false,
    coordinates: [
      [26.185, 91.735],
      [26.180, 91.760],
      [26.175, 91.785],
      [26.170, 91.810],
    ],
    turnByTurn: [
      {
        step: 1,
        instruction: 'Proceed south-east across Sector 2 bypass.',
        distance: '2.1 km',
        roadCondition: 'WATERLOGGED_PASSABLE',
      },
      {
        step: 2,
        instruction: 'Merge onto Central District Trunk Road.',
        distance: '4.8 km',
        roadCondition: 'CONGESTED',
      },
      {
        step: 3,
        instruction: 'Enter Stadium gate 4 staging area.',
        distance: '1.5 km',
        roadCondition: 'CLEAR',
      },
    ],
  },
];
