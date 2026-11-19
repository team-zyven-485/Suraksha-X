import React, { useState } from 'react';
import { ShieldAlert, UserRound, Radio, ChevronRight, Lock, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppLogo } from '../components/common/AppLogo';
import { LanguageSwitcher, useI18n } from '../i18n';
import { initialRescueTeams } from '../data/rescueTeams';
import type { UserRole } from '../types/sos';

type StaffRole = 'admin' | 'rescue';

export const RoleSelectPage: React.FC = () => {
  const { loginAs } = useAuth();
  const { t } = useI18n();
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [code, setCode] = useState('');
  const [teamId, setTeamId] = useState(initialRescueTeams[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roles = [
    { role: 'citizen' as const, icon: UserRound, accent: 'emerald' },
    { role: 'admin' as const, icon: ShieldAlert, accent: 'red' },
    { role: 'rescue' as const, icon: Radio, accent: 'blue' },
  ];

  const accentClasses: Record<string, string> = {
    emerald: 'border-safe/30 hover:border-safe text-safe bg-safe-soft',
    red: 'border-critical/30 hover:border-critical text-critical bg-critical-soft',
    blue: 'border-brand/30 hover:border-brand text-brand bg-brand-soft',
  };

  const choose = async (role: UserRole) => {
    setError(null);
    if (role === 'citizen') {
      setBusy(true);
      const res = await loginAs('citizen');
      setBusy(false);
      if (!res.ok) setError(res.error ?? 'Could not sign in');
      return;
    }
    setStaffRole(role);
    setCode('');
  };

  const submitStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffRole) return;
    setBusy(true);
    setError(null);
    const res = await loginAs(staffRole, { code, teamId: staffRole === 'rescue' ? teamId : undefined });
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Could not sign in');
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col items-center justify-center p-6 font-sans relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-lg bg-brand-soft border border-brand/20 flex items-center justify-center shadow-sm p-1.5">
          <AppLogo variant="icon" size={38} />
        </div>
        <div>
          <div className="text-xl font-bold font-mono tracking-wider text-ink">SURAKSHA-X</div>
        </div>
      </div>

      <p className="text-sm text-ink-soft mt-2 mb-10 text-center max-w-md">{t('role.select')}</p>

      {staffRole ? (
        <form
          onSubmit={submitStaff}
          className="w-full max-w-sm p-5 rounded-xl bg-surface border-2 border-hairline shadow-sm space-y-4"
        >
          <button
            type="button"
            onClick={() => {
              setStaffRole(null);
              setError(null);
            }}
            className="flex items-center gap-1 text-[11px] font-mono text-ink-soft hover:text-ink"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {t('role.back')}
          </button>
          <div>
            <div className="text-base font-bold font-mono text-ink">{t(`role.${staffRole}.title`)}</div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink-soft mt-0.5">
              {t(`role.${staffRole}.subtitle`)}
            </div>
          </div>
          <p className="text-xs text-ink-soft leading-relaxed">{t('role.staffNote')}</p>

          {staffRole === 'rescue' && (
            <label className="block space-y-1">
              <span className="text-[10px] font-mono uppercase text-ink-soft font-semibold">{t('role.team')}</span>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full bg-paper border border-hairline rounded px-2.5 py-2 text-xs font-mono text-ink focus:outline-none focus:border-brand"
              >
                {initialRescueTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} — {team.specialization}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-[10px] font-mono uppercase text-ink-soft font-semibold flex items-center gap-1">
              <Lock className="w-3 h-3" /> {t('role.code')}
            </span>
            <input
              id="input-access-code"
              type="password"
              autoComplete="off"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full bg-paper border border-hairline rounded px-2.5 py-2 text-sm font-mono text-ink focus:outline-none focus:border-brand"
            />
          </label>

          {error && <div className="text-xs text-critical font-mono">{error}</div>}

          <button
            type="submit"
            disabled={busy || code.trim().length === 0}
            className="w-full py-2.5 rounded-lg bg-brand hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono font-bold uppercase tracking-wide"
          >
            {busy ? t('role.signingIn') : t('role.signIn')}
          </button>
        </form>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-4xl">
            {roles.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.role}
                  id={`btn-login-${r.role}`}
                  disabled={busy}
                  onClick={() => choose(r.role)}
                  className={`group text-left p-5 rounded-xl bg-surface border-2 transition-all shadow-sm hover:shadow-md flex flex-col gap-3 disabled:opacity-60 ${accentClasses[r.accent]}`}
                >
                  <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${accentClasses[r.accent]}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-base font-bold font-mono text-ink">{t(`role.${r.role}.title`)}</div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-ink-soft mt-0.5">
                      {t(`role.${r.role}.subtitle`)}
                    </div>
                  </div>
                  <p className="text-xs text-ink-soft leading-relaxed flex-1">{t(`role.${r.role}.desc`)}</p>
                  <div className="flex items-center gap-1 text-xs font-mono font-semibold pt-1">
                    {r.role !== 'citizen' && <Lock className="w-3 h-3" />}
                    <span>{t('role.continueAs', { role: t(`role.${r.role}.title`) })}</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              );
            })}
          </div>
          {error && <div className="mt-4 text-xs text-critical font-mono">{error}</div>}
        </>
      )}
    </div>
  );
};
