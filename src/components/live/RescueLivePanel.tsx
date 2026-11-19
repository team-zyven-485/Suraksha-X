import React, { useMemo, useState } from 'react';
import { Navigation, Satellite, PlayCircle, StopCircle, AlertCircle, Clock, Route as RouteIcon, ShieldCheck } from 'lucide-react';
import type { RescueTeam, SOSIncident } from '../../types/sos';
import { LiveTeamMap } from './LiveTeamMap';
import { useDemoDrive, useLiveRoute, useShareLocation } from '../../lib/liveTracking';
import { useSimParams } from '../../lib/simStore';
import { assessExposure, buildSimulation, severityFromPriority, validateParams } from '../../shared/hazardSim';
import { useDisaster } from '../../context/DisasterContext';
import { haversineKm } from '../../shared/sosTriage';

type Mode = 'off' | 'gps' | 'demo';
type View = 'approach' | 'evac';

/**
 * Rescue-team view of an active assignment: share live GPS (or run the
 * clearly-labelled demo drive), see the real road route and turn-by-turn
 * directions to the victim, and watch ETA update as you move.
 */
export const RescueLivePanel: React.FC<{ team: RescueTeam; incident: SOSIncident }> = ({ team, incident }) => {
  const [mode, setMode] = useState<Mode>('off');
  const [avoid, setAvoid] = useState(true);
  const [view, setView] = useState<View>('approach');
  const { riskZones, reliefCentres } = useDisaster();
  const victim = incident.coordinates;

  // The simulated hazard footprint: the one the simulation panel shows if it has been
  // opened (possibly Gemini-assisted), otherwise the rule-based sketch for this incident.
  const shared = useSimParams(incident.id);
  const footprint = useMemo(() => {
    const params = shared ?? validateParams({}, incident.disasterType, severityFromPriority(incident.priority), victim);
    return buildSimulation(params, victim, 1); // full extent: plan for the worst case
  }, [shared, incident.disasterType, incident.priority, victim.lat, victim.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const hazard = avoid ? footprint : null;

  // Evacuation leg: the nearest sample shelter that has beds and lies OUTSIDE the simulated
  // footprint (only meaningful while the incident is inside the bundled sample coverage).
  const shelter = useMemo(() => {
    if (riskZones.length === 0 || Math.min(...riskZones.map((z) => haversineKm(z.coordinates, victim))) > 100) return null;
    const out = assessExposure(footprint, victim, riskZones, reliefCentres).sheltersOutside[0];
    const centre = out ? reliefCentres.find((c) => c.id === out.id) : null;
    return centre ? { lat: centre.coordinates.lat, lng: centre.coordinates.lng, label: `${centre.code} ${centre.name}` } : null;
  }, [footprint, riskZones, reliefCentres, victim.lat, victim.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const evac = useLiveRoute(shelter ? victim : null, shelter, hazard);

  const share = useShareLocation(team.id, mode === 'gps');
  const drive = useDemoDrive(team.id, victim, team.baseDistanceKm, mode === 'demo', hazard);

  const own = share.position ?? drive.position;
  const pos = own ?? (team.location ? { lat: team.location.lat, lng: team.location.lng } : null);
  const approach = useLiveRoute(pos, victim, hazard);
  const { status, remainingKm, etaMin } = approach;
  const showing = view === 'evac' && shelter ? evac : approach;
  const route = showing.route; // directions follow whichever leg is shown
  const choice = showing.choice;
  const chosen = choice ? choice.entries[choice.chosenIndex] : null;
  const fastest = choice ? choice.entries[choice.fastestIndex] : null;

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

      <label className="flex items-center gap-2 text-[11px] font-mono text-ink-soft cursor-pointer">
        <input type="checkbox" checked={avoid} onChange={(e) => setAvoid(e.target.checked)} />
        <ShieldCheck className="w-3.5 h-3.5 text-brand" /> Avoid the simulated hazard zone when choosing the route
      </label>

      {shelter && (
        <div className="flex items-center gap-1.5 text-[11px] font-mono">
          <span className="text-ink-faint uppercase">Show</span>
          {([['approach', 'Approach to victim'], ['evac', `Evacuation to ${shelter.label.split(' ')[0]}`]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 py-1 rounded border ${view === v ? 'bg-brand text-white border-brand font-bold' : 'text-ink-soft border-hairline hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <LiveTeamMap
        victim={victim}
        team={pos}
        route={showing.route?.coordinates ?? null}
        destination={view === 'evac' ? shelter : null}
        teamLabel={`${team.name} (you)`}
        heightClass="h-72"
        hazardLayers={avoid ? footprint.layers : undefined}
        altRoute={choice?.avoided ? fastest?.route.coordinates : null}
      />

      {avoid && choice && chosen && fastest && (
        <div
          className={`p-2.5 rounded-lg border text-[11px] font-mono space-y-1 ${
            choice.avoided ? 'bg-safe-soft border-safe/30 text-safe' : chosen.exposure.kmInside > 0 ? 'bg-warn-soft border-warn/30 text-warn' : 'bg-inset border-hairline text-ink-soft'
          }`}
        >
          {choice.avoided ? (
            <>
              <div className="font-bold">
                ✅ Hazard-aware route chosen{choice.extraMinutes > 0 ? ` (+${choice.extraMinutes} min)` : ''}:{' '}
                {choice.severeKmSaved > 0
                  ? `${choice.severeKmSaved} km less in the most severe part of the simulated zone`
                  : choice.kmInsideSaved > 0
                  ? `${choice.kmInsideSaved} km less inside the simulated zone`
                  : 'lower overall exposure to the simulated zone'}
              </div>
              <div>
                Chosen: {chosen.route.durationMin} min — severe {chosen.exposure.kmSevere} · moderate {chosen.exposure.kmModerate} · watch {chosen.exposure.kmWatch} km
              </div>
              <div>
                Fastest (red dashed): {fastest.route.durationMin} min — severe {fastest.exposure.kmSevere} · moderate {fastest.exposure.kmModerate} · watch {fastest.exposure.kmWatch} km
              </div>
            </>
          ) : chosen.exposure.kmInside > 0 ? (
            <div>
              ⚠️ No better road alternative: this route runs {chosen.exposure.kmInside} km inside the simulated zone
              ({chosen.exposure.kmSevere} km in the most severe part)
              {choice.entries.length === 1 ? ' — only one road route exists.' : ' — the alternatives are too long to be worth it.'}
            </div>
          ) : (
            <div>Route stays outside the simulated footprint.</div>
          )}
          <div className="text-ink-faint">Based on a simulation, not real hazard data: a planning aid only.</div>
        </div>
      )}

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
