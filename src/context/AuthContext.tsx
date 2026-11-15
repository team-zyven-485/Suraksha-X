import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthUser, UserRole } from '../types/sos';
import { api, ApiError, NetworkError, getDeviceId, getToken, setToken } from '../lib/api';

const USER_KEY = 'suraksha_user';

export interface LoginOptions {
  /** Access code — required for admin and rescue. */
  code?: string;
  /** Rescue team to sign in as. */
  teamId?: string;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loginAs: (role: UserRole, options?: LoginOptions) => Promise<LoginResult>;
  logout: () => Promise<void>;
  /**
   * Make sure this device holds a valid server session (a citizen who raised
   * an SOS offline needs one to send it). Returns true when a token exists.
   */
  ensureSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function storeUser(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<AuthUser | null>(() => (getToken() ? readStoredUser() : readOfflineCitizen()));

  const setUser = useCallback((u: AuthUser | null) => {
    setUserState(u);
    storeUser(u);
  }, []);

  // A citizen session created while the server was unreachable has no token.
  function readOfflineCitizen(): AuthUser | null {
    const stored = readStoredUser();
    return stored && stored.role === 'citizen' && stored.offline ? stored : null;
  }

  // Revalidate a stored session on load. If the server is unreachable we keep
  // the stored session so the app still opens offline; a rejected token
  // (expired / secret rotated) signs the user out.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api<{ user: AuthUser }>('/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
          setUser(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  const loginAs = useCallback(
    async (role: UserRole, options: LoginOptions = {}): Promise<LoginResult> => {
      try {
        const res = await api<{ token: string; user: AuthUser }>('/auth/login', {
          method: 'POST',
          json: { role, code: options.code, teamId: options.teamId, deviceId: getDeviceId() },
        });
        setToken(res.token);
        setUser(res.user);
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError) return { ok: false, error: err.message };
        if (err instanceof NetworkError && role === 'citizen') {
          // A citizen must always be able to reach the SOS button, even with
          // no connection at all. This offline session can't read server data
          // but can queue an SOS that is delivered once the network returns.
          setToken(null);
          setUser({ id: `cit-${getDeviceId()}`, name: 'Citizen', role: 'citizen', teamId: null, offline: true });
          return { ok: true };
        }
        return { ok: false, error: 'Cannot reach the server. Check your connection and try again.' };
      }
    },
    [setUser]
  );

  const ensureSession = useCallback(async (): Promise<boolean> => {
    if (getToken()) return true;
    if (!user || user.role !== 'citizen') return false;
    try {
      const res = await api<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        json: { role: 'citizen', deviceId: getDeviceId() },
      });
      setToken(res.token);
      setUser(res.user);
      return true;
    } catch {
      return false;
    }
  }, [user, setUser]);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
  }, [setUser]);

  return <AuthContext.Provider value={{ user, loginAs, logout, ensureSession }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
