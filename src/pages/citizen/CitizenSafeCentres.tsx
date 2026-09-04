import React from 'react';
import { Building2, MapPin, ShieldCheck, Accessibility } from 'lucide-react';
import { useDisaster } from '../../context/DisasterContext';
import { Badge } from '../../components/common/Badge';
import { CitizenLocationState, CitizenView } from './CitizenApp';
import { ReliefCentre, EvacuationRoute } from '../../types';

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

export const CitizenSafeCentres: React.FC<Props> = ({ location, onNavigate }) => {
  const { reliefCentres, routes, riskZones, selectedZone, setSelectedShelter, setSelectedRoute } = useDisaster();

  const ranked = [...reliefCentres]
    .map((c) => {
      const distanceKm = location.coords ? haversineKm(location.coords, c.coordinates) : c.distanceKm || 10;
      // Composite score: never blindly nearest — weighs safety + availability alongside distance
      const score =
        c.safetyScore * 0.45 +
        (c.available > 0 ? 30 : 0) +
        Math.max(0, 25 - distanceKm) * 1.0;
      return { ...c, computedDistanceKm: distanceKm, score };
    })
    .sort((a, b) => b.score - a.score);

  // Citizens pick any centre, but the scenario's authored evacuation routes
  // only cover a couple of destinations with verified turn-by-turn corridors.
  // When there's no authored route to the chosen centre, synthesize a direct
  // route estimate so "Get Route" always works for the citizen's own choice —
  // clearly labeled as an estimate, not a verified corridor (see
  // CitizenEvacRoute's handling of routes with a "direct-" id).
  const buildRouteToCentre = (centre: ReliefCentre): EvacuationRoute => {
    const authored = routes.find((r) => r.destinationId === centre.id);
    if (authored) return authored;

    const originZone = selectedZone || riskZones[0];
    const origin = location.coords || originZone?.coordinates || centre.coordinates;
    const originName = location.coords ? 'Your Location' : originZone?.name || 'Origin';
    const distanceKm = haversineKm(origin, centre.coordinates);
    const avgSpeedKmh = 25; // conservative evacuation-conditions estimate
    const estimatedTimeMin = Math.max(1, Math.round((distanceKm / avgSpeedKmh) * 60));
    const safetyScore = centre.safetyScore;
    const safetyLevel: EvacuationRoute['safetyLevel'] = safetyScore >= 80 ? 'HIGH' : safetyScore >= 60 ? 'MODERATE' : 'LOW';

    return {
      id: `direct-${centre.id}`,
      originId: location.coords ? 'citizen-location' : originZone?.id || 'unknown',
      originName,
      destinationId: centre.id,
      destinationName: centre.name,
      distanceKm: Math.round(distanceKm * 10) / 10,
      estimatedTimeMin,
      safetyScore,
      safetyLevel,
      blockedRoadsCount: 0,
      elevationClearanceMeters: centre.elevationMeters ?? 0,
      coordinates: [
        [origin.lat, origin.lng],
        [centre.coordinates.lat, centre.coordinates.lng],
      ],
      turnByTurn: [
        {
          step: 1,
          instruction: `Proceed directly toward ${centre.name}. This is a direct-line distance estimate, not a verified road corridor — follow local signage, emergency personnel, and actual road conditions.`,
          distance: `${Math.round(distanceKm * 10) / 10} km`,
          roadCondition: 'CLEAR',
        },
      ],
      isRecommended: false,
    };
  };

  const handleGetRoute = (centre: ReliefCentre) => {
    setSelectedShelter(centre);
    setSelectedRoute(buildRouteToCentre(centre));
    onNavigate('route');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold font-mono text-ink">Nearby Safe Centres</h2>
      <p className="text-xs text-ink-soft">
        Ranked by safety, available capacity, and accessibility — not just distance.
      </p>

      <div className="space-y-3">
        {ranked.map((c, idx) => (
          <div key={c.id} className="p-4 rounded-xl bg-surface border border-hairline space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-ink-faint">#{idx + 1}</span>
                <Building2 className="w-4 h-4 text-safe" />
                <span className="text-sm font-bold text-ink">{c.code}</span>
              </div>
              <Badge variant={c.status === 'AVAILABLE' ? 'safe' : c.status === 'NEAR_CAPACITY' ? 'moderate' : 'critical'} size="sm">
                {c.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="text-xs text-ink-soft">{c.name}</div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="flex items-center gap-1 text-ink-soft">
                <MapPin className="w-3 h-3" /> Distance: <span className="text-ink">{c.computedDistanceKm.toFixed(1)} km</span>
              </div>
              <div className="flex items-center gap-1 text-ink-soft">
                <ShieldCheck className="w-3 h-3" /> Safety: <span className="text-ink">{c.safetyScore}/100</span>
              </div>
              <div className="text-ink-soft">
                Available: <span className={c.available > 0 ? 'text-safe' : 'text-critical'}>{c.available}</span>
              </div>
              <div className="flex items-center gap-1 text-ink-soft">
                <Accessibility className="w-3 h-3" />
                {c.facilities.wheelchairAccessible ? 'Accessible' : 'Limited Access'}
              </div>
            </div>
            <button
              onClick={() => handleGetRoute(c)}
              disabled={c.available === 0}
              title={c.available === 0 ? 'This centre has no available capacity right now' : undefined}
              className="w-full mt-1 py-2 rounded-lg bg-brand-soft hover:bg-brand-soft disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-soft border border-brand/30 text-brand text-xs font-mono font-semibold transition-colors"
            >
              {c.available === 0 ? 'Full — No Capacity' : 'Get Route'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
