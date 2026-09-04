import React from 'react';
import {
  X,
  ShieldAlert,
  Users,
  Activity,
  ArrowRight,
  TrendingUp,
  MapPin,
  Waves,
  Building,
  Navigation,
  Printer,
} from 'lucide-react';
import { useDisaster } from '../../context/DisasterContext';
import { Badge } from '../common/Badge';

export const ZoneDetailDrawer: React.FC = () => {
  const {
    selectedDetailDrawerZone: zone,
    setSelectedDetailDrawerZone,
    triggerRelocationWorkflow,
    setSelectedZone,
    setActivePage,
    printOrder,
    reliefCentres,
  } = useDisaster();

  if (!zone) return null;

  const handleStartRelocation = () => {
    setSelectedZone(zone);
    triggerRelocationWorkflow(zone.id);
  };

  return (
    <>
      {/* Backdrop for click-away and focus */}
      <div
        onClick={() => setSelectedDetailDrawerZone(null)}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      />

      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-inset border-l border-hairline shadow-2xl backdrop-blur-xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
      <div className="p-4 border-b border-hairline flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={zone.riskLevel.toLowerCase() as any} size="sm" dot>
              {zone.riskLevel}
            </Badge>
            <span className="text-xs font-mono text-ink-soft">CODE: {zone.code}</span>
          </div>
          <h2 className="text-lg font-bold text-ink tracking-tight">{zone.name}</h2>
          <div className="flex items-center gap-1.5 text-xs text-ink-soft font-mono mt-0.5">
            <MapPin className="w-3 h-3 text-brand" />
            <span>{zone.district}</span>
          </div>
        </div>

        <button
          onClick={() => setSelectedDetailDrawerZone(null)}
          className="p-1.5 rounded text-ink-soft hover:text-ink hover:bg-surface transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Drawer Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Core Risk Metrics Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-lg bg-critical-soft border border-critical/30">
            <span className="text-[10px] font-mono text-ink-soft uppercase tracking-wider">
              RISK SCORE
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold font-mono text-critical">{zone.riskScore}</span>
              <span className="text-xs font-mono text-ink-faint">/ 100</span>
            </div>
            <div className="text-[10px] font-mono text-critical mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-critical" />
              <span>Priority {zone.priority}</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-surface border border-hairline">
            <span className="text-[10px] font-mono text-ink-soft uppercase tracking-wider">
              HAZARD INTENSITY EST.
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold font-mono text-warn">
                +{zone.floodDepthEstMeters}
              </span>
              <span className="text-xs font-mono text-ink-faint">meters</span>
            </div>
            <div className="text-[10px] font-mono text-warn mt-1 flex items-center gap-1">
              <Waves className="w-3 h-3 text-warn" />
              <span>{zone.waterLevelTrend.replace('_', ' ')}</span>
            </div>
          </div>
        </div>

        {/* Population & Vulnerability */}
        <div className="p-3.5 rounded-lg bg-surface border border-hairline space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-ink-soft uppercase">POPULATION EXPOSURE</span>
            <span className="text-ink-soft">{zone.exposureLevel}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2 rounded bg-inset border border-hairline">
              <div className="text-ink-soft text-[10px]">Total Population</div>
              <div className="text-lg font-bold text-ink mt-0.5">
                {zone.population.toLocaleString()}
              </div>
            </div>
            <div className="p-2 rounded bg-critical-soft border border-critical/30">
              <div className="text-critical text-[10px]">Vulnerable Pop.</div>
              <div className="text-lg font-bold text-critical mt-0.5">
                {zone.vulnerablePopulation.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Vulnerability category bars */}
          <div className="space-y-2 pt-1 border-t border-hairline text-xs font-mono">
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-soft">Elderly (&gt;65 yrs):</span>
              <span className="text-ink font-semibold">{zone.vulnerabilityBreakdown.elderly}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-soft">Children (&lt;12 yrs):</span>
              <span className="text-ink font-semibold">{zone.vulnerabilityBreakdown.children}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-soft">Persons with Disabilities:</span>
              <span className="text-ink font-semibold">{zone.vulnerabilityBreakdown.pwd}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-soft">Accessibility Rating:</span>
              <span className="text-warn font-semibold">{zone.vulnerabilityBreakdown.accessibilityScore}/100</span>
            </div>
          </div>
        </div>

        {/* Explainable Reasoning Block */}
        <div className="p-3 rounded-lg bg-brand-soft border border-brand/30 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-mono text-brand font-semibold">
            <Activity className="w-3.5 h-3.5" />
            <span>SURAKSHA Intelligence Rationale</span>
          </div>
          <p className="text-xs text-ink-soft leading-relaxed font-sans">{zone.reasoning}</p>
        </div>

        {/* Recommended Action Notice */}
        <div className="p-3 rounded-lg bg-critical-soft border border-critical/30 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono text-critical uppercase font-semibold">
              RECOMMENDED ACTION
            </div>
            <div className="text-xs font-bold text-ink mt-0.5">{zone.recommendedAction}</div>
          </div>
          <ShieldAlert className="w-6 h-6 text-critical shrink-0" />
        </div>
      </div>

      {/* Drawer Footer CTA */}
      <div className="p-4 border-t border-hairline bg-inset space-y-2">
        <button
          id="btn-drawer-generate-plan"
          onClick={handleStartRelocation}
          className="w-full py-2.5 px-4 rounded-lg bg-critical hover:bg-critical/90 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-colors"
        >
          <span>GENERATE RELOCATION PLAN</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setSelectedZone(zone);
              setActivePage('vulnerability');
              setSelectedDetailDrawerZone(null);
            }}
            className="py-1.5 px-2 rounded bg-surface hover:bg-paper-alt border border-hairline text-ink-soft text-[11px] font-mono transition-colors"
          >
            Vulnerability Breakdown
          </button>
          <button
            onClick={() => {
              setSelectedZone(zone);
              setActivePage('evacuation-routes');
              setSelectedDetailDrawerZone(null);
            }}
            className="py-1.5 px-2 rounded bg-surface hover:bg-paper-alt border border-hairline text-ink-soft text-[11px] font-mono transition-colors"
          >
            Inspect Routes
          </button>
        </div>

        <button
          onClick={() =>
            printOrder({
              orderId: `PLAN-${Date.now().toString().slice(-6)}`,
              directive: `MANDATORY RELOCATION DIRECTIVE FOR ${zone.name}`,
              targetZone: zone.name,
              targetShelter: reliefCentres.find((s) => s.available > 0)?.name || reliefCentres[0]?.name || 'Nearest Relief Centre',
              priorityCitizensCount: zone.vulnerablePopulation,
              authorizedBy: 'Admin',
              timestamp: new Date().toISOString(),
            })
          }
          className="w-full py-2 px-3 rounded bg-surface hover:bg-paper-alt border border-hairline text-ink text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-safe" />
          <span>Print Evacuation Directive Order</span>
        </button>
      </div>
    </div>
    </>
  );
};
