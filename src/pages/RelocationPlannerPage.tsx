import React, { useState } from 'react';
import {
  Compass,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  Building,
  Navigation,
  Sparkles,
  MapPin,
  Users,
  AlertTriangle,
  Flame,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { useDisaster } from '../context/DisasterContext';
import { useSatellite } from '../context/SatelliteContext';
import { Badge } from '../components/common/Badge';
import { ReliefCentre, RiskZone } from '../types';

export const RelocationPlannerPage: React.FC = () => {
  const {
    riskZones,
    reliefCentres,
    selectedZone,
    setSelectedZone,
    selectedShelter,
    setSelectedShelter,
    triggerRelocationWorkflow,
    setActivePage,
  } = useDisaster();
  const { isZoneInHazardExtent, hazard } = useSatellite();

  const [activeZoneId, setActiveZoneId] = useState<string>(selectedZone?.id || '');

  const currentZone: RiskZone =
    riskZones.find((z) => z.id === activeZoneId) ||
    selectedZone ||
    [...riskZones].sort((a, b) => b.riskScore - a.riskScore)[0];

  // Priority: SAFETY > CAPACITY > ACCESSIBILITY > DISTANCE. A centre sitting
  // inside the satellite-derived hazard extent is heavily penalized so it is
  // never recommended while a safer alternative exists.
  const rankedCentres = [...reliefCentres].sort((a, b) => {
    const aInHazard = isZoneInHazardExtent(a.coordinates.lat, a.coordinates.lng);
    const bInHazard = isZoneInHazardExtent(b.coordinates.lat, b.coordinates.lng);
    const aScore = a.safetyScore * 0.4 + (a.available > 0 ? 30 : 0) + (1 / (a.distanceKm || 10)) * 30 - (aInHazard ? 200 : 0);
    const bScore = b.safetyScore * 0.4 + (b.available > 0 ? 30 : 0) + (1 / (b.distanceKm || 10)) * 30 - (bInHazard ? 200 : 0);
    return bScore - aScore;
  });

  const recommendedCentre: ReliefCentre = rankedCentres.find((s) => s.available > 0) || rankedCentres[0];

  const alternativeCentres: ReliefCentre[] = rankedCentres.filter(
    (s) => s.id !== recommendedCentre.id
  );

  const handleSelectZone = (zoneId: string) => {
    setActiveZoneId(zoneId);
    const z = riskZones.find((item) => item.id === zoneId);
    if (z) setSelectedZone(z);
  };

  const handlePlanAction = (shelter: ReliefCentre) => {
    setSelectedShelter(shelter);
    triggerRelocationWorkflow(currentZone.id, shelter.id);
  };

  if (!currentZone || !recommendedCentre) {
    return <div className="text-xs font-mono text-ink-faint p-6">Loading scenario data…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-brand" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-brand font-semibold">
              OPTIMAL FACILITY ALLOCATION & MATCHING
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-ink tracking-tight mt-0.5">
            Relocation Planner
          </h1>
          <p className="text-xs text-ink-soft mt-1">
            Matching hazard-threatened communities with resilient, capacity-verified relief shelters
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActivePage('evacuation-routes')}
            className="px-3.5 py-1.5 rounded bg-surface hover:bg-paper-alt border border-hairline text-xs font-mono text-ink-soft flex items-center gap-1.5"
          >
            <Navigation className="w-3.5 h-3.5 text-safe" />
            <span>Evacuation Routes</span>
          </button>
          <button
            id="btn-plan-relocation-hero"
            onClick={() => handlePlanAction(recommendedCentre)}
            className="px-4 py-1.5 rounded bg-critical hover:bg-critical/90 text-xs font-mono font-bold text-white shadow-sm flex items-center gap-1.5"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>AUTHORIZE RELOCATION PLAN</span>
          </button>
        </div>
      </div>

      {/* SELECTED ORIGIN ZONE SUMMARY BAR */}
      <div className="p-4 rounded-lg bg-surface border border-hairline shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-3 rounded-lg bg-critical-soft border border-critical/30 text-critical shrink-0">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-ink-soft uppercase">Selected Area:</span>
                <span className="text-sm font-mono font-bold text-ink">{currentZone.name}</span>
                <Badge variant={currentZone.riskLevel.toLowerCase() as any} size="sm" dot>
                  {currentZone.riskLevel} — {currentZone.riskScore}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-ink-soft mt-1.5">
                <div>
                  Total Pop: <span className="text-ink font-bold">{currentZone.population.toLocaleString()}</span>
                </div>
                <div>
                  Vulnerable Pop: <span className="text-critical font-bold">{currentZone.vulnerablePopulation.toLocaleString()}</span>
                </div>
                <div>
                  Hazard Intensity: <span className="text-warn font-bold">+{currentZone.floodDepthEstMeters}m</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick zone switcher buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] font-mono text-ink-faint uppercase shrink-0">Change Zone:</span>
            {riskZones.slice(0, 4).map((z) => (
              <button
                key={z.id}
                onClick={() => handleSelectZone(z.id)}
                className={`px-2 py-1 rounded text-[11px] font-mono whitespace-nowrap transition-colors ${
                  z.id === currentZone.id
                    ? 'bg-brand text-white font-bold'
                    : 'bg-paper text-ink-soft hover:text-ink border border-hairline'
                }`}
              >
                {z.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* HERO SECTION: RECOMMENDED RELOCATION CENTRE CARD */}
      <div className="relative p-6 rounded-xl bg-safe-soft border-2 border-safe/30 shadow-sm space-y-5">
        {/* Floating RECOMMENDED pill */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-4">
          <div className="flex items-center gap-2.5">
            <span className="px-3 py-1 rounded-full bg-safe text-white text-xs font-mono font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>RECOMMENDED RELOCATION CENTRE</span>
            </span>
            <span className="text-xs font-mono text-safe font-semibold">
              BEST MULTI-FACTOR MATCH
            </span>
          </div>

          <Badge variant="safe" size="md" dot>
            Capacity Available
          </Badge>
        </div>

        {/* Shelter details */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-6 space-y-2">
            <div className="text-xs font-mono text-ink-soft">{recommendedCentre.code}</div>
            <h2 className="text-xl sm:text-2xl font-bold font-mono text-ink tracking-tight">
              {recommendedCentre.name}
            </h2>
            <div className="flex items-center gap-2 text-xs font-mono text-ink-soft">
              <MapPin className="w-3.5 h-3.5 text-brand" />
              <span>{recommendedCentre.location}</span>
            </div>

            <p className="text-xs text-ink-soft font-sans pt-2 leading-relaxed">
              {recommendedCentre.facilities.medicalUnit ? 'Equipped with on-site medical unit, ' : ''}
              {recommendedCentre.facilities.backupPower ? 'backup power generation, ' : ''}
              {recommendedCentre.facilities.wheelchairAccessible ? 'wheelchair access ramps, ' : ''}
              and {recommendedCentre.facilities.foodRationsDays}-day food reserves. Elevated at +{recommendedCentre.elevationMeters}m with a verified safety score of {recommendedCentre.safetyScore}/100.
            </p>
          </div>

          {/* Metric Badges */}
          <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
            <div className="p-3 rounded-lg bg-inset border border-hairline">
              <span className="text-[10px] text-ink-faint block">DISTANCE</span>
              <span className="text-lg font-bold text-ink">{recommendedCentre.distanceKm} km</span>
              <span className="text-[10px] text-ink-soft block mt-0.5">~{recommendedCentre.travelTimeMin} min transit</span>
            </div>
            <div className="p-3 rounded-lg bg-inset border border-hairline">
              <span className="text-[10px] text-ink-faint block">TOTAL CAPACITY</span>
              <span className="text-lg font-bold text-ink">
                {recommendedCentre.capacity.toLocaleString()}
              </span>
              <span className="text-[10px] text-ink-soft block mt-0.5">Approved beds</span>
            </div>
            <div className="p-3 rounded-lg bg-inset border border-hairline">
              <span className="text-[10px] text-ink-faint block">OCCUPANCY</span>
              <span className="text-lg font-bold text-warn">
                {recommendedCentre.occupancy.toLocaleString()}
              </span>
              <span className="text-[10px] text-ink-soft block mt-0.5">
                {Math.round((recommendedCentre.occupancy / recommendedCentre.capacity) * 100)}% filled
              </span>
            </div>
            <div className="p-3 rounded-lg bg-safe-soft border border-safe/30">
              <span className="text-[10px] text-safe font-bold block">AVAILABLE</span>
              <span className="text-xl font-bold text-safe">
                {recommendedCentre.available}
              </span>
              <span className="text-[10px] text-safe block mt-0.5">
                {recommendedCentre.available >= currentZone.vulnerablePopulation ? 'Exact Match' : 'Partial Capacity'}
              </span>
            </div>
          </div>
        </div>

        {/* Explainable Reasoning Block */}
        <div className="p-3.5 rounded-lg bg-brand-soft border border-brand/30 text-xs font-mono space-y-1">
          <div className="flex items-center gap-1.5 text-brand font-bold">
            <ShieldCheck className="w-4 h-4 text-safe" />
            <span>Why {recommendedCentre.code} is Recommended:</span>
          </div>
          <p className="text-ink-soft font-sans text-xs leading-relaxed">
            1. <strong>Capacity:</strong> {recommendedCentre.available} verified available beds against {currentZone.vulnerablePopulation} priority vulnerable citizens in {currentZone.name}.<br />
            2. <strong>Distance & Safety:</strong> {recommendedCentre.distanceKm} km transit with a {recommendedCentre.safetyScore}/100 facility safety rating.<br />
            3. <strong>Elevated Staging:</strong> Sited at +{recommendedCentre.elevationMeters}m altitude with {recommendedCentre.facilities.medicalUnit ? 'full emergency triage capabilities' : 'community support facilities'} and {(recommendedCentre.facilities.cleanWaterLiters / 1000).toFixed(0)}kL water reserves.
          </p>
        </div>

        {/* CTA Banner */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <div className="text-xs font-mono text-ink-soft flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Facility Commander: {recommendedCentre.contactOfficer.name} ({recommendedCentre.contactOfficer.designation})</span>
          </div>

          <button
            id="btn-confirm-relocation-centre-03"
            onClick={() => handlePlanAction(recommendedCentre)}
            className="py-2.5 px-6 rounded-lg bg-critical hover:bg-critical/90 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <span>GENERATE RELOCATION ACTION PLAN →</span>
          </button>
        </div>
      </div>

      {/* ALTERNATIVE RELIEF CENTRES RANKED SECTION */}
      <div className="p-5 rounded-lg bg-surface border border-hairline shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-hairline pb-2.5">
          <div>
            <h3 className="text-sm font-bold font-mono text-ink">
              Alternative Relocation Centres (Ranked by Multi-Criteria Safety)
            </h3>
            <p className="text-xs text-ink-soft">
              Evaluated on Safety Index, Available Capacity, Distance, and Road Accessibility
            </p>
          </div>
          <span className="text-xs font-mono text-ink-soft">{alternativeCentres.length} Alternatives</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {alternativeCentres.map((shelter, idx) => {
            const isFull = shelter.status === 'FULL';
            const isNearCap = shelter.status === 'NEAR_CAPACITY';

            return (
              <div
                key={shelter.id}
                className="p-4 rounded-lg bg-inset border border-hairline flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono mb-1">
                    <span className="text-ink-faint">Option #{idx + 2}</span>
                    <Badge
                      variant={isFull ? 'critical' : isNearCap ? 'moderate' : 'safe'}
                      size="sm"
                    >
                      {shelter.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  <h4 className="text-sm font-bold font-mono text-ink leading-tight">
                    {shelter.name}
                  </h4>
                  <div className="text-[11px] text-ink-soft font-mono mt-1">
                    {shelter.location}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-xs font-mono">
                    <div className="p-1.5 rounded bg-surface border border-hairline">
                      <span className="text-[9px] text-ink-faint block">DIST</span>
                      <span className="font-bold text-ink">{shelter.distanceKm} km</span>
                    </div>
                    <div className="p-1.5 rounded bg-surface border border-hairline">
                      <span className="text-[9px] text-ink-faint block">AVAIL</span>
                      <span
                        className={`font-bold ${
                          shelter.available > 0 ? 'text-safe' : 'text-critical'
                        }`}
                      >
                        {shelter.available}
                      </span>
                    </div>
                    <div className="p-1.5 rounded bg-surface border border-hairline">
                      <span className="text-[9px] text-ink-faint block">SAFETY</span>
                      <span className="font-bold text-brand">{shelter.safetyScore}/100</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-hairline flex items-center justify-between">
                  <span className="text-[10px] font-mono text-ink-faint">
                    Travel: ~{shelter.travelTimeMin} min
                  </span>
                  <button
                    onClick={() => handlePlanAction(shelter)}
                    disabled={shelter.available === 0}
                    className="px-2.5 py-1 rounded bg-paper-alt hover:bg-paper-alt disabled:opacity-40 disabled:cursor-not-allowed text-ink text-xs font-mono transition-colors"
                  >
                    Select Alternative
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
