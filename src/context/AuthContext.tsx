import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser, UserRole } from '../types/sos';
import { getSupabaseClient } from '../lib/supabaseClient';

interface AuthContextType {
  user: AuthUser | null;
  loginAs: (role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  isSupabaseAuth: boolean;
}

// Local fallback identities — used only when Supabase isn't configured, so
// the app still runs end-to-end on local mock data (see disasterService /
// SOSContext fallbacks).
const mockUsers: Record<UserRole, AuthUser> = {
  citizen: { id: 'citizen-demo-01', name: 'Demo Citizen', role: 'citizen', teamId: null },
  admin: { id: 'admin-alpha', name: 'Admin / Incident Commander Alpha', role: 'admin', teamId: null },
  rescue: { id: 'team-alpha', name: 'Rescue Unit Alpha', role: 'rescue', teamId: 'team-alpha' },
};

// Display name + (for rescue) the fixed demo team link. The UI still just
// shows three "Continue as X" buttons — no login form — but under the hood
// each now creates/reuses a real Supabase Auth session (anonymous) with a
// role-tagged profile row, so RLS policies have something real to check.
const roleProfile: Record<UserRole, { name: string; teamId: string | null }> = {
  citizen: { name: 'Demo Citizen', teamId: null },
  admin: { name: 'Admin / Incident Commander Alpha', teamId: null },
  rescue: { name: 'Rescue Unit Alpha', teamId: 'team-alpha' },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const supabase = getSupabaseClient();

  // Restore an existing Supabase session on reload (so refreshing the page
  // doesn't bounce back to the role-select screen).
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const authUser = data.session?.user;
      if (!authUser) return;
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
      if (profile) {
        setUser({ id: profile.id, name: profile.name, role: profile.role, teamId: profile.team_id });
      }
    });
  }, [supabase]);

  const loginAs = async (role: UserRole) => {
    if (!supabase) {
      setUser(mockUsers[role]);
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let authUserId = sessionData.session?.user?.id;

      if (!authUserId) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.user) throw error || new Error('Anonymous sign-in failed');
        authUserId = data.user.id;
      }

      const profile = roleProfile[role];
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({ id: authUserId, role, name: profile.name, team_id: profile.teamId }, { onConflict: 'id' });

      if (upsertError) throw upsertError;

      setUser({ id: authUserId, name: profile.name, role, teamId: profile.teamId });
    } catch (err) {
      console.warn('[Auth] Supabase login failed, falling back to local mock session:', err);
      setUser(mockUsers[role]);
    }
  };

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loginAs, logout, isSupabaseAuth: !!supabase }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
