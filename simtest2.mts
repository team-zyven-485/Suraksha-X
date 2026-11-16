import 'dotenv/config';
import { generateSimParams } from './server/gemini';
import { validateParams, defaultParams } from './src/shared/hazardSim';
const origin = { lat: 26.185, lng: 91.735 };
for (const hazard of ['FLOOD','CYCLONE','FIRE','EARTHQUAKE'] as const) {
  const t0 = Date.now();
  const g = await generateSimParams({ hazard, severity: 'SEVERE', origin, context: ['Sample region: River Basin District, Assam'] });
  const p = validateParams(g?.raw, hazard, 'SEVERE', origin);
  const d = defaultParams(hazard, 'SEVERE', origin);
  const fromModel = g ? Object.keys(g.raw as any).length : 0;
  console.log(`${hazard.padEnd(10)} ${g ? g.model : 'rule-based'.padEnd(10)} ${String(Date.now()-t0).padStart(6)}ms | keys ${fromModel} | L ${p.lengthKm} (default ${d.lengthKm}) | markers ${p.markers.length} | ${p.markers.map(m=>m.emoji).join('')}`);
  console.log('    ', p.headline, '|', p.assumptions[0]);
}
