import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, Marker, Popup } from 'react-leaflet';
import { useFitBounds } from '../../lib/useFitBounds';
import L from 'leaflet';
import { FlaskConical, Play, Pause, Sparkles, Cpu, AlertTriangle, Loader2 } from 'lucide-react';
import type { SOSIncident } from '../../types/sos';
import { api } from '../../lib/api';
import { useDisaster } from '../../context/DisasterContext';
import { useI18n } from '../../i18n';
import { haversineKm } from '../../shared/sosTriage';
import {
  ALLOWED_EMOJI,
  HazardSimParams,
  SEVERITIES,
  Severity,
  assessExposure,
  buildSimulation,
  severityFromPriority,
  validateParams,
} from '../../shared/hazardSim';

interface SimResponse {
  params: HazardSimParams;
  engine: 'gemini' | 'rule-based' | 'rule-based (on-device)';
  model?: string | null;
  /** The server answered with the rule-based sketch while Gemini is still working. */
  upgrading?: boolean;
}

const iconCache = new Map<string, L.DivIcon>();
function emojiIcon(emoji: string, size = 22): L.DivIcon {
  const safe = ALLOWED_EMOJI.includes(emoji) ? emoji : '📍';
  const key = `${safe}|${size}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">${safe}</div>`,
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

const FitTo: React.FC<{ points: [number, number][]; signature: string }> = ({ points, signature }) => {
  useFitBounds(() => L.latLngBounds(points), { padding: [24, 24], maxZoom: 15, animate: false }, [signature]);
  return null;
};

const LEVEL_KEYS = ['severe', 'moderate', 'watch'] as const;

/**
 * "What might be happening here" — an illustrative hazard footprint around an
 * SOS, with emoji markers and a time slider. A pure simulation: Gemini only
 * proposes bounded parameters; our code validates them and draws the map.
 */
export const HazardSimulation: React.FC<{ incident: SOSIncident; audience: 'citizen' | 'staff' }> = ({ incident, audience }) => {
  const { t } = useI18n();
  const { riskZones, reliefCentres } = useDisaster();
  const citizen = audience === 'citizen';
  const T = (key: string, vars?: Record<string, string | number>) => t(key, vars);

  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<Severity | 'AUTO'>('AUTO');
  const [data, setData] = useState<SimResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const origin = incident.coordinates;
  const localOnly = incident.syncState === 'QUEUED' || incident.id.startsWith('PENDING-');
  const effectiveSeverity: Severity = severity === 'AUTO' ? severityFromPriority(incident.priority) : severity;

  // Load (or reload when the severity changes) while the panel is open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const local = (): SimResponse => ({
      params: validateParams({}, incident.disasterType, effectiveSeverity, origin),
      engine: 'rule-based (on-device)',
    });
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const request = (attempt: number) => {
      (localOnly
        ? Promise.resolve(local())
        : api<SimResponse>(`/sos/${encodeURIComponent(incident.id)}/simulation`, {
            method: 'POST',
            json: { severity: severity === 'AUTO' ? undefined : severity },
            signal: AbortSignal.timeout(25_000),
          }).catch(() => local())
      ).then((res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
        setTime(0.15);
        setPlaying(true); // watch it grow
        // Gemini is still working: ask again shortly and swap in the AI-assisted version.
        if (res.upgrading && attempt < 4) retryTimer = setTimeout(() => request(attempt + 1), 12_000);
      });
    };
    setLoading(true);
    request(0);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [open, incident.id, severity, localOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timeline playback
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setTime((prev) => {
        if (prev >= 1) {
          setPlaying(false);
          return 1;
        }
        return Math.min(1, prev + 0.02);
      });
    }, 110);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing]);

  const params = data?.params ?? null;
  const sim = useMemo(() => (params ? buildSimulation(params, origin, time) : null), [params, origin.lat, origin.lng, time]); // eslint-disable-line react-hooks/exhaustive-deps
  const full = useMemo(() => (params ? buildSimulation(params, origin, 1) : null), [params, origin.lat, origin.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const fitPoints = useMemo(() => (full ? [...full.layers.find((l) => l.id === 'watch')!.polygon, [origin.lat, origin.lng] as [number, number]] : null), [full]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exposure uses the bundled sample scenario, so only when the SOS is inside its coverage.
  const exposure = useMemo(() => {
    if (citizen || !sim || riskZones.length === 0) return null;
    const nearest = Math.min(...riskZones.map((z) => haversineKm(z.coordinates, origin)));
    if (nearest > 100) return null;
    return assessExposure(sim, origin, riskZones, reliefCentres);
  }, [citizen, sim, riskZones, reliefCentres, origin.lat, origin.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const hours = params ? params.peakAfterHours * time : 0;
  const timeLabel = !params
    ? ''
    : params.peakAfterHours === 0
    ? citizen ? T('sim.instant') : 'Instant event'
    : hours < 1
    ? `T + ${Math.round(hours * 60)} min`
    : `T + ${hours.toFixed(1)} h`;

  const levelLabel = (id: (typeof LEVEL_KEYS)[number], fallback: string) => (citizen ? T(`sim.lvl.${id}`) : fallback);

  return (
    <div className="rounded-xl border border-hairline bg-surface overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-paper-alt"
      >
        <span className="flex items-center gap-2 text-xs font-mono font-semibold text-ink">
          <FlaskConical className="w-4 h-4 text-brand" />
          {citizen ? (open ? T('sim.hide') : T('sim.show')) : open ? 'Hide hazard simulation' : '🧪 Hazard simulation (scenario sketch)'}
        </span>
        <span className="text-[10px] font-mono text-ink-faint">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-3.5 pt-0 space-y-3">
          <div className="p-2.5 rounded-lg bg-warn-soft border border-warn/30 text-[11px] font-mono text-warn flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {citizen
                ? T('sim.banner')
                : 'SIMULATION — an illustrative scenario sketch, not a forecast. No real-time sensor, satellite, weather or terrain data is used. Directions and extents are assumptions. Do not use it for navigation or evacuation decisions.'}
            </span>
          </div>

          {!citizen && (
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
              <span className="text-ink-faint uppercase">Severity</span>
              {(['AUTO', ...SEVERITIES] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`px-2 py-1 rounded border ${
                    severity === s ? 'bg-brand text-white border-brand font-bold' : 'text-ink-soft border-hairline hover:text-ink'
                  }`}
                >
                  {s === 'AUTO' ? `Auto (${severityFromPriority(incident.priority)})` : s}
                </button>
              ))}
            </div>
          )}

          {loading && !data ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs font-mono text-ink-soft">
              <Loader2 className="w-4 h-4 animate-spin" /> {citizen ? T('sim.loading') : 'Preparing the simulation…'}
            </div>
          ) : params && sim && fitPoints ? (
            <>
              <div className="h-72 rounded-lg overflow-hidden border border-hairline">
                <MapContainer center={[origin.lat, origin.lng]} zoom={12} style={{ height: '100%', width: '100%' }} preferCanvas>
                  <TileLayer attribution="&copy; OpenStreetMap" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {sim.layers.map((layer) => (
                    <Polygon
                      key={layer.id}
                      positions={layer.polygon}
                      pathOptions={{ color: layer.color, weight: 1.5, fillColor: layer.color, fillOpacity: layer.fillOpacity }}
                    />
                  ))}
                  <CircleMarker
                    center={[origin.lat, origin.lng]}
                    radius={9}
                    pathOptions={{ color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }}
                  >
                    <Popup>{citizen ? T('sim.you') : `SOS ${incident.id}`}</Popup>
                  </CircleMarker>
                  {sim.markers.map((m, i) => (
                    <Marker key={`${i}-${m.emoji}`} position={[m.lat, m.lng]} icon={emojiIcon(m.emoji)}>
                      <Popup>{m.label}</Popup>
                    </Marker>
                  ))}
                  {!citizen &&
                    exposure &&
                    exposure.sheltersAtRisk.map((s) => {
                      const c = reliefCentres.find((r) => r.id === s.id)!;
                      return (
                        <Marker key={`risk-${s.id}`} position={[c.coordinates.lat, c.coordinates.lng]} icon={emojiIcon('⚠️', 20)}>
                          <Popup>{s.code} {s.name} — inside the simulated {s.level} zone</Popup>
                        </Marker>
                      );
                    })}
                  <FitTo points={fitPoints} signature={`${incident.id}|${effectiveSeverity}|${params.lengthKm}|${params.bearingDeg}`} />
                </MapContainer>
              </div>

              {/* Timeline */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    if (time >= 1) setTime(0.15);
                    setPlaying((p) => !p);
                  }}
                  disabled={params.hazard === 'EARTHQUAKE'}
                  className="p-2 rounded-lg bg-brand text-white disabled:opacity-40"
                  aria-label={playing ? (citizen ? T('sim.pause') : 'Pause') : citizen ? T('sim.play') : 'Play'}
                >
                  {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <input
                  type="range"
                  min={0.12}
                  max={1}
                  step={0.01}
                  value={time}
                  disabled={params.hazard === 'EARTHQUAKE'}
                  onChange={(e) => {
                    setPlaying(false);
                    setTime(Number(e.target.value));
                  }}
                  className="flex-1"
                  aria-label={citizen ? T('sim.time') : 'Simulated time'}
                />
                <span className="text-[11px] font-mono text-ink w-24 text-right">{timeLabel}</span>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-ink-soft">
                {[...sim.layers].reverse().map((l) => (
                  <span key={l.id} className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm border" style={{ background: l.color, opacity: l.fillOpacity + 0.35, borderColor: l.color }} />
                    {levelLabel(l.id, l.label)}
                  </span>
                ))}
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-critical" /> {citizen ? T('sim.you') : 'SOS location'}</span>
              </div>

              {/* Narrative */}
              <div className="space-y-1.5">
                <div className="text-sm font-bold font-mono text-ink">{params.headline}</div>
                <p className="text-xs text-ink-soft leading-relaxed">{params.narrative}</p>
                <div className="inline-block px-2 py-1 rounded bg-inset border border-hairline text-[11px] font-mono text-ink">
                  {citizen ? T(`sim.int.${params.hazard}`) : params.intensity.label}: <strong>{params.intensity.value} {params.intensity.unit}</strong>
                </div>
              </div>

              {citizen ? (
                <div className="p-2.5 rounded-lg bg-brand-soft border border-brand/30 space-y-1">
                  <div className="text-[10px] font-mono uppercase font-semibold text-brand">{T('sim.tipsTitle')}</div>
                  <ul className="text-xs text-ink space-y-0.5 list-disc pl-4">
                    {[1, 2, 3].map((n) => (
                      <li key={n}>{T(`sim.tips.${params.hazard}.${n}`)}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  {exposure && (
                    <div className="p-2.5 rounded-lg bg-inset border border-hairline text-[11px] font-mono space-y-1">
                      <div className="text-[10px] uppercase font-semibold text-ink-faint">Simulated exposure (sample scenario data)</div>
                      <div className="text-ink">
                        {exposure.zones.length} zone{exposure.zones.length === 1 ? '' : 's'} inside the footprint
                        {exposure.zones.length > 0 && <> — about {exposure.populationInFootprint.toLocaleString()} residents ({exposure.zones.map((z) => z.name.split(' (')[0]).join(', ')})</>}
                      </div>
                      {exposure.sheltersAtRisk.length > 0 && (
                        <div className="text-critical">⚠️ Shelters inside the footprint: {exposure.sheltersAtRisk.map((s) => s.code).join(', ')}</div>
                      )}
                      {exposure.sheltersOutside.length > 0 && (
                        <div className="text-safe">Nearest shelters outside it: {exposure.sheltersOutside.map((s) => `${s.code} (${s.distanceKm} km, ${s.available} beds)`).join(' · ')}</div>
                      )}
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase font-semibold text-ink-faint">Assumptions</div>
                    <ul className="text-[11px] text-ink-soft list-disc pl-4 space-y-0.5">
                      {params.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase font-semibold text-ink-faint">Considerations to verify (suggestions, not orders)</div>
                    <ul className="text-[11px] text-ink list-disc pl-4 space-y-0.5">
                      {params.considerations.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                </>
              )}

              <div className="flex items-center gap-1.5 text-[10px] font-mono text-ink-faint">
                {data?.engine === 'gemini' ? <Sparkles className="w-3 h-3 text-brand" /> : <Cpu className="w-3 h-3" />}
                {data?.engine === 'gemini'
                  ? citizen ? T('sim.engine.gemini') : `Parameters suggested by Gemini (${data.model}); validated and drawn by our code`
                  : data?.upgrading
                  ? citizen ? T('sim.upgrading') : 'Rule-based sketch shown — Gemini is still working and will refine it automatically…'
                  : citizen ? T('sim.engine.rule') : `Rule-based scenario (${data?.engine}) — Gemini unavailable or not configured`}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};
