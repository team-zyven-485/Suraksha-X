import React, { useState } from 'react';
import { MapPin, LocateFixed, AlertCircle } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { useDisaster } from '../../context/DisasterContext';
import { CitizenLocationState } from './CitizenApp';

interface Props {
  location: CitizenLocationState;
  setLocation: (loc: CitizenLocationState) => void;
}

export const CitizenLocate: React.FC<Props> = ({ location, setLocation }) => {
  const { riskZones, selectedZone } = useDisaster();
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const demoZone = selectedZone || [...riskZones].sort((a, b) => b.riskScore - a.riskScore)[0];

  const useDemoLocation = () => {
    if (!demoZone) return;
    setLocation({
      coords: { lat: demoZone.coordinates.lat, lng: demoZone.coordinates.lng },
      accuracy: null,
      isDemo: true,
    });
    setError(null);
  };

  const locateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      useDemoLocation();
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
          isDemo: false,
        });
        setIsLocating(false);
        setError(null);
      },
      () => {
        setError('Location permission denied or unavailable. Using demo location instead.');
        setIsLocating(false);
        useDemoLocation();
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold font-mono text-ink">My Location</h2>

      <button
        onClick={locateMe}
        disabled={isLocating}
        className="w-full py-3.5 rounded-xl bg-safe hover:bg-safe/90 disabled:opacity-60 text-white font-mono font-bold text-sm flex items-center justify-center gap-2 transition-colors"
      >
        <LocateFixed className="w-4 h-4" />
        <span>{isLocating ? 'Locating…' : 'Locate Me'}</span>
      </button>

      {error && (
        <div className="p-3 rounded-lg bg-warn-soft border border-warn/30 flex items-start gap-2 text-xs text-warn">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {location.coords ? (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-surface border border-hairline space-y-2 font-mono text-xs">
            <div className="flex items-center gap-1.5 text-safe font-bold uppercase text-[11px]">
              <MapPin className="w-3.5 h-3.5" />
              Location Detected {location.isDemo && <span className="text-warn">(Demo Location)</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <div className="text-ink-faint text-[10px]">LATITUDE</div>
                <div className="text-ink">{location.coords.lat.toFixed(5)}</div>
              </div>
              <div>
                <div className="text-ink-faint text-[10px]">LONGITUDE</div>
                <div className="text-ink">{location.coords.lng.toFixed(5)}</div>
              </div>
              <div>
                <div className="text-ink-faint text-[10px]">ACCURACY</div>
                <div className="text-ink">{location.accuracy ? `±${Math.round(location.accuracy)}m` : '—'}</div>
              </div>
            </div>
          </div>

          <div className="h-64 rounded-xl overflow-hidden border border-hairline">
            <MapContainer center={[location.coords.lat, location.coords.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <CircleMarker
                center={[location.coords.lat, location.coords.lng]}
                radius={10}
                pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.5 }}
              >
                <Popup>Your {location.isDemo ? 'demo' : 'current'} location</Popup>
              </CircleMarker>
            </MapContainer>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-surface border border-hairline text-center text-xs font-mono text-ink-faint">
          Tap "Locate Me" to detect your position, or use a demo location for this scenario.
          <button onClick={useDemoLocation} className="block mx-auto mt-3 text-brand hover:text-brand underline">
            Use Demo Location
          </button>
        </div>
      )}
    </div>
  );
};
