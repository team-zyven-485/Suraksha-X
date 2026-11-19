export type LocationFailure = 'denied' | 'timeout' | 'unavailable' | 'insecure' | 'unsupported';

export type FixResult =
  | { ok: true; coords: { lat: number; lng: number }; accuracy: number | null }
  | { ok: false; reason: LocationFailure };

function once(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

const reasonOf = (err: unknown): LocationFailure => {
  const code = (err as GeolocationPositionError | undefined)?.code;
  return code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable';
};

/**
 * The device's real position, as fast as possible. Phones answer the first
 * (GPS) attempt; laptops without GPS fall through to the coarser Wi-Fi /
 * network lookup. Never invents a location: on failure it says why.
 */
export async function getCurrentFix(): Promise<FixResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return { ok: false, reason: 'unsupported' };
  if (!window.isSecureContext) return { ok: false, reason: 'insecure' };

  const toResult = (pos: GeolocationPosition): FixResult => ({
    ok: true,
    coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
    accuracy: pos.coords.accuracy ?? null,
  });

  try {
    return toResult(await once({ enableHighAccuracy: true, timeout: 7000, maximumAge: 10_000 }));
  } catch (err) {
    if (reasonOf(err) === 'denied') return { ok: false, reason: 'denied' }; // no point retrying
    try {
      return toResult(await once({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }));
    } catch (err2) {
      return { ok: false, reason: reasonOf(err2) };
    }
  }
}

/** i18n key for each failure reason (texts already exist for the Locate Me page). */
export const FAILURE_KEY: Record<LocationFailure, string> = {
  denied: 'loc.errDenied',
  timeout: 'loc.errTimeout',
  unavailable: 'loc.errUnavailable',
  insecure: 'loc.errInsecure',
  unsupported: 'loc.errNoGeo',
};
