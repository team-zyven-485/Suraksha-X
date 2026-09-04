import React, { useState, useEffect, useRef } from 'react';
import { DisasterProvider, useDisaster } from './context/DisasterContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SOSProvider } from './context/SOSContext';
import { SatelliteProvider } from './context/SatelliteContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopCommandBar } from './components/layout/TopCommandBar';
import { ToastContainer } from './components/common/Toast';
import { ZoneDetailDrawer } from './components/drawers/ZoneDetailDrawer';
import { SimulationModal } from './components/modals/SimulationModal';
import { AlertsDrawer } from './components/modals/AlertsDrawer';
import { GeminiDisasterChatbot } from './components/chat/GeminiDisasterChatbot';
import { RoleSelectPage } from './pages/RoleSelectPage';
import { CitizenApp } from './pages/citizen/CitizenApp';
import { RescueTeamApp } from './pages/rescue/RescueTeamApp';

// Admin Pages
import { CommandCenterPage } from './pages/CommandCenterPage';
import { RiskIntelligencePage } from './pages/RiskIntelligencePage';
import { VulnerabilityPage } from './pages/VulnerabilityPage';
import { RelocationPlannerPage } from './pages/RelocationPlannerPage';
import { EvacuationRoutePage } from './pages/EvacuationRoutePage';
import { RelocationActionPlanPage } from './pages/RelocationActionPlanPage';
import { ReliefCentresPage } from './pages/ReliefCentresPage';
import { RescueControlPage } from './pages/RescueControlPage';
import { SatelliteIntelPage } from './pages/SatelliteIntelPage';
import { AnalyticsPage } from './pages/AnalyticsPage';

const AdminAppContent: React.FC = () => {
  const { activePage } = useDisaster();
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const mainContentRef = useRef<HTMLElement>(null);

  // Scroll to top upon page navigation
  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activePage]);

  // Router for active page
  const renderPage = () => {
    switch (activePage) {
      case 'command-center':
        return <CommandCenterPage />;
      case 'risk-intelligence':
        return <RiskIntelligencePage />;
      case 'vulnerability':
        return <VulnerabilityPage />;
      case 'relocation-planner':
        return <RelocationPlannerPage />;
      case 'evacuation-routes':
        return <EvacuationRoutePage />;
      case 'relocation-action-plan':
        return <RelocationActionPlanPage />;
      case 'relief-centres':
        return <ReliefCentresPage />;
      case 'rescue-control':
        return <RescueControlPage />;
      case 'satellite-intel':
        return <SatelliteIntelPage />;
      case 'analytics':
        return <AnalyticsPage />;
      default:
        return <CommandCenterPage />;
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col antialiased selection:bg-brand selection:text-white font-sans">
      {/* Top Command Bar */}
      <TopCommandBar
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        onOpenAlerts={() => setIsAlertsOpen(true)}
      />

      {/* Main App Layout */}
      <div className="flex-1 flex min-w-0 relative">
        {/* Mobile Backdrop */}
        {isMobileSidebarOpen && (
          <div
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
          />
        )}

        {/* Persistent Collapsible Sidebar */}
        <Sidebar
          isOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Content Area */}
        <main
          ref={mainContentRef}
          key={activePage}
          className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-[1600px] mx-auto w-full animate-in fade-in duration-200"
        >
          {renderPage()}
        </main>
      </div>

      {/* Global Interactive Overlays */}
      <ZoneDetailDrawer />
      <SimulationModal />
      <AlertsDrawer isOpen={isAlertsOpen} onClose={() => setIsAlertsOpen(false)} />
      <GeminiDisasterChatbot />
      <ToastContainer />
    </div>
  );
};

const RoleGate: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return <RoleSelectPage />;
  }

  return (
    <>
      {user.role === 'citizen' && <CitizenApp />}
      {user.role === 'admin' && <AdminAppContent />}
      {user.role === 'rescue' && <RescueTeamApp />}
    </>
  );
};

export default function App() {
  return (
    <AuthProvider>
      {/* DisasterProvider + SOSProvider stay mounted across role switches so
          SOS incidents and scenario state are shared between Citizen, Admin,
          and Rescue Team views during the demo flow. */}
      <DisasterProvider>
        <SOSProvider>
          <SatelliteProvider>
            <RoleGate />
          </SatelliteProvider>
        </SOSProvider>
      </DisasterProvider>
    </AuthProvider>
  );
}
