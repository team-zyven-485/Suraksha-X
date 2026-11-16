import React, { useMemo } from 'react';
import { Radar, ExternalLink } from 'lucide-react';
import { useDisaster } from '../../context/DisasterContext';
import { useNaturalEvents, eventColor } from '../../lib/useNaturalEvents';
import { haversineKm } from '../../shared/sosTriage';

/** Live natural events from NASA EONET, nearest to the active scenario region first. */
export const NaturalEventsCard: React.FC = () => {
  const { riskZones, scenarioMeta } = useDisaster();
  const { events, status } = useNaturalEvents();

  const nearest = useMemo(() => {
    const center = riskZones[0]?.coordinates;
    if (!center) return [];
    return events
      .map((e) => ({ e, km: haversineKm(center, { lat: e.lat, lng: e.lng }) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 5);
  }, [events, riskZones]);

  if (status === 'unavailable') {
    return (
      <div className="p-3 rounded-xl bg-surface border border-hairline text-[11px] font-mono text-ink-faint">
        Live NASA natural-events feed unavailable right now.
      </div>
    );
  }

  return (
    <div className="p-3.5 rounded-xl bg-surface border border-hairline space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-brand font-semibold">
          <Radar className="w-3.5 h-3.5" /> Live natural events — nearest to {scenarioMeta.region}
        </div>
        <span className="text-[9px] font-mono text-ink-faint shrink-0">
          NASA EONET{status === 'ok' ? ` • ${events.length} open worldwide` : ''}
        </span>
      </div>
      {status === 'loading' ? (
        <div className="text-[11px] font-mono text-ink-faint">…</div>
      ) : (
        <div className="space-y-1">
          {nearest.map(({ e, km }) => (
            <div key={e.id} className="flex items-center gap-2 text-[11px] font-mono">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: eventColor(e.categoryId) }} />
              <span className="text-ink truncate flex-1" title={e.title}>
                {e.title}
              </span>
              <span className="text-ink-faint shrink-0 hidden sm:inline">{e.category}</span>
              <span className="text-ink-soft shrink-0 w-20 text-right">{Math.round(km).toLocaleString()} km</span>
              {e.link && (
                <a href={e.link} target="_blank" rel="noopener noreferrer" className="text-brand shrink-0" aria-label="Open event details">
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
