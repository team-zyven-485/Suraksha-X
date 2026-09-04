export type { ScenarioData, ScenarioMeta, DisasterType, DemographicSummary, AnalyticsData } from './types';

import { ScenarioData } from './types';
import { floodScenario } from './flood';
import { earthquakeScenario } from './earthquake';
import { cycloneScenario } from './cyclone';
import { landslideScenario } from './landslide';
import { tsunamiScenario } from './tsunami';

export const scenarios: Record<string, ScenarioData> = {
  'flood-assam': floodScenario,
  'earthquake-gujarat': earthquakeScenario,
  'cyclone-odisha': cycloneScenario,
  'landslide-uttarakhand': landslideScenario,
  'tsunami-tamilnadu': tsunamiScenario,
};

export const scenarioList = Object.values(scenarios).map((s) => s.meta);

export const DEFAULT_SCENARIO_ID = 'flood-assam';

export function getScenario(id: string): ScenarioData {
  return scenarios[id] || scenarios[DEFAULT_SCENARIO_ID];
}
