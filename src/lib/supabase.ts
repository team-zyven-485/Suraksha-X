import { SupabaseClient } from '@supabase/supabase-js';
import { RelocationPlan, RiskZone, SystemAlert } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

// Re-exported for backward compatibility with existing call sites.
export function getSupabase(): SupabaseClient | null {
  return getSupabaseClient();
}

export function isSupabaseConnected(): boolean {
  return isSupabaseConfigured();
}

/**
 * Persistence helper to save relocation plan to Supabase or local storage fallback
 */
export async function persistRelocationPlan(plan: RelocationPlan): Promise<{ success: boolean; source: 'supabase' | 'local' }> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { error } = await supabase
        .from('relocation_plans')
        .upsert({
          id: plan.id,
          zone_id: plan.zoneId,
          zone_name: plan.zoneName,
          total_population: plan.totalPopulation,
          vulnerable_population: plan.vulnerablePopulation,
          shelter_id: plan.recommendedShelter.id,
          shelter_name: plan.recommendedShelter.name,
          route_id: plan.primaryRoute.id,
          route_name: plan.primaryRoute.destinationName,
          status: plan.status,
          checklist: plan.checklist,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (!error) {
        console.log('[Supabase] Successfully persisted relocation plan:', plan.id);
        return { success: true, source: 'supabase' };
      }
      console.warn('[Supabase] Error saving plan, falling back to local storage:', error);
    } catch (e) {
      console.warn('[Supabase] Error saving plan:', e);
    }
  }

  // Local fallback
  try {
    const existing = JSON.parse(localStorage.getItem('suraksha_relocation_plans') || '[]');
    const filtered = existing.filter((p: any) => p.id !== plan.id);
    filtered.unshift(plan);
    localStorage.setItem('suraksha_relocation_plans', JSON.stringify(filtered.slice(0, 20)));
    return { success: true, source: 'local' };
  } catch {
    return { success: false, source: 'local' };
  }
}

/**
 * Persistence helper to log CAP emergency broadcasts
 */
export async function persistCapBroadcast(payload: {
  identifier: string;
  sender: string;
  sent: string;
  status: string;
  msgType: string;
  headline: string;
  description: string;
  areaDesc: string;
  channels: string[];
}): Promise<{ success: boolean; source: 'supabase' | 'local' }> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { error } = await supabase
        .from('cap_broadcasts')
        .insert({
          identifier: payload.identifier,
          sender: payload.sender,
          sent_at: payload.sent,
          status: payload.status,
          message_type: payload.msgType,
          headline: payload.headline,
          description: payload.description,
          area_desc: payload.areaDesc,
          channels: payload.channels,
        });

      if (!error) {
        console.log('[Supabase] CAP Broadcast logged:', payload.identifier);
        return { success: true, source: 'supabase' };
      }
    } catch (e) {
      console.warn('[Supabase] Error saving CAP broadcast:', e);
    }
  }

  // Local fallback
  try {
    const broadcasts = JSON.parse(localStorage.getItem('suraksha_cap_broadcasts') || '[]');
    broadcasts.unshift(payload);
    localStorage.setItem('suraksha_cap_broadcasts', JSON.stringify(broadcasts.slice(0, 50)));
    return { success: true, source: 'local' };
  } catch {
    return { success: false, source: 'local' };
  }
}
