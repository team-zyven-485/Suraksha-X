import { useEffect, useState } from 'react';

export interface NaturalEvent {
  id: string;
  title: string;
  categoryId: string;
  category: string;
  lat: number;
  lng: number;
  date: string | null;
  link: string | null;
}

export type NaturalEventsStatus = 'loading' | 'ok' | 'unavailable';

let cache: { at: number; events: NaturalEvent[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

/** Live open natural events from NASA EONET (via our server, which caches them). */
export function useNaturalEvents(): { events: NaturalEvent[]; status: NaturalEventsStatus } {
  const [state, setState] = useState<{ events: NaturalEvent[]; status: NaturalEventsStatus }>(() =>
    cache ? { events: cache.events, status: 'ok' } : { events: [], status: 'loading' }
  );

  useEffect(() => {
    if (cache && Date.now() - cache.at < TTL_MS) return;
    let cancelled = false;
    fetch('/api/events', { signal: AbortSignal.timeout(12_000) })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.available) {
          cache = { at: Date.now(), events: d.events as NaturalEvent[] };
          setState({ events: cache.events, status: 'ok' });
        } else {
          setState({ events: [], status: 'unavailable' });
        }
      })
      .catch(() => !cancelled && setState({ events: [], status: 'unavailable' }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export const EVENT_COLORS: Record<string, string> = {
  wildfires: '#f97316',
  severeStorms: '#a855f7',
  floods: '#3b82f6',
  volcanoes: '#ef4444',
  earthquakes: '#eab308',
  landslides: '#a16207',
  drought: '#d97706',
  dustHaze: '#9ca3af',
  seaLakeIce: '#67e8f9',
  snow: '#e5e7eb',
  tempExtremes: '#f43f5e',
  waterColor: '#14b8a6',
  manmade: '#6b7280',
};
export const eventColor = (categoryId: string) => EVENT_COLORS[categoryId] ?? '#6b7280';
