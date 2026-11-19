import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import {
  SOSIncident,
  SOSStatus,
  SOSCoordinates,
  RescueTeam,
  RescuePriority,
  SOSDisasterType,
  SOSInstructions,
  SOS_DISASTER_TYPE_LABELS,
} from '../types/sos';
import { initialRescueTeams } from '../data/rescueTeams';
import { useDisaster } from './DisasterContext';
import { useAuth } from './AuthContext';
import { triageSOS } from '../shared/sosTriage';
import { api, ApiError, NetworkError, getToken, randomId } from '../lib/api';

interface CreateSOSInput {
  coordinates: SOSCoordinates;
  isDemoLocation: boolean;
  disasterType: SOSDisasterType;
}

interface AssignTeamOptions {
  priority?: RescuePriority;
  requiredAction: string;
  notes: string;
  issuedBy: string;
}

interface SOSContextType {
  incidents: SOSIncident[];
  rescueTeams: RescueTeam[];
  /** Number of SOS requests stored on this device, waiting for a connection. */
  queuedCount: number;
  isOnline: boolean;
  createSOS: (input: CreateSOSInput) => Promise<SOSIncident | null>;
  /** Citizen: cancel own SOS before assignment. Admin: close as FALSE_ALARM / DUPLICATE / OTHER. */
  closeSOS: (incidentId: string, reason?: 'FALSE_ALARM' | 'DUPLICATE' | 'OTHER') => Promise<boolean>;
  assignTeam: (incidentId: string, teamId: string, instructions: AssignTeamOptions) => Promise<boolean>;
  dispatchTeam: (incidentId: string) => Promise<void>;
  advanceStatus: (incidentId: string, status: SOSStatus) => Promise<void>;
  getIncidentsForCitizen: (citizenId: string) => SOSIncident[];
  getIncidentsForTeam: (teamId: string) => SOSIncident[];
  getIncomingAlertsForTeam: (teamId: string) => SOSIncident[];
  getIncidentById: (id: string) => SOSIncident | undefined;
  getTeamById: (id: string) => RescueTeam | undefined;
}

const SOSContext = createContext<SOSContextType | undefined>(undefined);

const QUEUE_KEY = 'suraksha_sos_queue';
const POLL_MS = 4000;

interface QueuedSOS {
  clientRequestId: string;
  scenarioId: string;
  coordinates: SOSCoordinates;
  isDemoLocation: boolean;
  disasterType: SOSDisasterType;
  /** What the citizen sees on screen until the server confirms it. */
  localIncident: SOSIncident;
}

