import React from 'react';
import { Navigation, MapPin, CheckCircle2, AlertTriangle, Clock, Satellite } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet';
import { useDisaster } from '../../context/DisasterContext';
import { useSatellite } from '../../context/SatelliteContext';
import { Badge } from '../../components/common/Badge';
import { CitizenLocationState } from './CitizenApp';

interface Props {
  location: CitizenLocationState;
}

export const CitizenEvacRoute: React.FC<Props> = ({ location }) => {
  const { routes, selectedRoute, blockedRoads, selectedZone, selectedShelter } = useDisaster();
  const { hazard, getRouteEvaluation, routeRecommendation } = useSatellite();

  const candidateRoute = selectedRoute || routes.find((r) => r.isRecommended) || routes[0];
  // Never present a satellite-rejected (BLOCKED) route as the one to take —
  // prefer the satellite-recommended safe alternative at render time.
  const candidateEval = candidateRoute ? getRouteEvaluation(candidateRoute.id) : undefined;
  const satelliteSafeRoute = routeRecommendation?.recommended_route_id
    ? routes.find((r) => r.id === routeRecommendation.recommended_route_id)
    : null;
  const activeRoute = candidateEval?.rejected && satelliteSafeRoute ? satelliteSafeRoute : candidateRoute;
  const alternativeRoute = routes.find((r) => r.id !== activeRoute?.id);
  const isDirectEstimate = activeRoute?.id.startsWith('direct-');

  if (!activeRoute) {
    return <div className="text-xs font-mono text-ink-faint">No evacuation route available for this scenario yet.</div>;
  }

  // Track the route's actual safety level instead of always showing green —
  // a MODERATE or LOW safety route looked identical to a HIGH safety one.
  const safetyColors =
    activeRoute.safetyLevel === 'HIGH'
      ? { bg: 'bg-safe-soft', border: 'border-safe/30', text: 'text-safe' }
      : activeRoute.safetyLevel === 'MODERATE'
      ? { bg: 'bg-warn-soft', border: 'border-warn/30', text: 'text-warn' }
      : { bg: 'bg-critical-soft', border: 'border-critical/30', text: 'text-critical' };

  // Always show a citizen marker on the map, even before the citizen has
  // visited the Location tab — fall back to the route's own origin point,
  // clearly labeled as approximate rather than a real GPS fix.
  const citizenMarker = location.coords || {
    lat: activeRoute.coordinates[0]?.[0] ?? selectedZone?.coordinates.lat ?? 0,
    lng: activeRoute.coordinates[0]?.[1] ?? selectedZone?.coordinates.lng ?? 0,
  };
  const mapCenter = citizenMarker;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold font-mono text-ink">Safe Evacuation Route</h2>

      <div className="flex items-center gap-2 text-xs font-mono text-ink-soft">
        <MapPin className="w-3.5 h-3.5 text-critical" /> {activeRoute.originName}
        <Navigation className="w-3 h-3 text-ink-faint" />
        <CheckCircle2 className="w-3.5 h-3.5 text-safe" /> {activeRoute.destinationName}
      </div>

      {(() => {
        const routeEval = getRouteEvaluation(activeRoute.id);
        if (!routeEval) return null;
        const safe = routeEval.risk_status === 'SAFE';
        return (
          <div className={`p-2.5 rounded-lg border flex items-center gap-2 text-[11px] font-mono ${
            safe ? 'bg-safe-soft border-safe/30 text-safe' : 'bg-warn-soft border-warn/30 text-warn'
          }`}>
            <Satellite className="w-3.5 h-3.5 shrink-0" />
            <span>
              {safe
                ? 'Satellite-confirmed safe corridor'
                : 'This is the safest route based on updated satellite hazard information.'}
              {hazard?.data_mode === 'DEMO' && ' (Demo Data)'}
            </span>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-surface border border-hairline text-center">
          <div className="text-[10px] text-ink-faint font-mono">DISTANCE</div>
          <div className="text-lg font-bold text-ink font-mono">{activeRoute.distanceKm} km</div>
        </div>
        <div className="p-3 rounded-lg bg-surface border border-hairline text-center">
          <div className="text-[10px] text-ink-faint font-mono flex items-center justify-center gap-1"><Clock className="w-3 h-3" />TIME</div>
          <div className="text-lg font-bold text-ink font-mono">{activeRoute.estimatedTimeMin} min</div>
        </div>
        <div className={`p-3 rounded-lg ${safetyColors.bg} border ${safetyColors.border} text-center`}>
          <div className={`text-[10px] ${safetyColors.text} font-mono`}>ROUTE SAFETY</div>
          <div className={`text-lg font-bold ${safetyColors.text} font-mono`}>{activeRoute.safetyLevel}</div>
        </div>
        <div className="p-3 rounded-lg bg-critical-soft border border-critical/30 text-center">
          <div className="text-[10px] text-critical font-mono">BLOCKED ROADS</div>
          <div className="text-lg font-bold text-critical font-mono">{activeRoute.blockedRoadsCount}</div>
        </div>
      </div>

      {blockedRoads.length > 0 && (
        <div className="p-3 rounded-lg bg-critical-soft border border-critical/30 space-y-1.5">
          <div className="flex items-center gap-1.5 text-critical text-[11px] font-mono font-bold">
            <AlertTriangle className="w-3.5 h-3.5" /> ROAD BLOCKED
          </div>
          {blockedRoads.slice(0, 2).map((b) => (
            <div key={b.id} className="text-[11px] text-ink-soft">{b.name} — {b.reason}</div>
          ))}
          {alternativeRoute && (
            <div className="text-[11px] text-safe pt-1">
              Alternative route available: {alternativeRoute.distanceKm} km, {alternativeRoute.estimatedTimeMin} min, Safety {alternativeRoute.safetyScore}%.
            </div>
          )}
        </div>
      )}

      <div className="h-64 rounded-xl overflow-hidden border border-hairline">
        <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline
            positions={activeRoute.coordinates}
            pathOptions={{ color: '#10b981', weight: 4, dashArray: isDirectEstimate ? '6, 6' : undefined }}
          />
          <CircleMarker
            center={[citizenMarker.lat, citizenMarker.lng]}
            radius={8}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.6 }}
          >
            <Popup>{location.coords ? (location.isDemo ? 'Your location (demo)' : 'You are here') : 'Approximate location — visit Location tab for GPS'}</Popup>
          </CircleMarker>
        </MapContainer>
      </div>

      {isDirectEstimate && (
        <div className="p-2.5 rounded-lg bg-surface border border-hairline text-[11px] font-mono text-ink-soft">
          Direct-line distance estimate to {activeRoute.destinationName} — not a verified road corridor. Follow local signage and emergency personnel.
        </div>
      )}

      <div className="space-y-1.5">
        <div className="text-[10px] font-mono text-ink-faint uppercase">Turn-by-Turn</div>
        {activeRoute.turnByTurn.map((step) => (
          <div key={step.step} className="p-2.5 rounded-lg bg-surface border border-hairline text-xs">
            <div className="flex items-center justify-between">
              <span className="text-ink font-semibold">Step {step.step}</span>
              <Badge variant={step.roadCondition === 'CLEAR' ? 'safe' : 'moderate'} size="sm">{step.roadCondition.replace('_', ' ')}</Badge>
            </div>
            <div className="text-ink-soft mt-1">{step.instruction}</div>
            <div className="text-ink-faint text-[10px] mt-0.5">{step.distance}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
