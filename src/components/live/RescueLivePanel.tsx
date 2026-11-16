import React, { useState } from 'react';
import { Navigation, Satellite, PlayCircle, StopCircle, AlertCircle, Clock, Route as RouteIcon } from 'lucide-react';
import type { RescueTeam, SOSIncident } from '../../types/sos';
import { LiveTeamMap } from './LiveTeamMap';
import { useDemoDrive, useLiveRoute, useShareLocation } from '../../lib/liveTracking';

type Mode = 'off' | 'gps' | 'demo';

/**
 * Rescue-team view of an active assignment: share live GPS (or run the
 * clearly-labelled demo drive), see the real road route and turn-by-turn
 * directions to the victim, and watch ETA update as you move.
 */
export const RescueLivePanel: React.FC<{ team: RescueTeam; incident: SOSIncident }> = ({ team, incident }) => {
  const [mode, setMode] = useState<Mode>('off');
  const victim = incident.coordinates;

  const share = useShareLocation(team.id, mode === 'gps');
  const drive = useDemoDrive(team.id, victim, team.baseDistanceKm, mode === 'demo');

  const own = share.position ?? drive.position;
  const pos = own ?? (team.location ? { lat: team.location.lat, lng: team.location.lng } : null);
  const { route, status, remainingKm, etaMin } = useLiveRoute(pos, victim);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setMode(mode === 'gps' ? 'off' : 'gps')}
          className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 border ${
            mode === 'gps' ? 'bg-safe text-white border-safe' : 'bg-surface text-ink border-hairline hover:border-brand/40'
          }`}
        >
          <Satellite className="w-3.5 h-3.5" /> {mode === 'gps' ? 'Sharing live GPS — tap to stop' : 'Share my live location'}
        </button>
        <button
          onClick={() => setMode(mode === 'demo' ? 'off' : 'demo')}
          className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 border ${
            mode === 'demo' ? 'bg-warn text-white border-warn' : 'bg-surface text-ink border-hairline hover:border-warn/40'
          }`}
        >
          {mode === 'demo' ? <StopCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
          {mode === 'demo' ? 'Stop demo drive' : 'Demo drive (simulated GPS)'}
        </button>
      </div>

      {mode === 'gps' && share.state === 'starting' && <div className="text-[11px] font-mono text-ink-faint">Waiting for your device's location…</div>}
      {mode === 'gps' && share.error && (
        <div className="p-2.5 rounded-lg bg-warn-soft border border-warn/30 text-[11px] text-warn flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {share.error}
        </div>
      )}
      {mode === 'demo' && (
        <div className="p-2.5 rounded-lg bg-warn-soft border border-warn/30 text-[11px] font-mono text-warn">
          DEMO — {drive.state === 'planning' ? 'planning a real road route…' : drive.state === 'arrived' ? 'arrived. This was a simulated drive.' : 'a simulated team is driving a real road route to the victim (~50 s). Admin and the citizen see it labelled as simulated.'}
        </div>
      )}

      {pos && (
        <div className="grid grid-cols-2 gap-2 text-center font-mono">
          <div className="p-2 rounded-lg bg-brand-soft border border-brand/30">
            <div className="text-[10px] text-brand flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> ETA</div>
            <div className="text-lg font-bold text-ink">{etaMin === null ? '…' : etaMin === 0 ? 'Arriving' : `${etaMin} min`}</div>
          </div>
          <div className="p-2 rounded-lg bg-inset border border-hairline">
            <div className="text-[10px] text-ink-faint flex items-center justify-center gap-1"><RouteIcon className="w-3 h-3" /> BY ROAD</div>
            <div className="text-lg font-bold text-ink">{remainingKm === null ? '…' : `${remainingKm.toFixed(1)} km`}</div>
          </div>
        </div>
      )}

      <LiveTeamMap victim={victim} team={pos} route={route?.coordinates ?? null} teamLabel={`${team.name} (you)`} heightClass="h-72" />

      {!pos && (
        <div className="text-[11px] font-mono text-ink-faint flex items-center gap-1.5">
          <Navigation className="w-3 h-3" /> Turn on live location (or the demo drive) to get the road route and ETA to the victim.
        </div>
      )}
      {pos && status === 'unavailable' && !route && (
        <div className="text-[11px] font-mono text-warn">Road routing is unavailable right now (offline or service down).</div>
      )}

      {route && route.steps.length > 0 && (
        <details className="p-3 rounded-lg bg-surface border border-hairline text-xs font-mono">
          <summary className="cursor-pointer text-ink-soft uppercase text-[10px] font-semibold">
            Directions ({route.steps.length} steps, from route start)
          </summary>
          <ol className="mt-2 space-y-1">
            {route.steps.map((s, i) => (
              <li key={i} className="flex justify-between gap-2 text-ink-soft">
                <span>{i + 1}. {s.instruction}</span>
                <span className="text-ink-faint shrink-0">{s.distanceM >= 1000 ? `${(s.distanceM / 1000).toFixed(1)} km` : `${s.distanceM} m`}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      <div className="text-[10px] font-mono text-ink-faint">
        Routes come from OpenStreetMap. They do not know about floods, landslides or blocked roads — confirm with Rescue Control.
      </div>
    </div>
  );
};
