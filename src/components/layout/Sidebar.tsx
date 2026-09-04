import React from 'react';
import {
  LayoutDashboard,
  Flame,
  UsersRound,
  Compass,
  Navigation,
  Building2,
  FileCheck,
  BarChart3,
  Radio,
  ChevronRight,
  Satellite,
} from 'lucide-react';
import { useDisaster, AppPage } from '../../context/DisasterContext';
import { useSOS } from '../../context/SOSContext';
import { useSatellite } from '../../context/SatelliteContext';
import { useAuth } from '../../context/AuthContext';
import { ZyvenLogo } from '../common/ZyvenLogo';
import { isSupabaseConfigured } from '../../lib/supabaseClient';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onCloseMobile }) => {
  const {
    activePage,
    setActivePage,
    activePlan,
    scenarioMeta,
    riskZones,
    reliefCentres,
    routes,
    selectedShelter,
  } = useDisaster();
  const { incidents } = useSOS();
  const { backendStatus, hazard } = useSatellite();
  const { user, logout } = useAuth();

  const activeSOSCount = incidents.filter((i) => i.status !== 'CLOSED' && i.status !== 'RESCUED').length;

  const topZone = [...riskZones].sort((a, b) => b.riskScore - a.riskScore)[0];
  const maxRiskScore = topZone?.riskScore || 0;
  const totalVulnerable = riskZones.reduce((sum, z) => sum + z.vulnerablePopulation, 0);
  const vulnLabel = totalVulnerable >= 1000 ? `${(totalVulnerable / 1000).toFixed(1)}K` : `${totalVulnerable}`;
  const recShelterCode = selectedShelter?.code || reliefCentres[0]?.code || '—';
  const primaryRoute = routes.find((r) => r.isRecommended) || routes[0];
  const distLabel = primaryRoute ? `${primaryRoute.distanceKm} KM` : '—';

  const navSections = [
    {
      label: 'COMMAND CENTER',
      items: [
        {
          id: 'command-center' as AppPage,
          name: 'Command Center',
          icon: LayoutDashboard,
          badge: 'LIVE',
          badgeColor: 'bg-brand-soft text-brand border-brand/20',
        },
      ],
    },
    {
      label: 'INTELLIGENCE',
      items: [
        {
          id: 'risk-intelligence' as AppPage,
          name: 'Risk Intelligence',
          icon: Flame,
          badge: `${maxRiskScore} MAX`,
          badgeColor: 'bg-warn-soft text-warn border-warn/20',
        },
        {
          id: 'vulnerability' as AppPage,
          name: 'Vulnerability Analysis',
          icon: UsersRound,
          badge: vulnLabel,
          badgeColor: 'bg-warn-soft text-warn border-warn/20',
        },
        {
          id: 'satellite-intel' as AppPage,
          name: 'Satellite Intelligence',
          icon: Satellite,
          badge: hazard?.data_mode === 'CONNECTED' ? 'LIVE' : hazard?.data_mode === 'DEMO' ? 'DEMO' : backendStatus ? 'DEMO' : 'OFFLINE',
          badgeColor:
            hazard?.data_mode === 'CONNECTED'
              ? 'bg-safe-soft text-safe border-safe/20'
              : backendStatus
              ? 'bg-warn-soft text-warn border-warn/20'
              : 'bg-paper-alt text-ink-faint border-hairline',
        },
      ],
    },
    {
      label: 'RESPONSE',
      items: [
        {
          id: 'relocation-planner' as AppPage,
          name: 'Relocation Planner',
          icon: Compass,
          badge: `REC ${recShelterCode}`,
          badgeColor: 'bg-brand-soft text-brand border-brand/20',
        },
        {
          id: 'evacuation-routes' as AppPage,
          name: 'Evacuation Routes',
          icon: Navigation,
          badge: distLabel,
          badgeColor: 'bg-safe-soft text-safe border-safe/20',
        },
        {
          id: 'relief-centres' as AppPage,
          name: 'Relief Centres',
          icon: Building2,
          badge: `${scenarioMeta.totalReliefCentres} SITES`,
          badgeColor: 'bg-paper-alt text-ink-soft border-hairline',
        },
        {
          id: 'relocation-action-plan' as AppPage,
          name: 'Relocation Action Plan',
          icon: FileCheck,
          badge: activePlan ? 'ACTIVE' : 'READY',
          badgeColor: activePlan
            ? 'bg-critical-soft text-critical border-critical/20'
            : 'bg-paper-alt text-ink-faint border-hairline',
        },
        {
          id: 'rescue-control' as AppPage,
          name: 'Rescue Control',
          icon: Radio,
          badge: activeSOSCount > 0 ? `${activeSOSCount} ACTIVE` : 'CLEAR',
          badgeColor:
            activeSOSCount > 0
              ? 'bg-critical-soft text-critical border-critical/20'
              : 'bg-safe-soft text-safe border-safe/20',
        },
      ],
    },
    {
      label: 'ANALYTICS',
      items: [
        {
          id: 'analytics' as AppPage,
          name: 'Response Analytics',
          icon: BarChart3,
        },
      ],
    },
  ];

  const handleNav = (page: AppPage) => {
    setActivePage(page);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <aside
      id="main-sidebar"
      className={`fixed lg:static inset-y-0 left-0 z-50 lg:z-auto w-64 bg-surface border-r border-hairline flex flex-col justify-between transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      {/* Brand Header */}
      <div className="p-4 border-b border-hairline">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-lg bg-brand-soft border border-brand/20 flex items-center justify-center p-1">
            <ZyvenLogo variant="icon" size={32} />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-safe border-2 border-surface" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold font-mono tracking-wider text-ink">
                SURAKSHA-X
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <ZyvenLogo variant="horizontal" size="xs" showText={true} />
            </div>
          </div>
        </div>

        <p className="text-[11px] text-ink-soft mt-2.5 tracking-tight leading-tight">
          Intelligent Disaster Response & Relocation
        </p>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navSections.map((section) => (
          <div key={section.label} className="space-y-1">
            <div className="px-2 text-[10px] font-mono font-semibold tracking-wider text-ink-faint uppercase">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-btn-${item.id}`}
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-all group ${
                      isActive
                        ? 'bg-brand-soft text-brand border border-brand/20'
                        : 'text-ink-soft hover:text-ink hover:bg-paper-alt border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-brand' : 'text-ink-faint group-hover:text-ink-soft'
                        }`}
                      />
                      <span className="truncate">{item.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.badge && (
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                            item.badgeColor || 'bg-paper-alt text-ink-faint border-hairline'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {isActive && <ChevronRight className="w-3 h-3 text-brand" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer / Authority & System Status */}
      <div className="p-3 border-t border-hairline space-y-2.5">
        <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-paper-alt border border-hairline">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isSupabaseConfigured() ? 'bg-safe' : 'bg-warn'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isSupabaseConfigured() ? 'bg-safe' : 'bg-warn'}`}></span>
            </span>
            <span className={`text-[11px] font-mono font-medium ${isSupabaseConfigured() ? 'text-safe' : 'text-warn'}`}>
              {isSupabaseConfigured() ? 'SYSTEM OPERATIONAL' : 'LOCAL DEMO MODE'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-ink-faint">v2.6.4</span>
        </div>

        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="w-7 h-7 rounded-lg bg-brand-soft border border-brand/20 flex items-center justify-center text-brand text-xs font-bold font-mono">
            {(user?.name || 'AD').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-ink truncate">
              {user?.name || 'Admin'}
            </div>
            <div className="text-[10px] text-ink-faint truncate font-mono">
              Incident Commander Alpha
            </div>
          </div>
          <button
            onClick={logout}
            title="Switch Role / Logout"
            className="text-ink-faint hover:text-critical shrink-0 transition-colors"
          >
            <Radio className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
