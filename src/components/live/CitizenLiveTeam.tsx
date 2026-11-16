import React from 'react';
import { Navigation, Clock, Route as RouteIcon, WifiOff } from 'lucide-react';
import type { RescueTeam, SOSIncident } from '../../types/sos';
import { useI18n } from '../../i18n';
import { LiveTeamMap } from './LiveTeamMap';
import { useLiveRoute, useNow } from '../../lib/liveTracking';

/** What the citizen sees once a team is assigned: the team moving toward them on real roads, with a live ETA. */
export const CitizenLiveTeam: React.FC<{ incident: SOSIncident; team: RescueTeam }> = ({ incident, team }) => {
  const { t } = useI18n();
  const now = useNow();
  const loc = team.location ?? null;
  const victim = incident.coordinates;
  const teamPos = loc ? { lat: loc.lat, lng: loc.lng } : null;
  const { route, remainingKm, etaMin } = useLiveRoute(teamPos, victim);

  const ageS = loc ? Math.max(0, Math.round((now - new Date(loc.updatedAt).getTime()) / 1000)) : null;
  const stale = ageS !== null && ageS > 90;

  return (
    <div className="p-4 rounded-xl bg-surface border border-hairline space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-brand text-[11px] font-mono uppercase font-semibold">
          <Navigation className="w-3.5 h-3.5" /> {t('live.title')}
        </div>
        {loc?.simulated && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-warn-soft border border-warn/30 text-warn">{t('live.simulated')}</span>
        )}
      </div>

      {!loc ? (
        <div className="text-[11px] font-mono text-ink-faint flex items-center gap-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" /> {t('live.waiting')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-center font-mono">
            <div className="p-2 rounded-lg bg-brand-soft border border-brand/30">
              <div className="text-[10px] text-brand flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" /> ETA
              </div>
              <div className="text-lg font-bold text-ink">
                {etaMin === null ? '…' : etaMin === 0 ? t('live.arriving') : t('live.etaMin', { n: etaMin })}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-inset border border-hairline">
              <div className="text-[10px] text-ink-faint flex items-center justify-center gap-1">
                <RouteIcon className="w-3 h-3" /> {t('live.byRoad')}
              </div>
              <div className="text-lg font-bold text-ink">{remainingKm === null ? '…' : `${remainingKm.toFixed(1)} km`}</div>
            </div>
          </div>
          <LiveTeamMap victim={victim} team={teamPos} route={route?.coordinates ?? null} teamLabel={team.name} />
          <div className={`text-[10px] font-mono ${stale ? 'text-warn' : 'text-ink-faint'}`}>
            {stale ? t('live.stale', { s: ageS ?? 0 }) : t('live.updated', { s: ageS ?? 0 })}
          </div>
        </>
      )}
      <div className="text-[10px] font-mono text-ink-faint leading-relaxed">{t('live.routeNote')}</div>
    </div>
  );
};
