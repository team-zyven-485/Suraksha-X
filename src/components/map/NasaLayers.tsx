import React from 'react';
import { TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Satellite, Radar } from 'lucide-react';
import { NaturalEvent, eventColor } from '../../lib/useNaturalEvents';

export type NasaOverlay = 'none' | 'truecolor' | 'bands721' | 'rain';

// NASA GIBS (Global Imagery Browse Services) — free, no key. Imagery lags by a
// day, so we request yesterday (UTC), which is always published.
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const OVERLAYS: Record<
  Exclude<NasaOverlay, 'none'>,
  { layer: string; set: string; ext: string; maxNative: number; opacity: number; label: string; hint: string }
> = {
  truecolor: {
    layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    set: 'GoogleMapsCompatible_Level9',
    ext: 'jpg',
    maxNative: 9,
    opacity: 0.9,
    label: 'True color',
    hint: 'MODIS Terra daily true-color photo',
  },
  bands721: {
    layer: 'MODIS_Terra_CorrectedReflectance_Bands721',
    set: 'GoogleMapsCompatible_Level9',
    ext: 'jpg',
    maxNative: 9,
    opacity: 0.9,
    label: 'Flood / water',
    hint: 'MODIS bands 7-2-1: open water shows dark blue-black, helping spot flooding',
  },
  rain: {
    layer: 'IMERG_Precipitation_Rate',
    set: 'GoogleMapsCompatible_Level6',
    ext: 'png',
    maxNative: 6,
    opacity: 0.7,
    label: 'Rainfall',
    hint: 'NASA IMERG precipitation rate',
  },
};

function gibsDate(): string {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Rendered INSIDE <MapContainer>. */
export const NasaMapLayers: React.FC<{ overlay: NasaOverlay; showEvents: boolean; events: NaturalEvent[] }> = ({
  overlay,
  showEvents,
  events,
}) => {
  const cfg = overlay !== 'none' ? OVERLAYS[overlay] : null;
  const date = gibsDate();
  return (
    <>
      {cfg && (
        <TileLayer
          key={overlay}
          url={`${GIBS}/${cfg.layer}/default/${date}/${cfg.set}/{z}/{y}/{x}.${cfg.ext}`}
          attribution={`Imagery &copy; NASA GIBS (${date})`}
          maxNativeZoom={cfg.maxNative}
          maxZoom={18}
          opacity={cfg.opacity}
          zIndex={250}
        />
      )}
      {showEvents &&
        events.map((e) => (
          <CircleMarker
            key={e.id}
            center={[e.lat, e.lng]}
            radius={6}
            pathOptions={{ color: '#ffffff', weight: 1, fillColor: eventColor(e.categoryId), fillOpacity: 0.9 }}
          >
            <Popup>
              <div className="text-xs space-y-0.5">
                <div className="font-bold">{e.title}</div>
                <div>{e.category}</div>
                {e.date && <div>{new Date(e.date).toLocaleDateString()}</div>}
                <div className="text-[10px] text-gray-500">NASA EONET</div>
                {e.link && (
                  <a href={e.link} target="_blank" rel="noopener noreferrer" className="underline">
                    Details
                  </a>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
    </>
  );
};

/** Rendered OUTSIDE <MapContainer>, over the map's top-right corner. */
export const NasaMapControls: React.FC<{
  overlay: NasaOverlay;
  setOverlay: (o: NasaOverlay) => void;
  showEvents: boolean;
  setShowEvents: (v: boolean) => void;
  eventCount: number;
  eventsStatus: 'loading' | 'ok' | 'unavailable';
}> = ({ overlay, setOverlay, showEvents, setShowEvents, eventCount, eventsStatus }) => (
  <div className="absolute top-3 right-3 z-[1000] bg-surface border border-hairline rounded-md shadow-2xl p-1.5 space-y-1.5 text-[10px] font-mono max-w-[190px]">
    <div className="flex items-center gap-1 text-brand font-semibold uppercase px-1">
      <Satellite className="w-3 h-3" /> NASA imagery
    </div>
    <div className="flex flex-wrap gap-1">
      {(['none', 'truecolor', 'bands721', 'rain'] as NasaOverlay[]).map((o) => (
        <button
          key={o}
          onClick={() => setOverlay(o)}
          title={o === 'none' ? 'No NASA overlay' : OVERLAYS[o].hint}
          className={`px-1.5 py-1 rounded border ${
            overlay === o ? 'bg-brand text-white border-brand font-bold' : 'text-ink-soft border-hairline hover:text-ink'
          }`}
        >
          {o === 'none' ? 'Off' : OVERLAYS[o].label}
        </button>
      ))}
    </div>
    <label className="flex items-center gap-1.5 px-1 cursor-pointer text-ink-soft">
      <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />
      <Radar className="w-3 h-3" />
      <span>
        Live events {eventsStatus === 'ok' ? `(${eventCount})` : eventsStatus === 'loading' ? '…' : '(unavailable)'}
      </span>
    </label>
  </div>
);
