import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type L from 'leaflet';

/**
 * Fit the map to some bounds — but only once the map container has a real
 * size. Maps that live inside panels which have just been opened can be
 * measured at 0 px wide, which makes Leaflet pick the maximum zoom. A
 * ResizeObserver refits as soon as the container is laid out properly.
 * Re-runs when `deps` change (e.g. a new route or footprint).
 */
export function useFitBounds(getBounds: () => L.LatLngBoundsExpression | null, options: L.FitBoundsOptions, deps: unknown[]) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const fit = () => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      const bounds = getBounds();
      if (!bounds) return;
      map.invalidateSize();
      map.fitBounds(bounds, options);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
