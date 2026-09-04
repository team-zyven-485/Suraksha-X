import React, { useState } from 'react';
import {
  Bell,
  MapPin,
  Waves,
  Clock,
  Menu,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  Mountain,
  Wind,
  Landmark,
  Waypoints,
} from 'lucide-react';
import { useDisaster, AppPage } from '../../context/DisasterContext';
import { Badge } from '../common/Badge';
import { DisasterType } from '../../data/scenarios';

const hazardIcons: Record<string, React.FC<{ className?: string }>> = {
  Waves,
  Mountain,
  Wind,
  Landmark,
  Tsunami: Waypoints,
};

const disasterTypeLabels: Record<DisasterType, string> = {
  FLOOD: 'Flood Event',
  EARTHQUAKE: 'Seismic Event',
  CYCLONE: 'Cyclone Event',
  LANDSLIDE: 'Landslide Event',
  TSUNAMI: 'Tsunami Event',
};

interface TopCommandBarProps {
  onToggleMobileSidebar: () => void;
  onOpenAlerts: () => void;
}

export const TopCommandBar: React.FC<TopCommandBarProps> = ({
  onToggleMobileSidebar,
  onOpenAlerts,
}) => {
  const {
    activePage,
    setActivePage,
    unreadAlertsCount,
    triggerRelocationWorkflow,
    selectedZone,
    scenarioMeta,
    allScenarios,
    switchScenario,
    activeScenarioId,
  } = useDisaster();

  const [isScenarioDropdownOpen, setIsScenarioDropdownOpen] = useState(false);

  const pageTitles: Record<AppPage, { title: string; category: string }> = {
    'command-center': { title: 'Disaster Command Center', category: 'COMMAND' },
    'risk-intelligence': { title: 'Risk Intelligence & Assessment', category: 'INTELLIGENCE' },
    'vulnerability': { title: 'Vulnerability Intelligence', category: 'INTELLIGENCE' },
    'relocation-planner': { title: 'Relocation Decision Planner', category: 'RESPONSE' },
    'evacuation-routes': { title: 'Safe Evacuation Routing', category: 'RESPONSE' },
    'relocation-action-plan': { title: 'Authorized Relocation Action Plan', category: 'RESPONSE' },
    'relief-centres': { title: 'Relief Shelter Network', category: 'RESPONSE' },
    'rescue-control': { title: 'Rescue Control', category: 'RESPONSE' },
    'satellite-intel': { title: 'Satellite Intelligence', category: 'INTELLIGENCE' },
    'analytics': { title: 'Response & Shelter Analytics', category: 'ANALYTICS' },
  };

  const current = pageTitles[activePage] || { title: 'Command Center', category: 'COMMAND' };

  const HazardIcon = hazardIcons[scenarioMeta.hazardIcon] || Waves;

  return (
    <header
      id="top-command-bar"
      className="h-16 bg-surface border-b border-hairline px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30"
    >
      {/* Left: Mobile Toggle + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleMobileSidebar}
          className="p-2 -ml-2 rounded-lg text-ink-soft hover:text-ink hover:bg-paper-alt lg:hidden border border-transparent hover:border-hairline"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-wider text-ink-faint hidden sm:inline-block">
            {current.category}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-ink-faint hidden sm:inline-block" />
          <h1 className="text-sm sm:text-base font-semibold text-ink truncate tracking-tight">
            {current.title}
          </h1>
        </div>
      </div>

      {/* Center: Dynamic Scenario Telemetry Badges */}
      <div className="hidden xl:flex items-center gap-2.5">
        {/* Scenario Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsScenarioDropdownOpen(!isScenarioDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-paper-alt border border-hairline hover:border-brand/40 text-xs text-ink-soft font-mono transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-brand shrink-0" />
            <span className="text-ink-faint">Region:</span>
            <span className="text-ink font-medium">{scenarioMeta.region}</span>
            <ChevronDown className="w-3 h-3 text-ink-faint" />
          </button>

          {isScenarioDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsScenarioDropdownOpen(false)}
              />
              <div className="absolute top-full mt-1 left-0 w-72 bg-surface border border-hairline rounded-lg shadow-lg z-50 p-1.5 space-y-0.5">
                <div className="px-2 py-1.5 text-[10px] font-mono text-ink-faint uppercase tracking-wider">
                  Switch Disaster Scenario
                </div>
                {allScenarios.map((s) => {
                  const isActive = s.id === activeScenarioId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        switchScenario(s.id);
                        setIsScenarioDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-mono transition-colors flex items-center justify-between gap-2 ${
                        isActive
                          ? 'bg-brand-soft text-brand border border-brand/20'
                          : 'text-ink-soft hover:bg-paper-alt hover:text-ink border border-transparent'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold truncate">{s.name}</div>
                        <div className="text-[10px] text-ink-faint mt-0.5">
                          {s.region}, {s.state} • {s.category}
                        </div>
                      </div>
                      {isActive && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-soft text-brand border border-brand/20 shrink-0">
                          ACTIVE
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Hazard Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warn-soft border border-warn/25 text-xs text-warn font-mono">
          <HazardIcon className="w-3.5 h-3.5 text-warn shrink-0" />
          <span className="text-warn/80">Hazard:</span>
          <span className="text-warn font-bold">
            {disasterTypeLabels[scenarioMeta.disasterType]} ({scenarioMeta.category})
          </span>
        </div>

        {/* Timestamp Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-paper-alt border border-hairline text-xs text-ink-soft font-mono">
          <Clock className="w-3.5 h-3.5 text-ink-faint shrink-0" />
          <span className="text-ink-faint">Updated:</span>
          <span className="text-ink-soft">{scenarioMeta.lastUpdated}</span>
        </div>
      </div>

      {/* Right: Emergency Indicator + Quick Actions + Alerts + Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Subtle Emergency Indicator */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-critical-soft border border-critical/25">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-critical opacity-60"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-critical"></span>
          </span>
          <span className="text-[11px] font-mono font-semibold text-critical">
            {scenarioMeta.criticalZonesCount} CRITICAL ZONES
          </span>
        </div>

        {/* Fast Relocation Trigger Button */}
        <button
          id="btn-fast-relocate"
          onClick={() => triggerRelocationWorkflow(selectedZone?.id)}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-critical hover:bg-critical/90 text-white text-xs font-mono font-medium transition-colors"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Plan Relocation</span>
        </button>

        {/* Notifications Icon with Badge */}
        <button
          id="btn-alerts-trigger"
          onClick={onOpenAlerts}
          className="relative p-2 rounded-lg bg-paper-alt border border-hairline hover:border-brand/30 hover:bg-brand-soft text-ink-soft hover:text-brand transition-colors"
          title="Emergency Alerts & Telemetry"
        >
          <Bell className="w-4 h-4" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-critical px-1 text-[9px] font-bold font-mono text-white ring-2 ring-surface">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        {/* Status Chip */}
        <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-hairline">
          <div className="text-right">
            <div className="text-xs font-semibold text-ink font-mono">NDMA {scenarioMeta.state}</div>
            <div className="text-[10px] font-mono text-safe">● LIVE FEED</div>
          </div>
        </div>
      </div>
    </header>
  );
};
