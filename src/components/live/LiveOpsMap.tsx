import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet';
import { useFitBounds } from '../../lib/useFitBounds';
import L from 'leaflet';
import { Radar } from 'lucide-react';
import { useSOS } from '../../context/SOSContext';
import { useNow } from '../../lib/liveTracking';

const FitAll: React.FC<{ points: [number, number][]; signature: string }> = ({ points, signature }) => {
  // Re-fit only when the set of markers changes, not on every GPS tick.
  useFitBounds(() => (points.length ? L.latLngBounds(points) : null), { padding: [40, 40], maxZoom: 14, animate: false }, [signature]);
  return null;
};

/** Admin overview: every open incident and every team that is sharing its position. */
export const LiveOpsMap: React.FC = () => {
  const { incidents, rescueTeams } = useSOS();
  const now = useNow();

  const open = incidents.filter((i) => i.status !== 'RESCUED' && i.status !== 'CLOSED' && i.syncState !== 'QUEUED');
  const teams = rescueTeams.filter((t) => t.location);
  if (open.length === 0 && teams.length === 0) return null;

  const points: [number, number][] = [
    ...open.map((i) => [i.coordinates.lat, i.coordinates.lng] as [number, number]),
    ...teams.map((t) => [t.location!.lat, t.location!.lng] as [number, number]),
  ];
  const signature = `${open.map((i) => i.id).join(',')}|${teams.map((t) => t.id).join(',')}`;
  const ageS = (iso: string) => Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));

  return (
    <div className="p-4 rounded-lg bg-surface border border-hairline shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold font-mono text-ink flex items-center gap-2">
          <Radar className="w-4 h-4 text-brand" /> Live Operations Map
        </h3>
        <div className="flex items-center gap-3 text-[10px] font-mono text-ink-soft">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-critical" /> Incident</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand" /> Team (live)</span>
        </div>
      </div>
      <div className="h-80 rounded-lg overflow-hidden border border-hairline">
        <MapContainer center={points[0]} zoom={11} style={{ height: '100%', width: '100%' }} preferCanvas>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {teams.map((t) => {
            const inc = open.find((i) => i.id === t.activeIncidentId);
            return inc ? (
              <Polyline
                key={`line-${t.id}`}
                positions={[[t.location!.lat, t.location!.lng], [inc.coordinates.lat, inc.coordinates.lng]]}
                pathOptions={{ color: '#2563eb', weight: 2, dashArray: '6 6', opacity: 0.7 }}
              />
            ) : null;
          })}
          {open.map((i) => (
            <CircleMarker
              key={i.id}
              center={[i.coordinates.lat, i.coordinates.lng]}
              radius={9}
              pathOptions={{ color: '#fff', weight: 2, fillColor: i.priority === 'P1' ? '#ef4444' : '#f59e0b', fillOpacity: 0.95 }}
            >
              <Popup>
                <div className="text-xs space-y-0.5">
                  <div className="font-bold">{i.id}</div>
                  <div>{i.hazard} — {i.priority}</div>
                  <div>{i.status.replace('_', ' ')}</div>
                  <div>{i.location}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
          {teams.map((t) => (
            <CircleMarker
              key={t.id}
              center={[t.location!.lat, t.location!.lng]}
              radius={8}
              pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}
            >
              <Popup>
                <div className="text-xs space-y-0.5">
                  <div className="font-bold">{t.name}</div>
                  <div>{t.status}</div>
                  <div>
                    {t.location!.simulated ? 'Simulated GPS (demo drive)' : 'Live GPS'} — {ageS(t.location!.updatedAt)} s ago
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
          <FitAll points={points} signature={signature} />
        </MapContainer>
      </div>
      <div className="text-[10px] font-mono text-ink-faint">Dashed line = straight-line link between a dispatched team and its incident. Positions update about every 4 s.</div>
    </div>
  );
};
