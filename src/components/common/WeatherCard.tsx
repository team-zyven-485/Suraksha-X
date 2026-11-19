import React, { useEffect, useState } from 'react';
import { CloudRain, Wind, Droplets, Thermometer, CloudOff } from 'lucide-react';
import { useDisaster } from '../../context/DisasterContext';

interface WeatherData {
  available: boolean;
  source: string;
  region: string;
  observedAt?: string | null;
  temperatureC?: number | null;
  humidityPct?: number | null;
  precipitationMm?: number | null;
  windKmh?: number | null;
  forecast?: { date: string; rainMm: number | null; rainChancePct: number | null }[];
}

/**
 * Live weather for the active scenario region (Open-Meteo via our server).
 * Shows "unavailable" rather than inventing numbers when the feed can't be reached.
 */
export const WeatherCard: React.FC<{ compact?: boolean; labels?: { title: string; unavailable: string } }> = ({
  compact = false,
  labels = { title: 'Live Weather', unavailable: 'Live weather unavailable right now.' },
}) => {
  const { activeScenarioId, scenarioMeta } = useDisaster();
  const [data, setData] = useState<WeatherData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    fetch(`/api/weather?scenarioId=${encodeURIComponent(activeScenarioId)}`, { signal: AbortSignal.timeout(9000) })
      .then((r) => r.json())
      .then((d: WeatherData) => {
        if (!cancelled) {
          setData(d);
          setFailed(!d.available);
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [activeScenarioId]);

  if (failed) {
    return (
      <div className="p-3 rounded-xl bg-surface border border-hairline text-[11px] font-mono text-ink-faint flex items-center gap-2">
        <CloudOff className="w-4 h-4 shrink-0" /> {labels.unavailable}
      </div>
    );
  }
  if (!data) {
    return <div className="p-3 rounded-xl bg-surface border border-hairline text-[11px] font-mono text-ink-faint">…</div>;
  }

  const rainSoon = data.forecast?.find((d) => (d.rainChancePct ?? 0) >= 60 || (d.rainMm ?? 0) >= 10);

  return (
    <div className="p-3.5 rounded-xl bg-surface border border-hairline space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-brand font-semibold">
          <CloudRain className="w-3.5 h-3.5" /> {labels.title} — {scenarioMeta.region}
        </div>
        <span className="text-[9px] font-mono text-ink-faint">{data.source}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center font-mono">
        <div>
          <Thermometer className="w-3.5 h-3.5 mx-auto text-ink-faint" />
          <div className="text-sm font-bold text-ink">{data.temperatureC != null ? `${Math.round(data.temperatureC)}°C` : '—'}</div>
        </div>
        <div>
          <Droplets className="w-3.5 h-3.5 mx-auto text-ink-faint" />
          <div className="text-sm font-bold text-ink">{data.humidityPct != null ? `${Math.round(data.humidityPct)}%` : '—'}</div>
        </div>
        <div>
          <CloudRain className="w-3.5 h-3.5 mx-auto text-ink-faint" />
          <div className="text-sm font-bold text-ink">{data.precipitationMm != null ? `${data.precipitationMm} mm` : '—'}</div>
        </div>
        <div>
          <Wind className="w-3.5 h-3.5 mx-auto text-ink-faint" />
          <div className="text-sm font-bold text-ink">{data.windKmh != null ? `${Math.round(data.windKmh)} km/h` : '—'}</div>
        </div>
      </div>
      {!compact && data.forecast && data.forecast.length > 0 && (
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-hairline text-[10px] font-mono text-ink-soft">
          {data.forecast.map((d) => (
            <div key={d.date} className="text-center">
              <div className="text-ink-faint">{new Date(d.date).toLocaleDateString([], { weekday: 'short', day: 'numeric' })}</div>
              <div className="text-ink">{d.rainMm ?? '—'} mm</div>
              <div>{d.rainChancePct ?? '—'}%</div>
            </div>
          ))}
        </div>
      )}
      {rainSoon && (
        <div className="text-[10px] font-mono text-warn">
          ▲ {new Date(rainSoon.date).toLocaleDateString([], { weekday: 'long' })}: {rainSoon.rainMm ?? '—'} mm rain, {rainSoon.rainChancePct ?? '—'}% chance
        </div>
      )}
    </div>
  );
};
