import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import {
  LatLng,
  RoadRouteData,
  cumulativeKm,
  fetchRoadRoute,
  offsetPoint,
  pointAtKm,
  progressAlong,
} from './roadRoute';

/** Re-renders on an interval so "last seen 12 s ago" stays current. */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Real road route from `origin` to `dest`, kept fresh as `origin` moves:
 * it is re-fetched only when the team leaves the route line or the route is
 * older than 90 s, and the remaining distance / ETA are computed locally in
 * between, so a moving team does not hammer the routing service.
 */
export function useLiveRoute(origin: LatLng | null, dest: LatLng | null) {
  const [route, setRoute] = useState<RoadRouteData | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'unavailable'>('idle');
  const fetchedAt = useRef(0);
  const routeKey = useRef('');
  const inflight = useRef(false);
  const destKey = dest ? `${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}` : '';

  const cum = useMemo(() => (route ? cumulativeKm(route.coordinates) : null), [route]);
  const progress = useMemo(
    () => (route && cum && origin ? progressAlong(route.coordinates, cum, origin) : null),
    [route, cum, origin?.lat, origin?.lng] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!origin || !dest || inflight.current) return;
    const stale =
      !route || routeKey.current !== destKey || Date.now() - fetchedAt.current > 90_000 || (progress?.offRoute ?? false);
    // Throttle failures too: wait before asking again.
    if (!stale || Date.now() - fetchedAt.current < 8_000) return;

    inflight.current = true;
    fetchedAt.current = Date.now();
    if (!route) setStatus('loading');
    fetchRoadRoute(origin, dest)
      .then((r) => {
        routeKey.current = destKey;
        if (r) {
          setRoute(r);
          setStatus('ok');
        } else {
          setStatus((s) => (route ? s : 'unavailable'));
        }
      })
      .finally(() => {
        inflight.current = false;
      });
  }, [origin?.lat, origin?.lng, destKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const remainingKm = progress ? progress.remainingKm : null;
  const etaMin =
    route && remainingKm !== null
      ? remainingKm < 0.1
        ? 0
        : Math.max(1, Math.round((route.durationMin * remainingKm) / Math.max(route.distanceKm, 0.1)))
      : null;

  return { route, status, remainingKm, etaMin };
}

export type ShareState = 'off' | 'starting' | 'live' | 'error';

/** Posts the device's real GPS position as the team's live location. */
export function useShareLocation(teamId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<ShareState>('off');
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!enabled || !teamId) {
      setState('off');
      return;
    }
    if (!navigator.geolocation || !window.isSecureContext) {
      setState('error');
      setError('Live location needs a secure page (https or localhost) and a device with location services.');
      return;
    }
    setState('starting');
    setError(null);
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(here);
        const now = Date.now();
        if (now - last < 4000) return; // the server accepts one update per 1.5 s; 4 s is plenty
        last = now;
        api(`/teams/${encodeURIComponent(teamId)}/location`, {
          method: 'POST',
          json: { ...here, accuracy: pos.coords.accuracy, simulated: false },
        })
          .then(() => setState('live'))
          .catch((err) => {
            if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
              setState('error');
              setError('Your session cannot share location. Sign in again.');
            }
          });
      },
      (err) => {
        setState('error');
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow location for this site in the browser settings.'
            : 'Could not read your location. Turn on location services and try again.'
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15_000 }
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      api(`/teams/${encodeURIComponent(teamId)}/location`, { method: 'POST', json: { clear: true } }).catch(() => {});
      setPosition(null);
    };
  }, [enabled, teamId]);

  return { state, error, position };
}

export type DriveState = 'idle' | 'planning' | 'driving' | 'arrived';

/**
 * "Demo drive": drives a simulated team along a REAL road route toward the
 * victim in ~50 seconds, posting each position flagged `simulated: true`, so a
 * single laptop can show the whole live-tracking flow. Clearly labelled in the UI.
 */
export function useDemoDrive(teamId: string | undefined, victim: LatLng | null, baseKm: number, enabled: boolean) {
  const [state, setState] = useState<DriveState>('idle');
  const [position, setPosition] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!enabled || !teamId || !victim) {
      setState('idle');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    setState('planning');

    (async () => {
      const start = offsetPoint(victim, Math.min(Math.max(baseKm, 1.5), 6), 135);
      const road = await fetchRoadRoute(start, victim);
      if (cancelled) return;
      const coords: [number, number][] = road ? road.coordinates : [[start.lat, start.lng], [victim.lat, victim.lng]];
      const cum = cumulativeKm(coords);
      const total = cum[cum.length - 1];
      const STEPS = 25; // one update every 2 s
      let i = 0;
      setState('driving');

      const tick = () => {
        i++;
        const here = pointAtKm(coords, cum, (total * i) / STEPS);
        setPosition(here);
        api(`/teams/${encodeURIComponent(teamId)}/location`, {
          method: 'POST',
          json: { ...here, accuracy: null, simulated: true },
        }).catch(() => {});
        if (i >= STEPS) {
          if (timer) clearInterval(timer);
          setState('arrived');
        }
      };
      tick();
      timer = setInterval(tick, 2000);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      setPosition(null);
      api(`/teams/${encodeURIComponent(teamId)}/location`, { method: 'POST', json: { clear: true } }).catch(() => {});
    };
  }, [enabled, teamId, victim?.lat, victim?.lng, baseKm]); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, position };
}
