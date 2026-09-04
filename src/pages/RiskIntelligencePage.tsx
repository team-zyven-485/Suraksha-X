import React, { useState } from 'react';
import {
  Flame,
  Filter,
  Search,
  TrendingUp,
  AlertTriangle,
  ArrowUpDown,
  Compass,
  ArrowRight,
  Download,
  Layers,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { useDisaster } from '../context/DisasterContext';
import { Badge } from '../components/common/Badge';
import { RiskLevel } from '../types';

export const RiskIntelligencePage: React.FC = () => {
  const {
    riskZones,
    selectedZone,
    setSelectedZone,
    setSelectedDetailDrawerZone,
    triggerRelocationWorkflow,
    setActivePage,
    analytics,
  } = useDisaster();

  const { riskTrendData } = analytics;

  const [activeFilter, setActiveFilter] = useState<'ALL' | RiskLevel>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredZones = riskZones.filter((zone) => {
    const matchesFilter = activeFilter === 'ALL' || zone.riskLevel === activeFilter;
    const matchesSearch =
      zone.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      zone.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Built live from riskZones (not the static per-scenario fixture) so the
  // numbers always match the rest of the page, and so it actually responds
  // to the CRITICAL/HIGH/MODERATE/SAFE filter tabs above it — previously
  // those tabs only narrowed the roster table below, leaving both charts
  // showing unfiltered, hardcoded figures no matter what was selected.
  const riskLevelColors: Record<RiskLevel, string> = {
    CRITICAL: '#C62828',
    HIGH: '#D97706',
    MODERATE: '#D97706',
    SAFE: '#15803D',
  };
  const liveRiskDistribution = (['CRITICAL', 'HIGH', 'MODERATE', 'SAFE'] as RiskLevel[])
    .map((level) => {
      const zonesAtLevel = riskZones.filter((z) => z.riskLevel === level);
      return {
        name: level,
        riskLevel: level,
        zones: zonesAtLevel.length,
        population: zonesAtLevel.reduce((sum, z) => sum + z.population, 0),
        vulnerable: zonesAtLevel.reduce((sum, z) => sum + z.vulnerablePopulation, 0),
        color: riskLevelColors[level],
      };
    })
    .filter((bucket) => activeFilter === 'ALL' || bucket.riskLevel === activeFilter);

  const handleSelect = (zone: (typeof riskZones)[0]) => {
    setSelectedZone(zone);
    setSelectedDetailDrawerZone(zone);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-warn" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-warn font-semibold">
              MULTI-HAZARD RISK ASSESSMENT
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-ink tracking-tight mt-0.5">
            Risk Intelligence
          </h1>
          <p className="text-xs text-ink-soft mt-1">
            Multivariate hazard exposure forecasting, impact modeling, and priority severity indices
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActivePage('command-center')}
            className="px-3.5 py-1.5 rounded bg-surface hover:bg-paper-alt border border-hairline text-xs font-mono text-ink-soft"
          >
            ← Command Map
          </button>
          <button
            onClick={() => triggerRelocationWorkflow(selectedZone?.id)}
            className="px-3.5 py-1.5 rounded bg-critical hover:bg-critical/90 text-xs font-mono font-bold text-white shadow-sm"
          >
            Relocate Selected Zone
          </button>
        </div>
      </div>

      {/* FILTER TABS & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-3 rounded-lg border border-hairline">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'CRITICAL', 'HIGH', 'MODERATE', 'SAFE'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-3 py-1.5 rounded text-xs font-mono font-medium whitespace-nowrap transition-colors ${
                activeFilter === filter
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-ink-soft hover:text-ink hover:bg-paper-alt'
              }`}
            >
              {filter === 'ALL' ? `All Zones (${riskZones.length})` : filter}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-ink-soft absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search risk zones..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-paper border border-hairline rounded pl-8 pr-3 py-1.5 text-xs text-ink font-mono focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      {/* CHARTS ROW: Risk Distribution + Flood Inundation Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Risk Trend Chart (8 Cols) */}
        <div className="lg:col-span-8 p-4 rounded-lg bg-surface border border-hairline space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold font-mono text-ink">
                Risk Escalation & Hazard Intensity Trend
              </h3>
              <p className="text-xs text-ink-soft">
                Average risk index vs. hazard intensity across recent monitoring window
              </p>
            </div>
            <span className="text-[10px] font-mono text-critical bg-critical-soft px-2 py-0.5 rounded border border-critical/30">
              ESCALATING
            </span>
          </div>
          <p className="text-[10px] text-ink-faint -mt-2">
            District-wide over time — not affected by the zone severity filter above.
          </p>

          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={riskTrendData}>
                <defs>
                  <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C62828" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#C62828" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="floodGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="time" stroke="#8A93A3" tick={{ fontSize: 11, fill: '#5B6472' }} />
                <YAxis stroke="#8A93A3" tick={{ fontSize: 11, fill: '#5B6472' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E5E7EB',
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    boxShadow: '0 4px 12px rgba(20,33,61,0.12)',
                  }}
                  labelStyle={{ color: '#14213D', fontWeight: 600 }}
                  itemStyle={{ color: '#14213D' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6, color: '#5B6472' }} />
                <Area
                  type="monotone"
                  dataKey="avgRiskScore"
                  name="Avg Risk Score (0-100)"
                  stroke="#C62828"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#riskGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="floodLevelMeters"
                  name="Hazard Intensity Index"
                  stroke="#2563EB"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#floodGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Distribution Breakdown (4 Cols) */}
        <div className="lg:col-span-4 p-4 rounded-lg bg-surface border border-hairline space-y-3">
          <div>
            <h3 className="text-sm font-bold font-mono text-ink">Risk Distribution</h3>
            <p className="text-xs text-ink-soft">
              {activeFilter === 'ALL'
                ? 'Total exposed population by severity class'
                : `Exposed population — ${activeFilter} zones only`}
            </p>
          </div>

          <div className="h-[260px] w-full">
            {liveRiskDistribution.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs font-mono text-ink-faint">
                No zones at this severity level.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={liveRiskDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" stroke="#8A93A3" tick={{ fontSize: 10, fill: '#5B6472' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#8A93A3"
                    width={90}
                    tick={{ fontSize: 10, fill: '#5B6472' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E5E7EB',
                      borderRadius: 8,
                      fontSize: 11,
                      fontFamily: 'monospace',
                      boxShadow: '0 4px 12px rgba(20,33,61,0.12)',
                    }}
                    labelStyle={{ color: '#14213D', fontWeight: 600 }}
                    itemStyle={{ color: '#14213D' }}
                  />
                  <Bar dataKey="population" name="Population Exposed" radius={[0, 4, 4, 0]}>
                    {liveRiskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* AFFECTED AREAS DATA TABLE */}
      <div className="p-4 rounded-lg bg-surface border border-hairline shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand" />
            <h3 className="text-sm font-bold font-mono text-ink">
              Affected Risk Zones Roster ({filteredZones.length})
            </h3>
          </div>
          <span className="text-xs font-mono text-ink-soft">
            Selected: {selectedZone ? selectedZone.name : 'None'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-hairline bg-paper-alt text-ink-soft uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3">Zone / Code</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Risk Score</th>
                <th className="py-2.5 px-3">Total Pop.</th>
                <th className="py-2.5 px-3">Vulnerable</th>
                <th className="py-2.5 px-3">Hazard Intensity</th>
                <th className="py-2.5 px-3">Recommended Action</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filteredZones.map((zone) => {
                const isSelected = selectedZone?.id === zone.id;
                return (
                  <tr
                    key={zone.id}
                    onClick={() => handleSelect(zone)}
                    className={`hover:bg-paper-alt cursor-pointer transition-colors ${
                      isSelected ? 'bg-brand-soft font-semibold' : ''
                    }`}
                  >
                    <td className="py-3 px-3">
                      <div className="text-ink font-bold">{zone.name}</div>
                      <div className="text-[10px] text-ink-soft">{zone.code}</div>
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={zone.riskLevel.toLowerCase() as any} size="sm" dot>
                        {zone.riskLevel}
                      </Badge>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-sm font-bold ${
                          zone.riskScore >= 80
                            ? 'text-critical'
                            : zone.riskScore >= 60
                            ? 'text-warn'
                            : 'text-warn'
                        }`}
                      >
                        {zone.riskScore}
                      </span>
                      <span className="text-ink-soft text-[10px]">/100</span>
                    </td>
                    <td className="py-3 px-3 text-ink">{zone.population.toLocaleString()}</td>
                    <td className="py-3 px-3 text-critical font-semibold">
                      {zone.vulnerablePopulation.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-warn">+{zone.floodDepthEstMeters}m</td>
                    <td className="py-3 px-3">
                      <span className="text-ink bg-paper px-2 py-1 rounded border border-hairline text-[10px]">
                        {zone.recommendedAction}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedZone(zone);
                          triggerRelocationWorkflow(zone.id);
                        }}
                        className="py-1 px-2.5 rounded bg-critical-soft hover:bg-critical-soft border border-critical/30 text-critical text-[11px] font-mono transition-colors"
                      >
                        Relocate →
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
