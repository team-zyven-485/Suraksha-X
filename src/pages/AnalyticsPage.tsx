import React from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart as PieChartIcon,
  Users,
  Building,
  ShieldAlert,
  ArrowUpRight,
  Activity,
  Download,
  Share2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useDisaster } from '../context/DisasterContext';
import { KpiCard } from '../components/common/KpiCard';

export const AnalyticsPage: React.FC = () => {
  const { setActivePage, analytics, demographics, scenarioMeta } = useDisaster();
  const {
    riskDistributionData,
    riskTrendData,
    zoneComparisonData,
    shelterUtilizationData,
    evacuationProgressData,
  } = analytics;

  const demographicColors = ['#C62828', '#D97706', '#2563EB', '#15803D', '#7C3AED'];

  const totalDisplaced = demographics.totalVulnerablePopulation;
  const totalAtRisk = demographics.totalPopulationAtRisk;
  const evacPercent = totalAtRisk > 0 ? ((totalDisplaced / totalAtRisk) * 100).toFixed(1) : '0.0';
  const occupancyPercent = demographics.totalShelterCapacity > 0
    ? ((demographics.totalShelterOccupancy / demographics.totalShelterCapacity) * 100).toFixed(1)
    : '0.0';
  const vulnRatio = totalAtRisk > 0 ? (totalAtRisk / totalDisplaced).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-brand font-semibold">
              INCIDENT METRICS & STATISTICAL INTELLIGENCE
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-ink tracking-tight mt-0.5">
            Response Analytics
          </h1>
          <p className="text-xs text-ink-soft mt-1">
            Real-time aggregate data on population displacement, shelter intake velocity, and corridor clearance
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-1.5 rounded bg-surface hover:bg-paper-alt border border-hairline text-xs font-mono text-ink"
          >
            Print Analytics Report
          </button>
        </div>
      </div>

      {/* KPI METRICS ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block">VULNERABLE / TOTAL AT RISK</span>
          <span className="text-2xl font-bold text-safe mt-1">{totalDisplaced.toLocaleString()} / {totalAtRisk.toLocaleString()}</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">{evacPercent}% priority triage group</span>
        </div>

        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block">ACTIVE HAZARD ZONES</span>
          <span className="text-2xl font-bold text-brand mt-1">{demographics.activeHazardZonesCount} Zones</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">{demographics.criticalZonesCount} Critical Priority</span>
        </div>

        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block">SHELTER AGGREGATE LOAD</span>
          <span className="text-2xl font-bold text-warn mt-1">{occupancyPercent}% Occupancy</span>
          <span className="text-[10px] text-ink-soft block mt-0.5">{demographics.availableShelterCapacity.toLocaleString()} beds available</span>
        </div>

        <div className="p-4 rounded-lg bg-critical-soft border border-critical/30 font-mono">
          <span className="text-[10px] text-critical uppercase font-semibold block">VULNERABILITY RATIO</span>
          <span className="text-2xl font-bold text-critical mt-1">1 in {vulnRatio}</span>
          <span className="text-[10px] text-critical block mt-0.5">Priority triage group</span>
        </div>
      </div>

      {/* ROW 1 CHARTS: Shelter Utilization + Evacuation Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Shelter Utilization Chart (6 Cols) */}
        <div className="lg:col-span-6 p-4 rounded-lg bg-surface border border-hairline space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold font-mono text-ink">
                Shelter Capacity vs. Current Occupancy
              </h3>
              <p className="text-xs text-ink-soft">Occupancy counts across primary relief centers</p>
            </div>
            <span className="text-[10px] font-mono text-safe">{demographics.reliefCentresCount} Centres Active</span>
          </div>

          <div className="h-[270px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shelterUtilizationData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="name"
                  stroke="#8A93A3"
                  tick={{ fontSize: 9, fill: '#5B6472' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={45}
                />
                <YAxis stroke="#8A93A3" tick={{ fontSize: 10, fill: '#5B6472' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E5E7EB',
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: 'monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Bar dataKey="capacity" name="Total Capacity" fill="#8A93A3" radius={[4, 4, 0, 0]} />
                <Bar dataKey="occupancy" name="Current Occupancy" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="available" name="Available Beds" fill="#15803D" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Evacuation Progress Stacked (6 Cols) */}
        <div className="lg:col-span-6 p-4 rounded-lg bg-surface border border-hairline space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold font-mono text-ink">
                Evacuation Phase Progress by Sector
              </h3>
              <p className="text-xs text-ink-soft">Priority vulnerable citizens transit status</p>
            </div>
            <span className="text-[10px] font-mono text-brand">P1 Target Sectors</span>
          </div>

          <div className="h-[270px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evacuationProgressData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" stroke="#8A93A3" tick={{ fontSize: 10, fill: '#5B6472' }} />
                <YAxis
                  type="category"
                  dataKey="segment"
                  stroke="#8A93A3"
                  width={130}
                  tick={{ fontSize: 10, fill: '#5B6472' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E5E7EB',
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: 'monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Bar dataKey="evacuated" name="Evacuated & Safe" stackId="a" fill="#15803D" />
                <Bar dataKey="inTransit" name="In Transit / Convoy" stackId="a" fill="#D97706" />
                <Bar dataKey="remaining" name="Awaiting Convoy" stackId="a" fill="#C62828" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ROW 2 CHARTS: Vulnerability Demographics Pie + Zone Exposure Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Vulnerable Demographic Breakdown Pie (5 Cols) */}
        <div className="lg:col-span-5 p-4 rounded-lg bg-surface border border-hairline space-y-3">
          <div>
            <h3 className="text-sm font-bold font-mono text-ink">
              Vulnerable Demographic Distribution
            </h3>
            <p className="text-xs text-ink-soft">Composition of {totalDisplaced.toLocaleString()} priority residents</p>
          </div>

          <div className="h-[250px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={demographics.vulnerabilityDistribution}
                  dataKey="count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={4}
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                >
                  {demographics.vulnerabilityDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={demographicColors[index % demographicColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E5E7EB',
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: 'monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Multi-Index Zone Comparison (7 Cols) */}
        <div className="lg:col-span-7 p-4 rounded-lg bg-surface border border-hairline space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold font-mono text-ink">
                Multi-Index Zone Hazard vs. Road Accessibility
              </h3>
              <p className="text-xs text-ink-soft">Comparing risk score against accessibility ratings</p>
            </div>
            <span className="text-[10px] font-mono text-ink-soft">Score 0 - 100</span>
          </div>

          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="zone" stroke="#8A93A3" tick={{ fontSize: 11, fill: '#5B6472' }} />
                <YAxis stroke="#8A93A3" tick={{ fontSize: 11, fill: '#5B6472' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E5E7EB',
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: 'monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="riskScore" name="Risk Severity" fill="#C62828" radius={[4, 4, 0, 0]} />
                <Bar dataKey="hazardScore" name="Hazard Surge" fill="#D97706" radius={[4, 4, 0, 0]} />
                <Bar dataKey="accessScore" name="Road Accessibility" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
