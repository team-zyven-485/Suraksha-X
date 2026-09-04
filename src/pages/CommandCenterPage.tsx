import React from 'react';
import {
  AlertTriangle,
  Flame,
  Users,
  UsersRound,
  Building2,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  Activity,
  Compass,
} from 'lucide-react';
import { useDisaster } from '../context/DisasterContext';
import { useSatellite } from '../context/SatelliteContext';
import { KpiCard } from '../components/common/KpiCard';
import { DisasterMap } from '../components/map/DisasterMap';
import { Badge } from '../components/common/Badge';

export const CommandCenterPage: React.FC = () => {
  const { hazard } = useSatellite();
  const {
    riskZones,
    reliefCentres,
    selectedZone,
    setSelectedZone,
    setSelectedDetailDrawerZone,
    triggerRelocationWorkflow,
    setActivePage,
    scenarioMeta,
    demographics,
  } = useDisaster();

  const priorityZones = [...riskZones].sort((a, b) => b.riskScore - a.riskScore);
  const topZone = priorityZones[0];

  // Same multi-factor scoring used on the Relocation Planner / Relief Centres
  // pages, so the "Target Shelter" figure here names an actual recommended
  // facility instead of a generic district-wide centre count.
  const recommendedCentre = [...reliefCentres].sort((a, b) => {
    const aScore = a.safetyScore * 0.4 + (a.available > 0 ? 30 : 0) + (1 / (a.distanceKm || 10)) * 30;
    const bScore = b.safetyScore * 0.4 + (b.available > 0 ? 30 : 0) + (1 / (b.distanceKm || 10)) * 30;
    return bScore - aScore;
  })[0];

  const handleSelectZone = (zone: typeof topZone) => {
    setSelectedZone(zone);
    setSelectedDetailDrawerZone(zone);
  };

  const currentZone = selectedZone || topZone;
  const availableCentresCount = reliefCentres.filter((c) => c.available > 0).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-critical animate-ping"></span>
            <span className="text-[11px] font-mono uppercase tracking-widest text-critical font-semibold">
              LIVE CRISIS OPERATIONS
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-ink tracking-tight mt-0.5">
            Disaster Command Center
          </h1>
          <p className="text-xs text-ink-soft mt-1 font-sans">
            Real-time hazard, vulnerability and relocation intelligence for {scenarioMeta.region}, {scenarioMeta.state}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActivePage('relocation-planner')}
            className="px-3.5 py-2 rounded bg-surface hover:bg-paper-alt border border-hairline text-xs font-mono text-ink flex items-center gap-1.5 transition-colors"
          >
            <Compass className="w-3.5 h-3.5 text-brand" />
            <span>Open Relocation Planner</span>
          </button>
          {topZone && (
            <button
              id="btn-cc-plan-relocation"
              onClick={() => triggerRelocationWorkflow(topZone.id)}
              className="px-4 py-2 rounded bg-critical hover:bg-critical/90 text-xs font-mono font-bold text-white flex items-center gap-1.5 transition-colors"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>RELOCATE {topZone.name.split(' (')[0].toUpperCase()}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI SECTION */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <KpiCard
          id="kpi-active-hazards"
          title="Active Hazard Zones"
          value={scenarioMeta.totalHazardZones}
          subtitle="Monitored in district"
          icon={AlertTriangle}
          trend={{ value: `${scenarioMeta.criticalZonesCount} Critical`, isPositive: false }}
          statusColor="orange"
          onClick={() => setActivePage('risk-intelligence')}
        />
        <KpiCard
          id="kpi-critical-zones"
          title="Critical Zones"
          value={scenarioMeta.criticalZonesCount}
          subtitle="P1 Relocation active"
          icon={Flame}
          trend={{ value: "P1 Urgent", isPositive: false }}
          statusColor="red"
          onClick={() => setActivePage('risk-intelligence')}
        />
        <KpiCard
          id="kpi-population-at-risk"
          title="Population at Risk"
          value={scenarioMeta.totalPopulationAtRisk}
          subtitle="Total exposed residents"
          icon={Users}
          trend={{ value: "High Exposure", isPositive: false }}
          statusColor="amber"
          onClick={() => setActivePage('vulnerability')}
        />
        <KpiCard
          id="kpi-vulnerable-population"
          title="Vulnerable Pop."
          value={scenarioMeta.totalVulnerablePopulation}
          subtitle="Elderly, disabled & kids"
          icon={UsersRound}
          trend={{ value: `${((scenarioMeta.totalVulnerablePopulation / scenarioMeta.totalPopulationAtRisk) * 100).toFixed(1)}% of total`, isPositive: false }}
          statusColor="red"
          onClick={() => setActivePage('vulnerability')}
        />
        <KpiCard
          id="kpi-relief-centres"
          title="Relief Centres"
          value={scenarioMeta.totalReliefCentres}
          subtitle="Operational shelters"
          icon={Building2}
          trend={{ value: `${availableCentresCount} Accepting`, isPositive: true }}
          statusColor="blue"
          onClick={() => setActivePage('relief-centres')}
        />
        <KpiCard
          id="kpi-available-capacity"
          title="Available Capacity"
          value={scenarioMeta.availableShelterCapacity}
          subtitle="Bed spaces ready"
          icon={CheckCircle2}
          trend={{ value: `${((scenarioMeta.availableShelterCapacity / scenarioMeta.totalShelterCapacity) * 100).toFixed(1)}% free`, isPositive: true }}
          statusColor="emerald"
          onClick={() => setActivePage('relief-centres')}
        />
      </div>

      {/* MAIN WORKSPACE GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* MAP CONTAINER */}
        <div className="xl:col-span-8 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink-soft">
                District GIS Intelligence Map
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                  hazard?.data_mode === 'CONNECTED'
                    ? 'text-safe bg-safe-soft border-safe/30'
                    : 'text-warn bg-warn-soft border-warn/30'
                }`}
              >
                {hazard?.data_mode === 'CONNECTED' ? 'LIVE TELEMETRY' : 'DEMO DATA'}
              </span>
            </div>
            <div className="text-[11px] font-mono text-ink-soft">
              Click any zone polygon or marker to inspect
            </div>
          </div>

          <DisasterMap heightClass="h-[460px] lg:h-[560px]" />
        </div>

        {/* RIGHT SIDE PANELS */}
        <div className="xl:col-span-4 space-y-4">
          {/* PRIORITY AREAS RANKED PANEL */}
          <div className="p-4 rounded-lg bg-surface border border-hairline shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-critical" />
                <h3 className="text-sm font-bold font-mono text-ink tracking-wide">
                  Priority Areas (Ranked)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-ink-soft">{riskZones.length} Zones</span>
            </div>

            <div className="space-y-2">
              {priorityZones.map((zone, idx) => {
                const isSelected = selectedZone?.id === zone.id;
                const isCritical = zone.riskLevel === 'CRITICAL';
                const isHigh = zone.riskLevel === 'HIGH';

                return (
                  <div
                    key={zone.id}
                    id={`priority-row-${zone.id}`}
                    onClick={() => handleSelectZone(zone)}
                    className={`p-2.5 rounded-md border text-xs font-mono transition-all cursor-pointer flex items-center justify-between gap-2 group ${
                      isSelected
                        ? 'bg-brand-soft border-brand ring-1 ring-brand shadow-sm'
                        : isCritical
                        ? 'bg-critical-soft border-critical/30 hover:border-critical/60'
                        : isHigh
                        ? 'bg-warn-soft border-warn/30 hover:border-warn/60'
                        : 'bg-inset border-hairline hover:border-ink-faint/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-4 text-ink-soft font-bold text-[11px]">{idx + 1}.</span>
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isCritical
                            ? 'bg-critical animate-pulse'
                            : isHigh
                            ? 'bg-warn'
                            : zone.riskLevel === 'MODERATE'
                            ? 'bg-warn'
                            : 'bg-safe'
                        }`}
                      />
                      <div className="truncate">
                        <div className="font-bold text-ink group-hover:text-ink truncate">
                          {zone.name.split(' (')[0]}
                        </div>
                        <div className="text-[10px] text-ink-soft font-mono">
                          {zone.vulnerablePopulation} vulnerable
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div
                          className={`font-bold font-mono text-sm leading-none ${
                            isCritical
                              ? 'text-critical'
                              : isHigh
                              ? 'text-warn'
                              : 'text-warn'
                          }`}
                        >
                          {zone.riskScore}
                        </div>
                        <div className="text-[9px] text-ink-soft font-mono">SCORE</div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-ink-soft group-hover:text-brand transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SURAKSHA INTELLIGENCE SECTION */}
          <div className="p-4 rounded-lg bg-surface border border-hairline shadow-sm space-y-3.5">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-bold font-mono text-ink tracking-wide">
                  SURAKSHA Intelligence
                </h3>
              </div>
              <Badge variant="info" size="sm">
                DECISION SUPPORT
              </Badge>
            </div>

            {/* Target Shelter — the one figure here not already shown in the
                Priority Areas list to the left (risk score, vulnerability and
                priority are all visible there per-zone already). */}
            <div className="p-3 rounded bg-inset border border-hairline flex items-center justify-between gap-3 text-xs font-mono">
              <div>
                <span className="text-[10px] text-ink-soft uppercase block">Target Shelter</span>
                <div className="mt-0.5 text-sm font-bold text-safe">
                  {recommendedCentre ? `${recommendedCentre.code} — ${recommendedCentre.available} beds available` : '—'}
                </div>
              </div>
              <Building2 className="w-5 h-5 text-safe shrink-0" />
            </div>

            {/* Explainable Reasoning Block */}
            <div className="p-3 rounded bg-brand-soft border border-brand/30 space-y-1">
              <span className="text-[10px] font-mono text-brand uppercase font-semibold block">
                Explainable Assessment Rationale:
              </span>
              <p className="text-xs text-ink-soft leading-relaxed font-sans">
                {currentZone?.reasoning || 'Select a zone to view assessment rationale.'}
              </p>
            </div>

            {/* CTA Button */}
            <button
              id="btn-generate-relocation-from-intelligence"
              onClick={() => triggerRelocationWorkflow(currentZone?.id)}
              className="w-full py-2.5 px-3 rounded-lg bg-critical hover:bg-critical/90 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
            >
              <span>GENERATE RELOCATION PLAN →</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
