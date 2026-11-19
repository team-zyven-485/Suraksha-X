import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, CircleMarker, Popup } from 'react-leaflet';
import { useFitBounds } from '../../lib/useFitBounds';
import L from 'leaflet';
import type { LatLng } from '../../lib/roadRoute';
import type { SimLayer } from '../../shared/hazardSim';

/** Fit the view when the situation changes (route replaced, team first appears), but not on every GPS tick, so the user can still pan. */
const FitTo: React.FC<{ victim: LatLng; team: LatLng | null; route: [number, number][] | null }> = ({ victim, team, route }) => {
  const hasTeam = !!team;
  useFitBounds(
    () => {
      const pts: L.LatLngExpression[] = route && route.length > 1 ? route : [[victim.lat, victim.lng]];
      if (team) pts.push([team.lat, team.lng]);
      pts.push([victim.lat, victim.lng]);
      return L.latLngBounds(pts);
    },
    { padding: [32, 32], maxZoom: 16, animate: false },
    [route, hasTeam, victim.lat, victim.lng]
  );
  return null;
};

interface Props {
  victim: LatLng;
  team: LatLng | null;
  route: [number, number][] | null;
  teamLabel?: string;
  heightClass?: string;
  /** Simulated hazard zones drawn under the route. */
  hazardLayers?: SimLayer[];
  /** The fastest route, when a different (safer) one was chosen. Drawn dashed. */
  altRoute?: [number, number][] | null;
  /** An optional destination other than the victim (e.g. a relief centre), drawn green. */
  destination?: { lat: number; lng: number; label: string } | null;
}

export const LiveTeamMap: React.FC<Props> = ({ victim, team, route, teamLabel = 'Rescue team', heightClass = 'h-64', hazardLayers, altRoute, destination }) => (
  <div className={`${heightClass} rounded-xl overflow-hidden border border-hairline`}>
    <MapContainer center={[victim.lat, victim.lng]} zoom={13} style={{ height: '100%', width: '100%' }} preferCanvas>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {hazardLayers?.map((l) => (
        <Polygon
          key={l.id}
          positions={l.polygon}
          interactive={false}
          pathOptions={{ color: l.color, weight: 1, fillColor: l.color, fillOpacity: l.fillOpacity }}
        />
      ))}
      {altRoute && altRoute.length > 1 && (
        <Polyline positions={altRoute} interactive={false} pathOptions={{ color: '#dc2626', weight: 3, dashArray: '6 6', opacity: 0.8 }} />
      )}
      {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85 }} />}
      <CircleMarker center={[victim.lat, victim.lng]} radius={10} pathOptions={{ color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 0.95 }}>
        <Popup>SOS location</Popup>
      </CircleMarker>
      {destination && (
        <CircleMarker center={[destination.lat, destination.lng]} radius={10} pathOptions={{ color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }}>
          <Popup>{destination.label}</Popup>
        </CircleMarker>
      )}
      {team && (
        <CircleMarker center={[team.lat, team.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}>
          <Popup>{teamLabel}</Popup>
        </CircleMarker>
      )}
      <FitTo victim={victim} team={team} route={route} />
    </MapContainer>
  </div>
);
