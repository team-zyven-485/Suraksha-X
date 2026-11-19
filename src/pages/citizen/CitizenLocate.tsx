import React, { useState } from 'react';
import { MapPin, LocateFixed, AlertCircle } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { useDisaster } from '../../context/DisasterContext';
import { CitizenLocationState } from './CitizenApp';
import { haversineKm } from '../../shared/sosTriage';
import { useI18n } from '../../i18n';

interface Props {
  location: CitizenLocationState;
  setLocation: (loc: CitizenLocationState) => void;
}

export const CitizenLocate: React.FC<Props> = ({ location, setLocation }) => {
  const { riskZones, selectedZone } = useDisaster();
  const { t } = useI18n();
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

  // Never silently swap in a demo location: if the real position can't be
  // read, say exactly why and let the user choose the demo location themselves.
  const locateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError(t('loc.errNoGeo'));
      return;
    }
    if (!window.isSecureContext) {
      setError(t('loc.errInsecure'));
      return;
    }

    setIsLocating(true);
    setError(null);

    const onSuccess = (pos: GeolocationPosition) => {
      setLocation({
        coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        accuracy: pos.coords.accuracy,
        isDemo: false,
      });
      setIsLocating(false);
    };
    const onFail = (err: GeolocationPositionError) => {
      setIsLocating(false);
      setError(
        err.code === err.PERMISSION_DENIED
          ? t('loc.errDenied')
          : err.code === err.TIMEOUT
          ? t('loc.errTimeout')
          : t('loc.errUnavailable')
      );
    };

    // Phones have GPS (high accuracy); most laptops/desktops do not and need
    // the coarser Wi-Fi/network lookup, so fall back to that before giving up.
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) return onFail(err);
        navigator.geolocation.getCurrentPosition(onSuccess, onFail, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 60000,
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // The bundled hazard scenarios cover specific regions. If the real position
  // is far from the active one, say so instead of implying the zone data applies.
  const nearestZoneKm =
    location.coords && !location.isDemo && riskZones.length > 0
      ? Math.min(...riskZones.map((z) => haversineKm(z.coordinates, location.coords!)))
      : null;
  const outsideCoverage = nearestZoneKm !== null && nearestZoneKm > 100;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold font-mono text-ink">{t('loc.title')}</h2>

      <button
        onClick={locateMe}
        disabled={isLocating}
        className="w-full py-3.5 rounded-xl bg-safe hover:bg-safe/90 disabled:opacity-60 text-white font-mono font-bold text-sm flex items-center justify-center gap-2 transition-colors"
      >
        <LocateFixed className="w-4 h-4" />
        <span>{isLocating ? t('loc.locating') : t('loc.locateMe')}</span>
      </button>

      {error && (
        <div className="p-3 rounded-lg bg-warn-soft border border-warn/30 flex items-start gap-2 text-xs text-warn">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {outsideCoverage && (
        <div className="p-3 rounded-lg bg-warn-soft border border-warn/30 flex items-start gap-2 text-xs text-warn">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t('loc.outside', { km: Math.round(nearestZoneKm!) })}</span>
        </div>
      )}

      {location.coords ? (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-surface border border-hairline space-y-2 font-mono text-xs">
            <div className="flex items-center gap-1.5 text-safe font-bold uppercase text-[11px]">
              <MapPin className="w-3.5 h-3.5" />
              {t('loc.detected')} {location.isDemo && <span className="text-warn">{t('loc.demoLocation')}</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <div className="text-ink-faint text-[10px]">{t('loc.latitude')}</div>
                <div className="text-ink">{location.coords.lat.toFixed(5)}</div>
              </div>
              <div>
                <div className="text-ink-faint text-[10px]">{t('loc.longitude')}</div>
                <div className="text-ink">{location.coords.lng.toFixed(5)}</div>
              </div>
              <div>
                <div className="text-ink-faint text-[10px]">{t('loc.accuracy')}</div>
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
                <Popup>{location.isDemo ? t('loc.popupDemo') : t('loc.popupNow')}</Popup>
              </CircleMarker>
            </MapContainer>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-surface border border-hairline text-center text-xs font-mono text-ink-faint">
          {t('loc.prompt')}
          <button onClick={useDemoLocation} className="block mx-auto mt-3 text-brand hover:text-brand underline">
            {t('loc.useDemo')}
          </button>
        </div>
      )}
    </div>
  );
};
