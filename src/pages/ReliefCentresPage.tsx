import React, { useState } from 'react';
import {
  Building2,
  Filter,
  Search,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Droplet,
  HeartPulse,
  Zap,
  Accessibility,
  Compass,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { useDisaster } from '../context/DisasterContext';
import { Badge } from '../components/common/Badge';
import { ShelterStatus, ReliefCentre } from '../types';

export const ReliefCentresPage: React.FC = () => {
  const { reliefCentres, selectedShelter, setSelectedShelter, triggerRelocationWorkflow, setActivePage } =
    useDisaster();

  const [activeFilter, setActiveFilter] = useState<'ALL' | ShelterStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredShelters = reliefCentres.filter((shelter) => {
    const matchesFilter = activeFilter === 'ALL' || shelter.status === activeFilter;
    const matchesSearch =
      shelter.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shelter.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shelter.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalCapacity = reliefCentres.reduce((acc, s) => acc + s.capacity, 0);
  const totalOccupancy = reliefCentres.reduce((acc, s) => acc + s.occupancy, 0);
  const totalAvailable = totalCapacity - totalOccupancy;

  const recommendedShelterId = [...reliefCentres].sort((a, b) => {
    const aScore = a.safetyScore * 0.4 + (a.available > 0 ? 30 : 0) + (1 / (a.distanceKm || 10)) * 30;
    const bScore = b.safetyScore * 0.4 + (b.available > 0 ? 30 : 0) + (1 / (b.distanceKm || 10)) * 30;
    return bScore - aScore;
  })[0]?.id;

  const handleSelect = (shelter: ReliefCentre) => {
    setSelectedShelter(shelter);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-safe" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-safe font-semibold">
              SHELTER INFRASTRUCTURE & CAPACITY INVENTORY
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-ink tracking-tight mt-0.5">
            Relief Centre Network
          </h1>
          <p className="text-xs text-ink-soft mt-1">
            Real-time occupancy tracking, logistical supply stockpiles, and medical unit availability
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActivePage('relocation-planner')}
            className="px-3.5 py-1.5 rounded bg-brand hover:bg-brand/90 text-xs font-mono font-bold text-white shadow-sm"
          >
            Allocate in Planner →
          </button>
        </div>
      </div>

      {/* SUMMARY METRICS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block">TOTAL OPERATIONAL CENTRES</span>
          <span className="text-2xl font-bold text-ink mt-1">{reliefCentres.length} Sites</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">Regional Network Nodes</span>
        </div>

        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block">TOTAL CAPACITY</span>
          <span className="text-2xl font-bold text-ink mt-1">{totalCapacity.toLocaleString()}</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">Approved beds</span>
        </div>

        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block">CURRENT OCCUPANCY</span>
          <span className="text-2xl font-bold text-warn mt-1">{totalOccupancy.toLocaleString()}</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">
            {Math.round((totalOccupancy / totalCapacity) * 100)}% utilized
          </span>
        </div>

        <div className="p-4 rounded-lg bg-safe-soft border border-safe/30 font-mono">
          <span className="text-[10px] text-safe uppercase font-semibold block">AVAILABLE BEDS</span>
          <span className="text-2xl font-bold text-safe mt-1">{totalAvailable.toLocaleString()}</span>
          <span className="text-[10px] text-safe block mt-0.5">Ready for intake</span>
        </div>
      </div>

      {/* FILTER TABS & SEARCH */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-3 rounded-lg border border-hairline">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'AVAILABLE', 'NEAR_CAPACITY', 'FULL', 'UNAVAILABLE'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-3 py-1.5 rounded text-xs font-mono font-medium whitespace-nowrap transition-colors ${
                activeFilter === filter
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-ink-soft hover:text-ink hover:bg-paper-alt'
              }`}
            >
              {filter === 'ALL'
                ? `All Centres (${reliefCentres.length})`
                : filter.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-ink-soft absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search relief centres..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-paper border border-hairline rounded pl-8 pr-3 py-1.5 text-xs text-ink font-mono focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      {/* TABLE */}
      <div className="p-4 rounded-lg bg-surface border border-hairline shadow-xl space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-hairline bg-inset text-ink-soft uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3">Centre Name & Code</th>
                <th className="py-3 px-3">Location Sector</th>
                <th className="py-3 px-3">Capacity</th>
                <th className="py-3 px-3">Occupancy Bar</th>
                <th className="py-3 px-3">Available</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Key Facilities</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filteredShelters.map((shelter) => {
                const isSelected = selectedShelter?.id === shelter.id;
                const occupancyRate = Math.round((shelter.occupancy / shelter.capacity) * 100);
                const isRecommended = shelter.id === recommendedShelterId;

                return (
                  <tr
                    key={shelter.id}
                    onClick={() => handleSelect(shelter)}
                    className={`hover:bg-paper-alt cursor-pointer transition-colors ${
                      isSelected ? 'bg-brand-soft' : ''
                    } ${isRecommended ? 'bg-safe-soft' : ''}`}
                  >
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-ink font-bold text-sm">
                          {shelter.name.split(' (')[0]}
                        </span>
                        {isRecommended && (
                          <span className="px-1.5 py-0.5 rounded bg-safe text-white text-[9px] font-black uppercase">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-ink-soft">{shelter.code} • Alt: +{shelter.elevationMeters}m</div>
                    </td>

                    <td className="py-3.5 px-3 text-ink-soft">
                      <div className="truncate max-w-[180px]">{shelter.location}</div>
                    </td>

                    <td className="py-3.5 px-3 text-ink font-bold">
                      {shelter.capacity.toLocaleString()}
                    </td>

                    <td className="py-3.5 px-3 min-w-[140px]">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-ink-soft">{shelter.occupancy.toLocaleString()}</span>
                          <span className="text-ink-soft font-semibold">{occupancyRate}%</span>
                        </div>
                        <div className="w-full bg-paper h-2 rounded-full overflow-hidden border border-hairline">
                          <div
                            className={`h-full rounded-full ${
                              occupancyRate >= 95
                                ? 'bg-critical'
                                : occupancyRate >= 80
                                ? 'bg-warn'
                                : 'bg-safe'
                            }`}
                            style={{ width: `${occupancyRate}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-3">
                      <span
                        className={`font-bold text-sm ${
                          shelter.available > 0 ? 'text-safe' : 'text-critical'
                        }`}
                      >
                        {shelter.available.toLocaleString()}
                      </span>
                    </td>

                    <td className="py-3.5 px-3">
                      <Badge
                        variant={
                          shelter.status === 'AVAILABLE'
                            ? 'safe'
                            : shelter.status === 'NEAR_CAPACITY'
                            ? 'moderate'
                            : shelter.status === 'FULL'
                            ? 'critical'
                            : 'neutral'
                        }
                        size="sm"
                        dot
                      >
                        {shelter.status.replace('_', ' ')}
                      </Badge>
                    </td>

                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-1.5 text-ink-soft">
                        {shelter.facilities.medicalUnit && (
                          <span title="Medical Unit Onsite" className="text-critical bg-critical-soft p-1 rounded border border-critical/30">
                            <HeartPulse className="w-3 h-3" />
                          </span>
                        )}
                        {shelter.facilities.wheelchairAccessible && (
                          <span title="Wheelchair Accessible" className="text-brand bg-brand-soft p-1 rounded border border-brand/30">
                            <Accessibility className="w-3 h-3" />
                          </span>
                        )}
                        {shelter.facilities.backupPower && (
                          <span title="Backup Generator" className="text-warn bg-warn-soft p-1 rounded border border-warn/30">
                            <Zap className="w-3 h-3" />
                          </span>
                        )}
                        <span title="Water Stockpile" className="text-safe bg-safe-soft p-1 rounded border border-safe/30 flex items-center text-[9px] gap-0.5">
                          <Droplet className="w-3 h-3" />
                          <span>{(shelter.facilities.cleanWaterLiters / 1000).toFixed(0)}kL</span>
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedShelter(shelter);
                          triggerRelocationWorkflow(undefined, shelter.id);
                        }}
                        disabled={shelter.available === 0}
                        className="py-1 px-2.5 rounded bg-brand-soft hover:bg-brand-soft disabled:opacity-40 disabled:cursor-not-allowed border border-brand/30 text-brand text-[11px] font-mono transition-colors"
                      >
                        Select →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
