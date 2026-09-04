import React from 'react';
import { useDisaster } from '../../context/DisasterContext';
import {
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Radio,
  Waves,
  Users,
  Building,
  Navigation,
  Sparkles,
} from 'lucide-react';

export const SimulationModal: React.FC = () => {
  const { isSimulating, simulationStep, selectedZone, scenarioMeta, reliefCentres } = useDisaster();

  if (!isSimulating) return null;

  const steps = [
    {
      id: 1,
      title: 'Analysing hazard severity & intensity progression...',
      icon: Waves,
      detail: `Telemetry models estimate +${selectedZone?.floodDepthEstMeters ?? '—'}m intensity at ${selectedZone?.name || 'Target Zone'}`,
    },
    {
      id: 2,
      title: 'Assessing vulnerable population & demographic risks...',
      icon: Users,
      detail: `Prioritizing ${selectedZone?.vulnerablePopulation ?? 0} elderly, pediatric and disabled residents`,
    },
    {
      id: 3,
      title: 'Checking relief-centre capacity & facility readiness...',
      icon: Building,
      detail: `Matching distance, elevation and available bed counts across ${reliefCentres.length} district shelter nodes`,
    },
    {
      id: 4,
      title: 'Evaluating route safety & clearance around hazard blockages...',
      icon: Navigation,
      detail: 'Calculating bypass routes to avoid known blocked or unsafe roads',
    },
    {
      id: 5,
      title: 'Synthesizing authorized relocation action plan...',
      icon: Sparkles,
      detail: 'Formulating incident command dispatch checklist & shelter reservations',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inset backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-surface border border-hairline rounded-xl shadow-2xl p-6 relative overflow-hidden">
        {/* Top Radar Pulse */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-critical-soft border border-critical/30 flex items-center justify-center text-critical">
            <Radio className="w-5 h-5 animate-spin text-critical" />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-ink-soft">
              SURAKSHA-X INTELLIGENCE PIPELINE
            </div>
            <h3 className="text-base font-bold text-ink font-mono">
              Relocation Decision Engine
            </h3>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-paper-alt h-1.5 rounded-full overflow-hidden mb-6">
          <div
            className="bg-gradient-to-r from-blue-500 via-indigo-500 to-red-500 h-full transition-all duration-300 rounded-full"
            style={{ width: `${(simulationStep / 5) * 100}%` }}
          />
        </div>

        {/* Steps List */}
        <div className="space-y-3.5">
          {steps.map((step) => {
            const isDone = simulationStep > step.id;
            const isCurrent = simulationStep === step.id;
            const isPending = simulationStep < step.id;
            const StepIcon = step.icon;

            return (
              <div
                key={step.id}
                className={`p-3 rounded-lg border transition-all duration-200 flex items-start gap-3 ${
                  isCurrent
                    ? 'bg-brand-soft border-brand/30 shadow-sm'
                    : isDone
                    ? 'bg-inset border-hairline'
                    : 'bg-inset border-hairline opacity-40'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-safe" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 text-brand animate-spin" />
                  ) : (
                    <StepIcon className="w-4 h-4 text-ink-faint" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className={`text-xs font-mono font-medium ${
                      isCurrent
                        ? 'text-ink font-semibold'
                        : isDone
                        ? 'text-ink-soft'
                        : 'text-ink-faint'
                    }`}
                  >
                    {step.title}
                  </div>
                  {isCurrent && (
                    <div className="text-[11px] font-sans text-brand/90 mt-0.5 animate-in fade-in">
                      {step.detail}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 text-center text-[10px] font-mono text-ink-faint">
          OPERATIONAL DECISION-SUPPORT SYNTHESIS • ZYVEN EMERGENCY SYSTEMS
        </div>
      </div>
    </div>
  );
};
