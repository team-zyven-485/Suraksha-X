import { useSyncExternalStore } from 'react';
import type { HazardSimParams } from '../shared/hazardSim';

/**
 * The most recent simulation parameters per incident. The simulation panel
 * writes here when it loads (rule-based or Gemini-assisted), and hazard-aware
 * routing reads from it, so the route avoids exactly the footprint the map shows.
 */
const store = new Map<string, HazardSimParams>();
const listeners = new Set<() => void>();

export function setSimParams(incidentId: string, params: HazardSimParams) {
  store.set(incidentId, params);
  listeners.forEach((l) => l());
}

export function useSimParams(incidentId: string): HazardSimParams | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => store.get(incidentId)
  );
}
