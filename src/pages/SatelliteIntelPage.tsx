import React from 'react';
import {
  Satellite,
  RefreshCw,
  Radar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  Route as RouteIcon,
  Users,
  UsersRound,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { useDisaster } from '../context/DisasterContext';
import { useSatellite } from '../context/SatelliteContext';
import { Badge } from '../components/common/Badge';

const dataModeBadge: Record<string, { variant: any; label: string }> = {
  CONNECTED: { variant: 'safe', label: 'CONNECTED' },
  DEMO: { variant: 'moderate', label: 'DEMO DATA' },
  UNAVAILABLE: { variant: 'critical', label: 'UNAVAILABLE' },
};

const roadStatusBadge: Record<string, any> = {
  SAFE: 'safe',
  AT_RISK: 'moderate',
  BLOCKED: 'critical',
};

export const SatelliteIntelPage: React.FC = () => {
  const { scenarioMeta, demographics, riskZones } = useDisaster();
  const { backendStatus, hazard, roadImpacts, isLoading, error, refreshStatus, processLatestObservation, useDemoData } =
    useSatellite();

  const criticalZones = riskZones.filter((z) => z.riskLevel === 'CRITICAL').length;
  const affectedRoadsCount = roadImpacts.filter((r) => r.status !== 'SAFE').length;
  const mode = hazard?.data_mode || (backendStatus ? backendStatus.data_mode : 'UNAVAILABLE');
  const modeInfo = dataModeBadge[mode] || dataModeBadge.UNAVAILABLE;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Satellite className="w-4 h-4 text-brand" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-brand font-semibold">
              NEAR-REAL-TIME SATELLITE INTELLIGENCE
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-ink tracking-tight mt-0.5">
            Satellite Intelligence
          </h1>
          <p className="text-xs text-ink-soft mt-1">
            Sentinel-1 SAR-derived hazard extent, road-risk classification, and safe-routing intelligence for {scenarioMeta.region}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshStatus()}
            disabled={isLoading}
            className="px-3.5 py-2 rounded bg-surface hover:bg-paper-alt border border-hairline text-xs font-mono text-ink flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Backend Status</span>
          </button>
          <button
            onClick={() => processLatestObservation(false)}
            disabled={isLoading}
            className="px-4 py-2 rounded bg-brand hover:bg-brand/90 text-xs font-mono font-bold text-white flex items-center gap-1.5 disabled:opacity-50"
          >
            <Radar className="w-4 h-4" />
            <span>Process Latest Observation</span>
          </button>
        </div>
      </div>

      {/* DATA MODE BANNER */}
      <div
        className={`p-4 rounded-lg border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          mode === 'CONNECTED'
            ? 'bg-safe-soft border-safe/30'
            : mode === 'DEMO'
            ? 'bg-warn-soft border-warn/30'
            : 'bg-critical-soft border-critical/30'
        }`}
      >
        <div className="flex items-center gap-3">
          {mode === 'CONNECTED' ? (
            <CheckCircle2 className="w-5 h-5 text-safe" />
          ) : mode === 'DEMO' ? (
            <Info className="w-5 h-5 text-warn" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-critical" />
          )}
          <div>
            <div className="text-sm font-bold font-mono text-ink">DATA MODE: {modeInfo.label}</div>
            <div className="text-xs text-ink-soft mt-0.5">
              {hazard?.message || backendStatus?.reason || 'Satellite data temporarily unavailable'}
            </div>
          </div>
        </div>
        {mode !== 'CONNECTED' && (
          <button
            onClick={() => useDemoData()}
            disabled={isLoading}
            className="px-3.5 py-2 rounded bg-warn hover:bg-warn/90 text-xs font-mono font-bold text-white flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <span>Use Demo Data</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-critical-soft border border-critical/30 text-xs font-mono text-critical">
          {error}
        </div>
      )}

      {/* SATELLITE SUMMARY GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block">Satellite Source</span>
          <span className="text-lg font-bold text-ink mt-1 block">{hazard?.source || 'Sentinel-1'}</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">{hazard?.product || 'Sentinel-1 GRD'}</span>
        </div>
        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block flex items-center gap-1"><Clock className="w-3 h-3" />Latest Observation</span>
          <span className="text-sm font-bold text-ink mt-1 block">
            {hazard?.observation_time || 'No recent observation'}
          </span>
          <span className="text-[10px] text-ink-soft block mt-0.5">Processed: {hazard?.processed_at ? new Date(hazard.processed_at).toLocaleTimeString() : '—'}</span>
        </div>
        <div className="p-4 rounded-lg bg-critical-soft border border-critical/30 font-mono">
          <span className="text-[10px] text-critical uppercase font-semibold block">Affected Area</span>
          <span className="text-lg font-bold text-critical mt-1 block">{hazard?.affected_area_km2?.toFixed(1) ?? '0.0'} km²</span>
          <span className="text-[10px] text-critical/80 block mt-0.5">Hazard: {hazard?.hazard_type || 'flood'}</span>
        </div>
        <div className="p-4 rounded-lg bg-warn-soft border border-warn/30 font-mono">
          <span className="text-[10px] text-warn uppercase font-semibold block">Confidence</span>
          <span className="text-lg font-bold text-warn mt-1 block">{hazard?.confidence || 'LOW'}</span>
          <span className="text-[10px] text-warn/80 block mt-0.5">{hazard?.detection_method || 'Not yet processed'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block flex items-center gap-1"><RouteIcon className="w-3 h-3" />Affected Roads</span>
          <span className="text-2xl font-bold text-ink mt-1 block">{affectedRoadsCount}</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">of {roadImpacts.length} assessed</span>
        </div>
        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block flex items-center gap-1"><ShieldAlert className="w-3 h-3" />Critical Zones</span>
          <span className="text-2xl font-bold text-ink mt-1 block">{criticalZones}</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">of {riskZones.length} zones</span>
        </div>
        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block flex items-center gap-1"><Users className="w-3 h-3" />Population at Risk</span>
          <span className="text-lg font-bold text-ink mt-1 block">{demographics.totalPopulationAtRisk.toLocaleString()}</span>
        </div>
        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block flex items-center gap-1"><UsersRound className="w-3 h-3" />Vulnerable Population</span>
          <span className="text-lg font-bold text-ink mt-1 block">{demographics.totalVulnerablePopulation.toLocaleString()}</span>
        </div>
      </div>

      {/* AOI INFO */}
      {hazard?.aoi && (
        <div className="p-3 rounded-lg bg-surface border border-hairline text-xs font-mono text-ink-soft flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-brand" />
          <span>
            AOI: {hazard.aoi.label || `${hazard.aoi.lat.toFixed(3)}, ${hazard.aoi.lng.toFixed(3)}`} • radius {hazard.aoi.radius_km} km
          </span>
        </div>
      )}

      {/* ROAD IMPACT TABLE */}
      <div className="p-4 rounded-lg bg-surface border border-hairline shadow-xl space-y-3">
        <h3 className="text-sm font-bold font-mono text-ink flex items-center gap-2">
          <RouteIcon className="w-4 h-4 text-brand" />
          Satellite-Derived Road Risk ({roadImpacts.length})
        </h3>
        <p className="text-[11px] text-ink-faint -mt-2">
          Satellite-derived hazard intersection — not a claim of confirmed physical road blockage.
        </p>
        {roadImpacts.length === 0 ? (
          <div className="text-xs font-mono text-ink-faint py-6 text-center">
            No road impact data yet. Click "Process Latest Observation" to run the pipeline.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-hairline bg-inset text-ink-soft uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Road</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Risk Score</th>
                  <th className="py-2.5 px-3">Confidence</th>
                  <th className="py-2.5 px-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {roadImpacts.map((r) => (
                  <tr key={r.road_id}>
                    <td className="py-2.5 px-3 text-ink font-semibold">{r.road_name}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant={roadStatusBadge[r.status]} size="sm">{r.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="py-2.5 px-3 text-ink-soft">{r.risk_score}</td>
                    <td className="py-2.5 px-3 text-ink-soft">{r.confidence}</td>
                    <td className="py-2.5 px-3 text-ink-soft max-w-xs truncate" title={r.reason}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
