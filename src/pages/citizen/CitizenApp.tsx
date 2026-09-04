import React, { useState } from 'react';
import { Home, MapPin, Building2, Navigation, ListChecks, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ZyvenLogo } from '../../components/common/ZyvenLogo';
import { CitizenHome } from './CitizenHome';
import { CitizenLocate } from './CitizenLocate';
import { CitizenSafeCentres } from './CitizenSafeCentres';
import { CitizenEvacRoute } from './CitizenEvacRoute';
import { CitizenMySOS } from './CitizenMySOS';
import { ToastContainer } from '../../components/common/Toast';

export type CitizenView = 'home' | 'locate' | 'centres' | 'route' | 'my-sos';

export interface CitizenLocationState {
  coords: { lat: number; lng: number } | null;
  accuracy: number | null;
  isDemo: boolean;
}

export const CitizenApp: React.FC = () => {
  const { user, logout } = useAuth();
  const [view, setView] = useState<CitizenView>('home');
  const [location, setLocation] = useState<CitizenLocationState>({ coords: null, accuracy: null, isDemo: false });

  const navItems: { id: CitizenView; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'locate', label: 'Location', icon: MapPin },
    { id: 'centres', label: 'Safe Centres', icon: Building2 },
    { id: 'route', label: 'Route', icon: Navigation },
    { id: 'my-sos', label: 'My SOS', icon: ListChecks },
  ];

  const renderView = () => {
    switch (view) {
      case 'home':
        return <CitizenHome location={location} onNavigate={setView} />;
      case 'locate':
        return <CitizenLocate location={location} setLocation={setLocation} />;
      case 'centres':
        return <CitizenSafeCentres location={location} onNavigate={setView} />;
      case 'route':
        return <CitizenEvacRoute location={location} />;
      case 'my-sos':
        return <CitizenMySOS location={location} setLocation={setLocation} />;
      default:
        return <CitizenHome location={location} onNavigate={setView} />;
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col font-sans">
      {/* Simple top bar */}
      <header className="h-14 bg-surface border-b border-hairline px-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-soft border border-brand/20 flex items-center justify-center p-1">
            <ZyvenLogo variant="icon" size={22} />
          </div>
          <div>
            <div className="text-sm font-bold font-mono text-ink leading-none">SURAKSHA-X</div>
            <div className="text-[9px] font-mono text-ink-soft leading-none mt-0.5">Emergency Assistance</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-paper-alt border border-hairline text-ink-soft text-[11px] font-mono hover:text-ink hover:border-ink-faint/40"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Switch Role</span>
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 pb-24 max-w-lg mx-auto w-full">
        {renderView()}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-hairline flex items-stretch max-w-lg mx-auto w-full">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-mono transition-colors ${
                isActive ? 'text-brand' : 'text-ink-faint hover:text-ink-soft'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <ToastContainer />
    </div>
  );
};