function loadQueue(): QueuedSOS[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedSOS[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedSOS[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* storage full / disabled */
  }
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Server document -> the shape the UI already consumes.
function mapIncident(doc: any): SOSIncident {
  const { createdAt, statusHistory, ...rest } = doc;
  return {
    ...rest,
    timestamp: fmtTime(createdAt),
    statusHistory: (statusHistory || []).map((h: any) => ({ status: h.status, timestamp: fmtTime(h.timestamp) })),
    instructions: doc.instructions
      ? { ...doc.instructions, issuedAt: /^\d{4}-/.test(doc.instructions.issuedAt) ? fmtTime(doc.instructions.issuedAt) : doc.instructions.issuedAt }
      : null,
  } as SOSIncident;
}

export const SOSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { scenarioMeta, riskZones } = useDisaster();
  const { user, ensureSession } = useAuth();
  const [serverIncidents, setServerIncidents] = useState<SOSIncident[]>([]);
  const [rescueTeams, setRescueTeams] = useState<RescueTeam[]>(initialRescueTeams);
  const [queue, setQueue] = useState<QueuedSOS[]>(() => loadQueue());
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const flushing = useRef(false);
  const userId = user?.id;
  const signedIn = !!user && !user.offline;

  const updateQueue = useCallback((updater: (q: QueuedSOS[]) => QueuedSOS[]) => {
    setQueue((prev) => {
      const next = updater(prev);
      saveQueue(next);
      return next;
    });
  }, []);

  // ---- server data: initial fetch + polling ---------------------------------
  const fetchAll = useCallback(async () => {
    if (!getToken()) return;
    try {
      const [inc, teams] = await Promise.all([
        api<{ incidents: any[] }>('/sos'),
        api<{ teams: RescueTeam[] }>('/teams'),
      ]);
      setServerIncidents(inc.incidents.map(mapIncident));
      if (teams.teams.length > 0) setRescueTeams(teams.teams);
      setIsOnline(true);
    } catch (err) {
      if (err instanceof NetworkError) setIsOnline(false);
      // ApiError (e.g. expired session) is handled by AuthContext's revalidation.
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setServerIncidents([]);
      return;
    }
    fetchAll();
    const timer = setInterval(() => {
      if (!document.hidden) fetchAll();
    }, POLL_MS);
    const onVisible = () => !document.hidden && fetchAll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn, userId, fetchAll]);

  // ---- offline queue: flush whenever we might be back online ----------------
  const flushQueue = useCallback(async () => {
    if (flushing.current) return;
    const pending = loadQueue();
    if (pending.length === 0) return;
    flushing.current = true;
    try {
      if (!(await ensureSession())) return;
      for (const item of pending) {
        try {
          await api('/sos', {
            method: 'POST',
            json: {
              scenarioId: item.scenarioId,
              coordinates: item.coordinates,
              isDemoLocation: item.isDemoLocation,
              disasterType: item.disasterType,
              clientRequestId: item.clientRequestId,
              viaOfflineQueue: true,
            },
          });
          updateQueue((q) => q.filter((x) => x.clientRequestId !== item.clientRequestId));
          setIsOnline(true);
        } catch (err) {
          if (err instanceof NetworkError) return; // still offline — keep everything queued
          if (err instanceof ApiError && err.status === 401) return; // keep it; user must sign in again
          // The server rejected this SOS outright (validation) — retrying can't help.
          updateQueue((q) => q.filter((x) => x.clientRequestId !== item.clientRequestId));
        }
      }
      await fetchAll();
    } finally {
      flushing.current = false;
    }
  }, [ensureSession, fetchAll, updateQueue]);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      flushQueue();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Also retry periodically: the 'online' event fires on link-up, which is
    // not the same as "the server is reachable".
    const retry = setInterval(() => {
      if (loadQueue().length > 0) flushQueue();
    }, 15_000);
    flushQueue();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(retry);
    };
  }, [flushQueue]);

  // ---------------------------------------------------------------------
  // createSOS
  // ---------------------------------------------------------------------
  const createSOS = useCallback(
    async (input: CreateSOSInput): Promise<SOSIncident | null> => {
      if (!user) return null;
      const clientRequestId = randomId(12);
      const payload = {
        scenarioId: scenarioMeta.id,
        coordinates: input.coordinates,
        isDemoLocation: input.isDemoLocation,
        disasterType: input.disasterType,
        clientRequestId,
      };

      const queueLocally = (): SOSIncident => {
        // Immediate on-device assessment (same rules the server uses) so the
        // citizen sees real guidance right now, even with no connection.
        const triage = triageSOS({
          zones: riskZones,
          teams: rescueTeams,
          coordinates: input.coordinates,
          disasterType: input.disasterType,
          fallbackRegion: scenarioMeta.region,
        });
        const createdAt = new Date().toISOString();
        const local: SOSIncident = {
          id: `PENDING-${clientRequestId.slice(0, 6).toUpperCase()}`,
          citizenId: user.id,
          citizenName: user.name,
          scenarioId: scenarioMeta.id,
          ...triage,
          coordinates: input.coordinates,
          isDemoLocation: input.isDemoLocation,
          disasterType: input.disasterType,
          hazard: SOS_DISASTER_TYPE_LABELS[input.disasterType],
          status: 'REQUESTED',
          communicationMode: 'Offline Queue (Store & Forward)',
          assignedTeamId: null,
          instructions: null,
          etaMin: null,
          timestamp: fmtTime(createdAt),
          statusHistory: [{ status: 'REQUESTED', timestamp: fmtTime(createdAt) }],
          syncState: 'QUEUED',
          clientRequestId,
        };
        updateQueue((q) => [...q, { ...payload, localIncident: local }]);
        return local;
      };

      if (!user.offline && navigator.onLine) {
        try {
          const res = await api<{ incident: any }>('/sos', { method: 'POST', json: payload });
          const incident = mapIncident(res.incident);
          setServerIncidents((prev) => [incident, ...prev.filter((i) => i.id !== incident.id)]);
          return incident;
        } catch (err) {
          if (err instanceof ApiError) {
            // 409: this citizen already has an open SOS — show that one
            // instead of failing (e.g. a second device or a double tap).
            if (err.status === 409 && err.body?.incident) {
              const existing = mapIncident(err.body.incident);
              setServerIncidents((prev) => [existing, ...prev.filter((i) => i.id !== existing.id)]);
              return existing;
            }
            // Any other refusal (rate limit, bad data) is not a connectivity
            // problem, so don't pretend it was sent.
            return null;
          }
          // NetworkError: fall through and store it on the device.
        }
      }
      return queueLocally();
    },
    [user, scenarioMeta, riskZones, rescueTeams, updateQueue]
  );

  // ---------------------------------------------------------------------
  // Admin / rescue actions — the server enforces who may do what.
  // ---------------------------------------------------------------------
  const applyUpdated = (doc: any) => {
    const updated = mapIncident(doc);
    setServerIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const assignTeam = useCallback(
    async (incidentId: string, teamId: string, options: AssignTeamOptions): Promise<boolean> => {
      try {
        const res = await api<{ incident: any }>(`/sos/${encodeURIComponent(incidentId)}/assign`, {
          method: 'POST',
          json: { teamId, priority: options.priority, requiredAction: options.requiredAction, notes: options.notes },
        });
        applyUpdated(res.incident);
        await fetchAll();
        return true;
      } catch (err) {
        console.warn('[SOS] assignTeam failed:', (err as Error).message);
        await fetchAll();
        return false;
      }
    },
    [fetchAll]
  );

  const advanceStatus = useCallback(
    async (incidentId: string, status: SOSStatus) => {
      try {
        const res = await api<{ incident: any }>(`/sos/${encodeURIComponent(incidentId)}/status`, {
          method: 'POST',
          json: { status },
        });
        applyUpdated(res.incident);
      } catch (err) {
        console.warn('[SOS] advanceStatus failed:', (err as Error).message);
      }
      await fetchAll();
    },
    [fetchAll]
  );

  const closeSOS = useCallback(
    async (incidentId: string, reason?: 'FALSE_ALARM' | 'DUPLICATE' | 'OTHER'): Promise<boolean> => {
      // Still only on this device (offline queue): just drop it.
      if (incidentId.startsWith('PENDING-')) {
        updateQueue((q) => q.filter((x) => x.localIncident.id !== incidentId));
        return true;
      }
      try {
        const res = await api<{ incident: any }>(`/sos/${encodeURIComponent(incidentId)}/cancel`, {
          method: 'POST',
          json: reason ? { reason } : {},
        });
        applyUpdated(res.incident);
        await fetchAll();
        return true;
      } catch (err) {
        console.warn('[SOS] closeSOS failed:', (err as Error).message);
        await fetchAll();
        return false;
      }
    },
    [fetchAll, updateQueue]
  );

  const dispatchTeam = useCallback((incidentId: string) => advanceStatus(incidentId, 'DISPATCHED'), [advanceStatus]);

  // Incidents still waiting on this device appear first, until the server has them.
  const incidents: SOSIncident[] = [...queue.map((q) => q.localIncident), ...serverIncidents];

  const getIncidentsForCitizen = (citizenId: string) => incidents.filter((i) => i.citizenId === citizenId);
  const getIncidentsForTeam = (teamId: string) => incidents.filter((i) => i.assignedTeamId === teamId);
  const getIncomingAlertsForTeam = (teamId: string) =>
    incidents.filter((i) => i.recommendedTeamId === teamId && i.assignedTeamId === null && i.status === 'REQUESTED');
  const getIncidentById = (id: string) => incidents.find((i) => i.id === id);
  const getTeamById = (id: string) => rescueTeams.find((t) => t.id === id);

  return (
    <SOSContext.Provider
      value={{
        incidents,
        rescueTeams,
        queuedCount: queue.length,
        isOnline,
        createSOS,
        closeSOS,
        assignTeam,
        dispatchTeam,
        advanceStatus,
        getIncidentsForCitizen,
        getIncidentsForTeam,
        getIncomingAlertsForTeam,
        getIncidentById,
        getTeamById,
      }}
    >
      {children}
    </SOSContext.Provider>
  );
};

export const useSOS = () => {
  const context = useContext(SOSContext);
  if (!context) {
    throw new Error('useSOS must be used within an SOSProvider');
  }
  return context;
};
