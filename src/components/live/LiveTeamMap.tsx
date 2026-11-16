import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng } from '../../lib/roadRoute';

/** Fit the view when the situation changes (route replaced, team first appears), but not on every GPS tick, so the user can still pan. */
const FitTo: React.FC<{ victim: LatLng; team: LatLng | null; route: [number, number][] | null }> = ({ victim, team, route }) => {
  const map = useMap();
  const hasTeam = !!team;
  useEffect(() => {
    const pts: L.LatLngExpression[] = route && route.length > 1 ? route : [[victim.lat, victim.lng]];
    if (team) pts.push([team.lat, team.lng]);
    pts.push([victim.lat, victim.lng]);
    map.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: 16, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, hasTeam, victim.lat, victim.lng]);
  return null;
};

interface Props {
  victim: LatLng;
  team: LatLng | null;
  route: [number, number][] | null;
  teamLabel?: string;
  heightClass?: string;
}

export const LiveTeamMap: React.FC<Props> = ({ victim, team, route, teamLabel = 'Rescue team', heightClass = 'h-64' }) => (
  <div className={`${heightClass} rounded-xl overflow-hidden border border-hairline`}>
    <MapContainer center={[victim.lat, victim.lng]} zoom={13} style={{ height: '100%', width: '100%' }} preferCanvas>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85 }} />}
      <CircleMarker center={[victim.lat, victim.lng]} radius={10} pathOptions={{ color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 0.95 }}>
        <Popup>SOS location</Popup>
      </CircleMarker>
      {team && (
        <CircleMarker center={[team.lat, team.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}>
          <Popup>{teamLabel}</Popup>
        </CircleMarker>
      )}
      <FitTo victim={victim} team={team} route={route} />
    </MapContainer>
  </div>
);
