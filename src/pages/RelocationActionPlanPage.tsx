import React, { useState } from 'react';
import {
  FileCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Radio,
  MapPin,
  Building,
  Navigation,
  Send,
  Printer,
  Download,
  Share2,
  Check,
  AlertCircle,
  Sparkles,
  Database,
  FileText,
} from 'lucide-react';
import { useDisaster } from '../context/DisasterContext';
import { Badge } from '../components/common/Badge';
import { ZyvenLogo } from '../components/common/ZyvenLogo';
import { ExportDirectiveModal } from '../components/modals/ExportDirectiveModal';
import { CapBroadcastModal } from '../components/modals/CapBroadcastModal';
import { persistRelocationPlan, isSupabaseConnected } from '../lib/supabase';

export const RelocationActionPlanPage: React.FC = () => {
  const {
    activePlan,
    updateChecklistStep,
    addToast,
    triggerRelocationWorkflow,
    selectedZone,
    selectedShelter,
    selectedRoute,
    setActivePage,
    printOrder,
    scenarioMeta,
  } = useDisaster();

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isCapModalOpen, setIsCapModalOpen] = useState(false);
  const [isSavingDb, setIsSavingDb] = useState(false);

  // If no active plan yet, build a live preview from current scenario selections
  const plan =
    activePlan ||
    (selectedZone && selectedShelter && selectedRoute
      ? {
          id: `PLAN-PREVIEW-${scenarioMeta.id}`,
          zoneId: selectedZone.id,
          zoneName: selectedZone.name,
          riskScore: selectedZone.riskScore,
          priority: selectedZone.priority,
          totalPopulation: selectedZone.population,
          vulnerablePopulation: selectedZone.vulnerablePopulation,
          recommendedShelter: selectedShelter,
          alternativeShelters: [],
          primaryRoute: selectedRoute,
          alternativeRoutes: [],
          reasoning: selectedZone.reasoning,
          generatedAt: scenarioMeta.lastUpdated,
          status: 'PROPOSED' as const,
          checklist: [
            {
              id: 'chk-preview-1',
              task: `Notify local emergency response team & community leaders in ${selectedZone.name}`,
              assignee: 'NDRF Quick Response Team Alpha',
              status: 'PENDING' as const,
              priority: 'CRITICAL' as const,
              estimatedTime: 'Pending authorization',
            },
            {
              id: 'chk-preview-2',
              task: `Prepare ${selectedShelter.code} (${selectedShelter.name}) reception beds & triage`,
              assignee: `${selectedShelter.contactOfficer.name} (${selectedShelter.contactOfficer.designation})`,
              status: 'PENDING' as const,
              priority: 'CRITICAL' as const,
              estimatedTime: 'Pending authorization',
            },
            {
              id: 'chk-preview-3',
              task: 'Clear recommended evacuation corridor & post traffic marshals',
              assignee: 'Traffic Control Division / State Police',
              status: 'PENDING' as const,
              priority: 'HIGH' as const,
              estimatedTime: 'Pending authorization',
            },
          ],
        }
      : null);

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-3">
        <FileCheck className="w-10 h-10 text-ink-faint" />
        <h2 className="text-sm font-bold font-mono text-ink-soft">No Active Relocation Plan</h2>
        <p className="text-xs text-ink-faint font-mono max-w-sm">
          Select a risk zone and trigger the relocation workflow to generate an authorized action plan.
        </p>
        <button
          onClick={() => setActivePage('risk-intelligence')}
          className="px-4 py-2 rounded bg-critical hover:bg-critical/90 text-xs font-mono font-bold text-white"
        >
          Go to Risk Intelligence →
        </button>
      </div>
    );
  }

  const handleSaveToDatabase = async () => {
    setIsSavingDb(true);
    const result = await persistRelocationPlan(plan);
    setIsSavingDb(false);
    if (result.source === 'supabase') {
      addToast('success', 'Synchronized to Supabase', `Relocation Plan #${plan.id} saved in cloud database.`);
    } else {
      addToast('info', 'Saved to Local Persistence', `Relocation Plan #${plan.id} saved locally. (Connect Supabase in .env to sync to cloud)`);
    }
  };

  const completedCount = plan.checklist.filter((s) => s.status === 'COMPLETED').length;
  const progressPercent = Math.round((completedCount / plan.checklist.length) * 100);
  const isAuthorized = plan.status === 'AUTHORIZED';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ZyvenLogo variant="horizontal" size="sm" showText={true} />
            <span className="text-ink-faint">•</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isAuthorized ? 'bg-critical animate-ping' : 'bg-warn'}`}></span>
              <span className={`text-[11px] font-mono uppercase tracking-widest font-semibold ${isAuthorized ? 'text-critical' : 'text-warn'}`}>
                {isAuthorized ? 'OFFICIAL DISASTER RELOCATION DIRECTIVE' : 'PROPOSED PLAN — NOT YET AUTHORIZED'}
              </span>
            </div>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-ink tracking-tight mt-0.5">
            RELOCATION ACTION PLAN
          </h1>
          <p className="text-xs text-ink-soft mt-1 font-sans">
            Incident Command Protocol #{plan.id} • {isAuthorized ? 'Authorized under Admin Incident Command' : 'Preview — authorize to activate this plan'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSaveToDatabase}
            disabled={isSavingDb}
            className="px-3 py-1.5 rounded bg-surface hover:bg-paper-alt border border-hairline text-xs font-mono text-ink flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Save to Supabase Database"
          >
            <Database className="w-3.5 h-3.5 text-brand" />
            <span>{isSavingDb ? 'Saving...' : (isSupabaseConnected() ? 'Synced to Supabase' : 'Save Plan')}</span>
          </button>
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="px-3 py-1.5 rounded bg-surface hover:bg-paper-alt border border-brand/30 text-xs font-mono text-brand flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-brand" />
            <span>Export (PDF, DOC, TXT)</span>
          </button>
          {isAuthorized ? (
            <button
              onClick={() => setIsCapModalOpen(true)}
              className="px-4 py-1.5 rounded bg-critical hover:bg-critical/90 text-xs font-mono font-bold text-white shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Broadcast CAP Order</span>
            </button>
          ) : (
            <button
              onClick={() => triggerRelocationWorkflow(selectedZone?.id)}
              className="px-4 py-1.5 rounded bg-warn hover:bg-warn/90 text-xs font-mono font-bold text-white shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              title="A plan must be authorized before it can be broadcast"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Authorize Relocation Plan</span>
            </button>
          )}
        </div>
      </div>

      {/* TOP EMERGENCY CALLOUT BANNER */}
      <div className={`p-4 rounded-lg shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-2 ${
        isAuthorized ? 'bg-critical-soft border-critical/30' : 'bg-warn-soft border-warn/30'
      }`}>
        <div className="flex items-start sm:items-center gap-3">
          <div className={`p-3 rounded-lg text-white font-black shrink-0 ${isAuthorized ? 'bg-critical' : 'bg-warn'}`}>
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm sm:text-base font-black font-mono uppercase tracking-wide ${isAuthorized ? 'text-critical' : 'text-warn'}`}>
                {isAuthorized ? '🔴 CRITICAL — IMMEDIATE ACTION REQUIRED' : '🟡 AWAITING AUTHORIZATION'}
              </span>
              <Badge variant={isAuthorized ? 'critical' : 'moderate'} size="sm">
                {isAuthorized ? 'TIER-1 DIRECTIVE' : 'PROPOSED'}
              </Badge>
            </div>
            <p className="text-xs text-ink-soft font-sans mt-0.5">
              {isAuthorized
                ? `${scenarioMeta.name} — hazard severity exceeding safety threshold. Mandatory phased relocation of ${plan.vulnerablePopulation.toLocaleString()} priority citizens from ${plan.zoneName}.`
                : `Preview based on current selections for ${plan.zoneName}. Click "Authorize Relocation Plan" to activate and dispatch this directive.`}
            </p>
          </div>
        </div>

        <div className="text-right font-mono text-xs">
          <div className="text-ink-soft">PLAN ID: <span className="text-ink font-bold">{plan.id}</span></div>
          <div className={`font-semibold mt-0.5 ${isAuthorized ? 'text-safe' : 'text-warn'}`}>
            ● EXECUTION STATUS: {isAuthorized ? 'ACTIVE' : 'PROPOSED'}
          </div>
        </div>
      </div>

      {/* KEY SPECIFICATIONS GRID (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Affected Area */}
        <div className="p-4 rounded-lg bg-surface border border-hairline space-y-1.5">
          <div className="text-ink-faint text-[10px] font-mono uppercase">AFFECTED AREA</div>
          <div className="text-base font-bold font-mono text-ink">{plan.zoneName}</div>
          <div className="text-xs font-mono text-ink-soft">
            Total Pop: <span className="text-ink font-semibold">{plan.totalPopulation.toLocaleString()}</span>
          </div>
        </div>

        {/* Priority Population */}
        <div className="p-4 rounded-lg bg-critical-soft border border-critical/30 space-y-1.5">
          <div className="text-critical text-[10px] font-mono uppercase font-semibold">PRIORITY POPULATION</div>
          <div className="text-2xl font-bold font-mono text-critical">
            {plan.vulnerablePopulation.toLocaleString()}
          </div>
          <div className="text-[11px] font-mono text-critical">Elderly, Children, Mobility-Impaired</div>
        </div>

        {/* Recommended Shelter */}
        <div className="p-4 rounded-lg bg-surface border border-hairline space-y-1.5">
          <div className="text-ink-faint text-[10px] font-mono uppercase">ASSIGNED SHELTER</div>
          <div className="text-sm font-bold font-mono text-ink truncate" title={plan.recommendedShelter.name}>
            {plan.recommendedShelter.name}
          </div>
          <div className="text-xs font-mono text-safe font-semibold">
            {plan.recommendedShelter.available} Beds Available
          </div>
        </div>

        {/* Evacuation Route */}
        <div className="p-4 rounded-lg bg-surface border border-hairline space-y-1.5">
          <div className="text-ink-faint text-[10px] font-mono uppercase">PRIMARY CORRIDOR</div>
          <div className="text-sm font-bold font-mono text-ink truncate">
            {plan.primaryRoute.destinationName}
          </div>
          <div className="text-xs font-mono text-brand">
            {plan.primaryRoute.distanceKm} km • Est: {plan.primaryRoute.estimatedTimeMin} min
          </div>
          {plan.primaryRoute.id.startsWith('direct-') && (
            <div className="text-[10px] font-mono text-warn">
              Direct-line estimate — not a ground-vetted corridor
            </div>
          )}
        </div>
      </div>

      {/* EXPLAINABLE REASONING BLOCK */}
      <div className="p-4 rounded-lg bg-brand-soft border border-brand/30 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand" />
          <span className="text-xs font-mono font-bold text-brand uppercase">
            MULTI-HAZARD & DEMOGRAPHIC REASONING MATRIX
          </span>
        </div>
        <p className="text-xs text-ink-soft font-sans leading-relaxed">
          {plan.reasoning}
        </p>
      </div>

      {/* OPERATIONAL CHECKLIST */}
      <div className="p-5 rounded-lg bg-surface border border-hairline space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-3">
          <div>
            <h2 className="text-sm font-bold font-mono text-ink uppercase tracking-wider">
              MANDATORY OPERATIONAL CHECKLIST
            </h2>
            <p className="text-xs text-ink-soft font-sans mt-0.5">
              {isAuthorized
                ? 'Multi-agency sequential response coordination. Click checkboxes to update status.'
                : 'Preview only — authorize the plan to begin updating checklist status.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-ink-soft">
              {completedCount}/{plan.checklist.length} Completed ({progressPercent}%)
            </span>
            <div className="w-24 h-2 rounded-full bg-paper-alt overflow-hidden">
              <div
                className="h-full bg-safe transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-hairline">
          {plan.checklist.map((step, idx) => {
            const isCompleted = step.status === 'COMPLETED';
            const isInProgress = step.status === 'IN_PROGRESS';
            return (
              <div
                key={step.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-paper-alt px-2 rounded transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    onClick={() =>
                      isAuthorized &&
                      updateChecklistStep(
                        step.id,
                        isCompleted ? 'IN_PROGRESS' : isInProgress ? 'COMPLETED' : 'IN_PROGRESS'
                      )
                    }
                    disabled={!isAuthorized}
                    title={isAuthorized ? undefined : 'Authorize the plan to update checklist steps'}
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                      !isAuthorized ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                    } ${
                      isCompleted
                        ? 'bg-safe border-safe text-white'
                        : isInProgress
                        ? 'bg-brand-soft border-brand text-brand'
                        : 'border-hairline bg-surface text-transparent hover:border-ink-faint/40'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : isInProgress ? (
                      <Clock className="w-3.5 h-3.5" />
                    ) : null}
                  </button>

                  <div className="min-w-0">
                    <div
                      className={`text-xs font-sans ${
                        isCompleted ? 'text-ink-soft line-through' : 'text-ink font-medium'
                      }`}
                    >
                      {step.task}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-soft font-mono mt-0.5">
                      <span>Unit: <span className="text-ink-soft">{step.assignee}</span></span>
                      <span>•</span>
                      <span>Est: <span className="text-ink-soft">{step.estimatedTime}</span></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Badge
                    variant={
                      isCompleted
                        ? 'safe'
                        : isInProgress
                        ? 'info'
                        : step.priority === 'CRITICAL'
                        ? 'critical'
                        : 'neutral'
                    }
                    size="sm"
                  >
                    {step.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BOTTOM ACTION BUTTONS */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg bg-surface border border-hairline">
        <div className="flex items-center gap-2 text-xs font-mono text-ink-soft">
          <Radio className="w-4 h-4 text-safe" />
          <span>Continuous telemetry feedback active with {scenarioMeta.region} command net</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActivePage('evacuation-routes')}
            className="px-3.5 py-2 rounded bg-surface hover:bg-paper-alt border border-hairline text-xs font-mono text-ink cursor-pointer"
          >
            Inspect Route on GIS Map →
          </button>
          <button
            onClick={() => setActivePage('relief-centres')}
            className="px-3.5 py-2 rounded bg-surface hover:bg-paper-alt border border-hairline text-xs font-mono text-ink cursor-pointer"
          >
            Relief Centre Network →
          </button>
        </div>
      </div>

      {/* Modals */}
      <ExportDirectiveModal
        plan={plan}
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />

      <CapBroadcastModal
        plan={plan}
        isOpen={isCapModalOpen}
        onClose={() => setIsCapModalOpen(false)}
      />
    </div>
  );
};
