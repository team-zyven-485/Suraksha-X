export const riskDistributionData = [
  { name: 'Critical (P1)', zones: 4, population: 9500, vulnerable: 3570, color: '#ef4444' },
  { name: 'High Risk (P2)', zones: 3, population: 4300, vulnerable: 980, color: '#f97316' },
  { name: 'Moderate (P3)', zones: 3, population: 3120, vulnerable: 580, color: '#eab308' },
  { name: 'Safe / Low (P4)', zones: 2, population: 1500, vulnerable: 150, color: '#22c55e' },
];

export const riskTrendData = [
  { time: '14:00', avgRiskScore: 42, floodLevelMeters: 1.1, evacuatedCount: 0 },
  { time: '15:00', avgRiskScore: 48, floodLevelMeters: 1.4, evacuatedCount: 150 },
  { time: '16:00', avgRiskScore: 59, floodLevelMeters: 1.9, evacuatedCount: 620 },
  { time: '17:00', avgRiskScore: 73, floodLevelMeters: 2.5, evacuatedCount: 1840 },
  { time: '18:00', avgRiskScore: 84, floodLevelMeters: 3.1, evacuatedCount: 3200 },
  { time: '19:00', avgRiskScore: 91, floodLevelMeters: 3.4, evacuatedCount: 4680 },
  { time: '19:30 (Current)', avgRiskScore: 94, floodLevelMeters: 3.4, evacuatedCount: 5280 },
];

export const zoneComparisonData = [
  { zone: 'Village A', riskScore: 94, popExposure: 82, hazardScore: 95, accessScore: 71, vulnerable: 680 },
  { zone: 'Village B', riskScore: 87, popExposure: 86, hazardScore: 88, accessScore: 62, vulnerable: 890 },
  { zone: 'Village F', riskScore: 82, popExposure: 80, hazardScore: 84, accessScore: 59, vulnerable: 2000 },
  { zone: 'Village C', riskScore: 71, popExposure: 68, hazardScore: 74, accessScore: 78, vulnerable: 420 },
  { zone: 'Village D', riskScore: 56, popExposure: 58, hazardScore: 54, accessScore: 85, vulnerable: 580 },
  { zone: 'Village E', riskScore: 32, popExposure: 35, hazardScore: 28, accessScore: 94, vulnerable: 710 },
];

export const shelterUtilizationData = [
  { name: 'RC #03 (North Hill)', capacity: 2500, occupancy: 1820, available: 680, occupancyRate: 72.8, status: 'AVAILABLE' },
  { name: 'RC #01 (Sports Stadium)', capacity: 3800, occupancy: 3450, available: 350, occupancyRate: 90.8, status: 'NEAR_CAPACITY' },
  { name: 'RC #02 (Polytechnic)', capacity: 1800, occupancy: 1650, available: 150, occupancyRate: 91.6, status: 'NEAR_CAPACITY' },
  { name: 'RC #04 (Univ Auditorium)', capacity: 2200, occupancy: 950, available: 1250, occupancyRate: 43.1, status: 'AVAILABLE' },
  { name: 'RC #05 (Municipal Hall)', capacity: 1200, occupancy: 1200, available: 0, occupancyRate: 100.0, status: 'FULL' },
  { name: 'RC #06 (Industrial Hub)', capacity: 3000, occupancy: 1100, available: 1900, occupancyRate: 36.6, status: 'AVAILABLE' },
];

export const evacuationProgressData = [
  { segment: 'Village A Priority (P1)', target: 680, evacuated: 510, inTransit: 170, remaining: 0 },
  { segment: 'Village B Priority (P1)', target: 890, evacuated: 480, inTransit: 220, remaining: 190 },
  { segment: 'Village F Sector (P1)', target: 2000, evacuated: 920, inTransit: 340, remaining: 740 },
  { segment: 'Village C Polder (P2)', target: 420, evacuated: 310, inTransit: 60, remaining: 50 },
];
