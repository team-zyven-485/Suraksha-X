import { RelocationPlan } from '../types';
import { api } from './api';

export type PersistSource = 'server' | 'local';

function saveLocal(key: string, item: unknown, idField: string, max: number): boolean {
  try {
    const existing: any[] = JSON.parse(localStorage.getItem(key) || '[]');
    const filtered = existing.filter((p) => p?.[idField] !== (item as any)[idField]);
    filtered.unshift(item);
    localStorage.setItem(key, JSON.stringify(filtered.slice(0, max)));
    return true;
  } catch {
    return false;
  }
}

/** Save a relocation plan to the server (MongoDB); fall back to this device if unreachable. */
export async function persistRelocationPlan(plan: RelocationPlan): Promise<{ success: boolean; source: PersistSource }> {
  try {
    await api('/plans', { method: 'POST', json: plan });
    return { success: true, source: 'server' };
  } catch (err) {
    console.warn('[Persist] Server save failed, keeping a local copy:', (err as Error).message);
  }
  return { success: saveLocal('suraksha_relocation_plans', plan, 'id', 20), source: 'local' };
}

export interface CapBroadcastRecord {
  identifier: string;
  sender: string;
  sent: string;
  status: string;
  msgType: string;
  headline: string;
  description: string;
  areaDesc: string;
  channels: string[];
}

/** Log a CAP emergency broadcast to the server; fall back to this device if unreachable. */
export async function persistCapBroadcast(payload: CapBroadcastRecord): Promise<{ success: boolean; source: PersistSource }> {
  try {
    await api('/cap-broadcasts', { method: 'POST', json: payload });
    return { success: true, source: 'server' };
  } catch (err) {
    console.warn('[Persist] Server save failed, keeping a local copy:', (err as Error).message);
  }
  return { success: saveLocal('suraksha_cap_broadcasts', payload, 'identifier', 50), source: 'local' };
}
