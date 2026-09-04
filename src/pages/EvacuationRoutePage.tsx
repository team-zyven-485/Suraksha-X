import React, { useState } from 'react';
import {
  Navigation,
  ShieldCheck,
  Clock,
  MapPin,
  AlertTriangle,
  Route as RouteIcon,
  CheckCircle2,
  FileText,
  ShieldAlert,
  ArrowRight,
  ListOrdered,
  Printer,
  Satellite,
} from 'lucide-react';
import { useDisaster } from '../context/DisasterContext';
import { useSatellite } from '../context/SatelliteContext';
import { DisasterMap } from '../components/map/DisasterMap';
import { Badge } from '../components/common/Badge';
import { TurnByTurnModal } from '../components/modals/TurnByTurnModal';
import { EvacuationRoute } from '../types';

export const EvacuationRoutePage: React.FC = () => {
  const {
    routes,
    selectedRoute,
    setSelectedRoute,
    selectedZone,
    selectedShelter,
    setSelectedShelter,
    riskZones,
    reliefCentres,
    triggerRelocationWorkflow,
    setActivePage,
  } = useDisaster();

  const { hazard, getRouteEvaluation, routeRecommendation } = useSatellite();

  const [isTurnByTurnOpen, setIsTurnByTurnOpen] = useState(false);

  const primaryRoute = routes.find((r) => r.isRecommended) || routes[0];
  const candidateRoute = selectedRoute || primaryRoute;
  // Never display a route as active/recommended if satellite has rejected it
  // (BLOCKED) — computed at render time so this holds regardless of whether
  // the background auto-switch effect has run yet.
  const candidateEval = candidateRoute ? getRouteEvaluation(candidateRoute.id) : undefined;
  const satelliteSafeRoute = routeRecommendation?.recommended_route_id
    ? routes.find((r) => r.id === routeRecommendation.recommended_route_id)
    : null;
  const activeRoute = candidateEval?.rejected && satelliteSafeRoute ? satelliteSafeRoute : candidateRoute;
  // Derive the origin zone and destination shelter from the route that's
  // actually active, rather than trusting whatever selectedZone/selectedShelter
  // happen to be left over from earlier, unrelated navigation — those can
  // belong to a completely different zone or centre than this route.
  const originZone = (activeRoute && riskZones.find((z) => z.id === activeRoute.originId)) || selectedZone;
  const destinationShelter =
    (activeRoute && reliefCentres.find((s) => s.id === activeRoute.destinationId)) || selectedShelter;
  const vulnerableCount = originZone?.vulnerablePopulation ?? 0;

  if (!activeRoute) {
    return <div className="text-xs font-mono text-ink-faint p-6">Loading scenario data…</div>;
  }

  // The ROUTE SAFETY card must actually track the route's safety level —
  // it was previously hardcoded green regardless of whether the level was
  // HIGH, MODERATE, or LOW, so a genuinely risky route still looked "safe".
  const safetyColors =
    activeRoute.safetyLevel === 'HIGH'
      ? { bg: 'bg-safe-soft', border: 'border-safe/30', text: 'text-safe' }
      : activeRoute.safetyLevel === 'MODERATE'
      ? { bg: 'bg-warn-soft', border: 'border-warn/30', text: 'text-warn' }
      : { bg: 'bg-critical-soft', border: 'border-critical/30', text: 'text-critical' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-safe" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-safe font-semibold">
              GIS ROUTING ENGINE & INGRESS/EGRESS RESILIENCE
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-ink tracking-tight mt-0.5">
            Safe Evacuation Route
          </h1>
          <p className="text-xs text-ink-soft mt-1">
            Dynamic terrain routing avoiding submerged bridges, scouring culverts, and high-debris zones
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsTurnByTurnOpen(true)}
            className="px-3.5 py-1.5 rounded bg-surface hover:bg-paper-alt border border-hairline text-xs font-mono text-ink flex items-center gap-1.5 transition-colors"
          >
            <ListOrdered className="w-3.5 h-3.5 text-brand" />
            <span>View Turn-by-Turn</span>
          </button>

          <button
            id="btn-route-generate-plan"
            onClick={() => triggerRelocationWorkflow(originZone?.id, destinationShelter?.id, activeRoute.id)}
            className="px-4 py-1.5 rounded bg-critical hover:bg-critical/90 text-xs font-mono font-bold text-white shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>AUTHORIZE ACTION PLAN</span>
          </button>
        </div>
      </div>

      {/* ORIGIN & DESTINATION STRIP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Origin */}
        <div className="p-4 rounded-lg bg-surface border border-hairline flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-critical-soft border border-critical/30 text-critical shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase text-ink-faint block">
              ORIGIN ZONE (CRITICAL RISK)
            </span>
            <span className="text-sm font-bold font-mono text-ink">
              {activeRoute.originName}
            </span>
            <span className="text-[11px] font-mono text-critical block mt-0.5">
              {vulnerableCount.toLocaleString()} vulnerable citizens awaiting transit
            </span>
          </div>
        </div>

        {/* Destination */}
        <div className="p-4 rounded-lg bg-surface border border-hairline flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-safe-soft border border-safe/30 text-safe shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase text-ink-faint block">
              TARGET DESTINATION
            </span>
            <span className="text-sm font-bold font-mono text-ink">
              {activeRoute.destinationName}
            </span>
            <span className="text-[11px] font-mono text-safe block mt-0.5">
              {destinationShelter?.available ?? '—'} beds verified & medical triage active
            </span>
          </div>
        </div>
      </div>

      {/* SATELLITE ROUTE SAFETY BANNER */}
      {(() => {
        const evalResult = getRouteEvaluation(activeRoute.id);
        if (!evalResult) return null;
        const isRejected = evalResult.rejected;
        return (
          <div
            className={`p-3.5 rounded-lg border-2 flex items-center gap-3 ${
              isRejected
                ? 'bg-critical-soft border-critical/30'
                : evalResult.risk_status === 'AT_RISK'
                ? 'bg-warn-soft border-warn/30'
                : 'bg-safe-soft border-safe/30'
            }`}
          >
            <Satellite className={`w-5 h-5 shrink-0 ${isRejected ? 'text-critical' : evalResult.risk_status === 'AT_RISK' ? 'text-warn' : 'text-safe'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono font-bold text-ink">
                Satellite-Informed Route Safety: {evalResult.risk_status.replace('_', ' ')}
                {hazard?.data_mode === 'DEMO' && <span className="text-warn ml-1.5">(DEMO DATA)</span>}
              </div>
              <div className="text-[11px] text-ink-soft mt-0.5">
                {isRejected
                  ? 'This corridor intersects the satellite-derived hazard extent and has been rejected — a safer alternative is recommended below.'
                  : evalResult.risk_status === 'AT_RISK'
                  ? 'This corridor partially intersects the satellite-derived hazard extent. Proceed with caution.'
                  : 'No significant satellite-derived hazard intersection on this corridor.'}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ROUTE SUMMARY METRICS (5 Metric Cards from prompt) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-lg bg-surface border border-hairline text-center font-mono">
          <span className="text-[10px] text-ink-faint uppercase block">DISTANCE</span>
          <span className="text-2xl font-bold text-ink mt-0.5">{activeRoute.distanceKm} km</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">Direct Corridor</span>
        </div>

        <div className="p-3.5 rounded-lg bg-surface border border-hairline text-center font-mono">
          <span className="text-[10px] text-ink-faint uppercase block">ESTIMATED TIME</span>
          <span className="text-2xl font-bold text-ink mt-0.5">{activeRoute.estimatedTimeMin} min</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">High clearance convoy</span>
        </div>

        <div className={`p-3.5 rounded-lg ${safetyColors.bg} border ${safetyColors.border} text-center font-mono`}>
          <span className={`text-[10px] ${safetyColors.text} uppercase block font-semibold`}>ROUTE SAFETY</span>
          <span className={`text-2xl font-bold ${safetyColors.text} mt-0.5`}>{activeRoute.safetyLevel}</span>
          <span className={`text-[10px] ${safetyColors.text} block mt-0.5`}>Score: {activeRoute.safetyScore}/100</span>
        </div>

        <div className="p-3.5 rounded-lg bg-critical-soft border border-critical/30 text-center font-mono">
          <span className="text-[10px] text-critical uppercase block font-semibold">BLOCKED ROADS</span>
          <span className="text-2xl font-bold text-critical mt-0.5">{activeRoute.blockedRoadsCount}</span>
          <span className="text-[10px] text-critical block mt-0.5">Hazards Bypassed</span>
        </div>

        <div className="p-3.5 rounded-lg bg-surface border border-hairline text-center font-mono col-span-2 sm:col-span-1">
          <span className="text-[10px] text-ink-faint uppercase block">ALTERNATIVE ROUTES</span>
          <span className="text-2xl font-bold text-brand mt-0.5">{routes.length - 1}</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">Standby Options</span>
        </div>
      </div>

      {/* MAP VIEW & ROUTE SELECTOR GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* GIS MAP CONTAINER (8 Cols) */}
        <div className="xl:col-span-8 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-ink-soft uppercase">
              GIS Vector Evacuation Corridor Visualization
            </span>
            <span className="text-xs font-mono text-safe">
              Active: {activeRoute.isRecommended ? 'Primary Recommended Corridor' : 'Alternative Corridor'}
            </span>
          </div>
          <DisasterMap heightClass="h-[440px] lg:h-[500px]" />
        </div>

        {/* ROUTE SELECTOR & TURN-BY-TURN PREVIEW (4 Cols) */}
        <div className="xl:col-span-4 space-y-4">
          <div className="p-4 rounded-lg bg-surface border border-hairline shadow-xl space-y-3">
            <h3 className="text-sm font-bold font-mono text-ink border-b border-hairline pb-2">
              Select Evacuation Corridor
            </h3>

            <div className="space-y-2.5">
              {routes.map((route) => {
                const isSelected = activeRoute.id === route.id;
                const routeEval = getRouteEvaluation(route.id);
                return (
                  <div
                    key={route.id}
                    onClick={() => {
                      setSelectedRoute(route);
                      const matchingCentre = reliefCentres.find((s) => s.id === route.destinationId);
                      if (matchingCentre) setSelectedShelter(matchingCentre);
                    }}
                    className={`p-3 rounded-lg border text-xs font-mono cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-brand-soft border-brand ring-1 ring-brand shadow-lg'
                        : 'bg-inset border-hairline hover:border-hairline'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold text-ink">
                        {route.isRecommended ? '★ Primary Recommended Corridor' : 'Alternative Corridor'}
                      </span>
                      <div className="flex items-center gap-1">
                        {routeEval && (
                          <Badge variant={routeEval.rejected ? 'critical' : routeEval.risk_status === 'AT_RISK' ? 'moderate' : 'safe'} size="sm">
                            <Satellite className="w-2.5 h-2.5" />
                          </Badge>
                        )}
                        <Badge
                          variant={route.safetyLevel === 'HIGH' ? 'safe' : 'moderate'}
                          size="sm"
                        >
                          {route.safetyLevel}
                        </Badge>
                      </div>
                    </div>

                    <div className="text-[11px] text-ink-soft mb-2">
                      Via {route.originName.split(' (')[0]} → {route.destinationName.split(' (')[0]}
                    </div>

                    <div className="flex justify-between text-[11px] pt-2 border-t border-hairline text-ink-soft">
                      <span>Distance: {route.distanceKm} km</span>
                      <span>ETA: {route.estimatedTimeMin} min</span>
                      <span className="text-safe">Safety: {route.safetyScore}%</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-hairline space-y-2">
              <button
                onClick={() => setIsTurnByTurnOpen(true)}
                className="w-full py-2 px-3 rounded bg-paper-alt hover:bg-paper-alt text-ink text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>VIEW TURN-BY-TURN PLAN</span>
              </button>

              <button
                onClick={() => triggerRelocationWorkflow(originZone?.id, destinationShelter?.id, activeRoute.id)}
                className="w-full py-2.5 px-3 rounded bg-critical hover:bg-critical/90 text-white text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-colors"
              >
                <span>GENERATE EVACUATION PLAN →</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Turn-by-Turn Modal */}
      <TurnByTurnModal isOpen={isTurnByTurnOpen} onClose={() => setIsTurnByTurnOpen(false)} />
    </div>
  );
};
