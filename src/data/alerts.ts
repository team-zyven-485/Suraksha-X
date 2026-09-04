import { SystemAlert } from '../types';

export const mockAlerts: SystemAlert[] = [
  {
    id: 'alt-01',
    title: 'CRITICAL: Embankment Breach Alert — Village A',
    message: 'Water inflow rate surged to 420 m³/s at River Basin Sector 1. Immediate relocation of 680 vulnerable residents advised.',
    severity: 'CRITICAL',
    timestamp: '19:32:14',
    zoneId: 'zone-village-a',
    read: false,
  },
  {
    id: 'alt-02',
    title: 'ROAD CLOSURE: NH-12 Causeway Bridge Submerged',
    message: 'Water level +1.8m over bridge deck. Route blocked. Automatic rerouting via Route B / Junction C active.',
    severity: 'WARNING',
    timestamp: '19:15:00',
    read: false,
  },
  {
    id: 'alt-03',
    title: 'SHELTER UPDATE: Relief Centre #03 Prepared',
    message: 'Medical post established, 45,000L clean water on site, 680 beds reserved for P1 Village A priority transfer.',
    severity: 'INFO',
    timestamp: '19:10:22',
    read: true,
  },
  {
    id: 'alt-04',
    title: 'WEATHER TELEMETRY: Heavy Inflow Forecast',
    message: 'Doppler radar indicates additional 85mm precipitation upstream within the next 3 hours.',
    severity: 'WARNING',
    timestamp: '18:55:00',
    read: true,
  },
];
