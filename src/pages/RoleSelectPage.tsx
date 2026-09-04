import React from 'react';
import { ShieldAlert, UserRound, Radio, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ZyvenLogo } from '../components/common/ZyvenLogo';

export const RoleSelectPage: React.FC = () => {
  const { loginAs } = useAuth();

  const roles = [
    {
      role: 'citizen' as const,
      title: 'Citizen',
      subtitle: 'Public Emergency Assistance',
      description: 'Check hazard status, find safe centres, view evacuation routes, and send an emergency SOS.',
      icon: UserRound,
      accent: 'emerald',
    },
    {
      role: 'admin' as const,
      title: 'Admin',
      subtitle: 'Disaster Control Command',
      description: 'Monitor risk zones, manage relocation planning, and coordinate rescue team dispatch.',
      icon: ShieldAlert,
      accent: 'red',
    },
    {
      role: 'rescue' as const,
      title: 'Rescue Team',
      subtitle: 'Field Response Unit',
      description: 'Receive assignments, navigate to incident locations, and update rescue status in the field.',
      icon: Radio,
      accent: 'blue',
    },
  ];

  const accentClasses: Record<string, string> = {
    emerald: 'border-safe/30 hover:border-safe text-safe bg-safe-soft',
    red: 'border-critical/30 hover:border-critical text-critical bg-critical-soft',
    blue: 'border-brand/30 hover:border-brand text-brand bg-brand-soft',
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col items-center justify-center p-6 font-sans">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-lg bg-brand-soft border border-brand/20 flex items-center justify-center shadow-sm p-1.5">
          <ZyvenLogo variant="icon" size={38} />
        </div>
        <div>
          <div className="text-xl font-bold font-mono tracking-wider text-ink">SURAKSHA-X</div>
        </div>
      </div>

      <p className="text-sm text-ink-soft mt-2 mb-10 text-center max-w-md">
        Select your role to continue.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-4xl">
        {roles.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.role}
              id={`btn-login-${r.role}`}
              onClick={() => loginAs(r.role)}
              className={`group text-left p-5 rounded-xl bg-surface border-2 transition-all shadow-sm hover:shadow-md flex flex-col gap-3 ${accentClasses[r.accent]}`}
            >
              <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${accentClasses[r.accent]}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-base font-bold font-mono text-ink">{r.title}</div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-ink-soft mt-0.5">
                  {r.subtitle}
                </div>
              </div>
              <p className="text-xs text-ink-soft leading-relaxed flex-1">{r.description}</p>
              <div className="flex items-center gap-1 text-xs font-mono font-semibold pt-1">
                <span>Continue as {r.title}</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
