import React from 'react';
import { ShieldAlert, MapPin, Building2, Navigation, TriangleAlert } from 'lucide-react';
import { useDisaster } from '../../context/DisasterContext';
import { CitizenLocationState, CitizenView } from './CitizenApp';

interface Props {
  location: CitizenLocationState;
  onNavigate: (view: CitizenView) => void;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const CitizenHome: React.FC<Props> = ({ location, onNavigate }) => {
  const { riskZones, reliefCentres, selectedRoute, scenarioMeta } = useDisaster();

  const worstZone = [...riskZones].sort((a, b) => b.riskScore - a.riskScore)[0];
  // Once we actually know where the citizen is, show THEIR nearest zone's
  // risk, not just the district's single worst-case zone — showing a
  // specific "Risk: CRITICAL" figure next to "Your Location: Not detected"
  // would falsely imply a personalized assessment we haven't made.
  const nearestZone = location.coords
    ? [...riskZones].sort(
        (a, b) => haversineKm(a.coordinates, location.coords!) - haversineKm(b.coordinates, location.coords!)
      )[0]
    : null;
  const displayZone = nearestZone || worstZone;
  const recommendedShelter = [...reliefCentres].sort((a, b) => {
    const aScore = a.safetyScore * 0.4 + (a.available > 0 ? 30 : 0) + (1 / (a.distanceKm || 10)) * 30;
    const bScore = b.safetyScore * 0.4 + (b.available > 0 ? 30 : 0) + (1 / (b.distanceKm || 10)) * 30;
    return bScore - aScore;
  })[0];

  const riskColor =
    displayZone?.riskLevel === 'CRITICAL'
      ? 'text-critical border-critical/30 bg-critical-soft'
      : displayZone?.riskLevel === 'HIGH'
      ? 'text-warn border-warn/30 bg-warn-soft'
      : 'text-warn border-warn/30 bg-warn-soft';

  return (
    <div className="space-y-4">
      {/* Current status card */}
      <div className={`p-4 rounded-xl border-2 space-y-3 ${riskColor}`}>
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-mono uppercase tracking-wider opacity-80">
            {nearestZone ? 'Your Status' : 'District Overview'}
          </div>
          {!nearestZone && (
            <button
              onClick={() => onNavigate('locate')}
              className="text-[10px] font-mono underline opacity-90 hover:opacity-100"
            >
              Detect my location →
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          <div>
            <div className="opacity-70">{nearestZone ? 'Your Zone' : 'Area'}</div>
            <div className="text-sm font-bold text-ink mt-0.5">{nearestZone ? nearestZone.name : scenarioMeta.region}</div>
          </div>
          <div>
            <div className="opacity-70">Hazard</div>
            <div className="text-sm font-bold text-ink mt-0.5">{scenarioMeta.disasterType.replace('_', ' ')}</div>
          </div>
          <div>
            <div className="opacity-70">{nearestZone ? 'Your Risk' : "District's Highest Risk Zone"}</div>
            <div className="text-sm font-bold mt-0.5">{displayZone?.riskLevel || 'MONITORING'} ({displayZone?.riskScore ?? '—'})</div>
          </div>
          <div>
            <div className="opacity-70">Your Location</div>
            <div className="text-sm font-bold text-ink mt-0.5 flex items-center gap-1">
              {location.coords ? (
                <>
                  <MapPin className="w-3 h-3" /> Detected {location.isDemo && '(Demo)'}
                </>
              ) : (
                'Not detected'
              )}
            </div>
          </div>
        </div>

        {!nearestZone && (
          <p className="text-[10px] font-mono opacity-70 leading-relaxed border-t border-current/20 pt-2">
            Showing the district's highest-risk zone since your location hasn't been detected yet — this may not reflect the hazard level at your actual position.
          </p>
        )}
      </div>

      {/* Emergency SOS */}
      <button
        id="btn-citizen-sos"
        onClick={() => onNavigate('my-sos')}
        className="w-full py-5 rounded-xl bg-critical hover:bg-critical/90 text-white font-mono font-black text-lg uppercase tracking-wider shadow-sm flex flex-col items-center justify-center gap-1.5 transition-colors border-2 border-critical/30"
      >
        <ShieldAlert className="w-7 h-7" />
        <span>Emergency SOS</span>
      </button>
      <p className="text-[11px] text-ink-soft text-center -mt-2 leading-relaxed">
        If you're unable to evacuate, tap above — your location goes straight to Rescue Control for faster support.
      </p>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigate('centres')}
          className="p-4 rounded-xl bg-surface border border-hairline hover:border-brand/30 flex flex-col items-center gap-2 text-xs font-mono text-ink transition-colors"
        >
          <Building2 className="w-5 h-5 text-brand" />
          <span>Find Safe Centre</span>
        </button>
        <button
          onClick={() => onNavigate('route')}
          className="p-4 rounded-xl bg-surface border border-hairline hover:border-safe/30 flex flex-col items-center gap-2 text-xs font-mono text-ink transition-colors"
        >
          <Navigation className="w-5 h-5 text-safe" />
          <span>View Evacuation Route</span>
        </button>
      </div>

      {/* Safety recommendation */}
      <div className="p-4 rounded-xl bg-brand-soft border border-brand/30 space-y-1.5">
        <div className="flex items-center gap-1.5 text-brand text-[10px] font-mono uppercase font-semibold">
          <TriangleAlert className="w-3.5 h-3.5" />
          Current Safety Recommendation
        </div>
        <p className="text-xs text-ink leading-relaxed">
          {displayZone?.recommendedAction
            ? `${displayZone.recommendedAction}. `
            : ''}
          Move to <span className="text-ink font-semibold">{recommendedShelter?.name || 'the nearest relief centre'}</span> using the recommended evacuation route
          {selectedRoute ? ` (${selectedRoute.distanceKm} km, ~${selectedRoute.estimatedTimeMin} min)` : ''}.
        </p>
      </div>
    </div>
  );
};
