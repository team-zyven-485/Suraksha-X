import React from 'react';
import {
  ShieldAlert,
  MapPin,
  Navigation,
  Clock,
  LogOut,
  UsersRound,
  CheckCircle2,
  Radio,
  History,
  Bell,
  ClipboardList,
  Satellite,
  ListChecks,
} from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from 'react-leaflet';
import { useAuth } from '../../context/AuthContext';
import { useSOS } from '../../context/SOSContext';
import { useDisaster } from '../../context/DisasterContext';
import { useSatellite } from '../../context/SatelliteContext';
import { Badge } from '../../components/common/Badge';
import { ZyvenLogo } from '../../components/common/ZyvenLogo';
import { ToastContainer } from '../../components/common/Toast';
import { SOSStatus, SOS_DISASTER_TYPE_LABELS } from '../../types/sos';

const statusBadgeVariant: Record<string, any> = {
  REQUESTED: 'critical',
  VERIFIED: 'moderate',
  ASSIGNED: 'info',
  DISPATCHED: 'info',
  EN_ROUTE: 'moderate',
  ARRIVED: 'safe',
  IN_PROGRESS: 'moderate',
  RESCUED: 'safe',
  CLOSED: 'neutral',
};

export const RescueTeamApp: React.FC = () => {
  const { user, logout } = useAuth();
  const { incidents, rescueTeams, getTeamById, advanceStatus, getIncomingAlertsForTeam } = useSOS();
  const { riskZones, routes } = useDisaster();
  const { hazard, routeRecommendation, getRouteEvaluation } = useSatellite();

  const teamId = user?.teamId || 'team-alpha';
  const team = getTeamById(teamId);
  const myIncidents = incidents.filter((i) => i.assignedTeamId === teamId);
  const activeIncident = myIncidents.find((i) => i.status !== 'RESCUED' && i.status !== 'CLOSED') || null;
  const history = myIncidents.filter((i) => i.status === 'RESCUED' || i.status === 'CLOSED');

  const zone = activeIncident ? riskZones.find((z) => z.id === activeIncident.zoneId) : null;
  // Prefer the satellite-recommended safe route for this zone; never a BLOCKED one.
  const zoneRoutes = activeIncident ? routes.filter((r) => r.originId === activeIncident.zoneId) : [];
  const route =
    zoneRoutes.find((r) => r.id === routeRecommendation?.recommended_route_id) ||
    zoneRoutes.find((r) => r.isRecommended) ||
    zoneRoutes[0] ||
    null;
  const routeEval = route ? getRouteEvaluation(route.id) : undefined;
  const incomingAlerts = getIncomingAlertsForTeam(teamId);

  const nextAction: Partial<Record<SOSStatus, { label: string; next: SOSStatus }>> = {
    ASSIGNED: { label: 'ACCEPT ASSIGNMENT', next: 'DISPATCHED' },
    DISPATCHED: { label: 'START ROUTE', next: 'EN_ROUTE' },
    EN_ROUTE: { label: 'MARK ARRIVED', next: 'ARRIVED' },
    ARRIVED: { label: 'BEGIN RESCUE', next: 'IN_PROGRESS' },
    IN_PROGRESS: { label: 'MARK RESCUED', next: 'RESCUED' },
    RESCUED: { label: 'CLOSE INCIDENT', next: 'CLOSED' },
  };

  const action = activeIncident ? nextAction[activeIncident.status] : undefined;

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <header className="h-14 bg-surface border-b border-hairline px-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-soft border border-brand/20 flex items-center justify-center p-1">
            <ZyvenLogo variant="icon" size={22} />
          </div>
          <div>
            <div className="text-sm font-bold font-mono text-ink leading-none">SURAKSHA-X</div>
            <div className="text-[9px] font-mono text-ink-soft leading-none mt-0.5">Rescue Team Dashboard</div>
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

      <main className="p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-5">
        {/* Team status */}
        <div className="p-4 rounded-xl bg-surface border border-hairline flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-soft border border-brand/30 flex items-center justify-center text-brand font-bold font-mono">
              {team?.name.split(' ').pop()?.slice(0, 2).toUpperCase() || 'RT'}
            </div>
            <div>
              <div className="text-sm font-bold font-mono text-ink">{team?.name || 'Rescue Unit'}</div>
              <div className="text-[11px] font-mono text-ink-soft">{team?.specialization}</div>
            </div>
          </div>
          <Badge variant={team?.status === 'AVAILABLE' ? 'safe' : team?.status === 'DISPATCHED' ? 'info' : 'moderate'} size="md">
            {team?.status || 'UNKNOWN'}
          </Badge>
        </div>

        {/* All rescue teams — situational awareness of the whole operation,
            not just this team's own assignment. */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <UsersRound className="w-4 h-4 text-brand" />
            <h3 className="text-xs font-bold font-mono text-ink-soft uppercase">
              All Rescue Teams ({rescueTeams.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {rescueTeams.map((t) => (
              <div
                key={t.id}
                className={`p-3 rounded-lg border text-xs font-mono space-y-1 ${
                  t.id === teamId ? 'bg-brand-soft border-brand/30' : 'bg-surface border-hairline'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-ink font-bold">{t.name}{t.id === teamId && ' (You)'}</span>
                  <Badge variant={t.status === 'AVAILABLE' ? 'safe' : t.status === 'DISPATCHED' ? 'info' : 'moderate'} size="sm">
                    {t.status}
                  </Badge>
                </div>
                <div className="text-ink-soft">{t.specialization}</div>
                <div className="text-ink-faint">{t.baseDistanceKm} km • ETA {t.baseEtaMin} min{t.activeIncidentId ? ` • On ${t.activeIncidentId}` : ''}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Incoming SOS alerts — citizen SOS broadcasts simultaneously to Admin
            and the AI-recommended team, before Admin formally assigns it. */}
        {incomingAlerts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-warn animate-pulse" />
              <h3 className="text-xs font-bold font-mono text-warn uppercase">
                Incoming SOS Alerts ({incomingAlerts.length})
              </h3>
            </div>
            {incomingAlerts.map((inc) => (
              <div key={inc.id} className="p-3 rounded-lg bg-warn-soft border border-warn/30 text-xs font-mono space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-ink font-bold">{inc.id} — {SOS_DISASTER_TYPE_LABELS[inc.disasterType]}</span>
                  <Badge variant={inc.priority === 'P1' ? 'critical' : 'moderate'} size="sm">{inc.priority}</Badge>
                </div>
                <div className="text-ink-soft flex items-center gap-1"><MapPin className="w-3 h-3 text-warn" />{inc.location}</div>
                <div className="text-warn/80 text-[10px]">Awaiting Admin assignment — do not respond until formally dispatched.</div>
              </div>
            ))}
          </div>
        )}

        {!activeIncident ? (
          <div className="p-8 rounded-xl bg-surface border border-hairline text-center space-y-2">
            <Radio className="w-8 h-8 text-ink-faint mx-auto" />
            <div className="text-sm font-mono text-ink-soft">No active assignment.</div>
            <div className="text-xs font-mono text-ink-faint">Standing by for dispatch from Rescue Control.</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-critical" />
              <h2 className="text-sm font-bold font-mono text-ink uppercase tracking-wide">Active Rescue Assignment</h2>
            </div>

            <div className="p-4 rounded-xl bg-critical-soft border-2 border-critical/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-ink-soft">SOS ID: <span className="text-ink font-bold">{activeIncident.id}</span></span>
                <Badge variant={activeIncident.priority === 'P1' ? 'critical' : 'moderate'} size="sm">
                  {activeIncident.priority} — {activeIncident.priority === 'P1' ? 'CRITICAL' : 'PRIORITY'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <div className="text-ink-faint">Victim Location</div>
                  <div className="text-ink font-semibold flex items-center gap-1"><MapPin className="w-3 h-3 text-critical" />{activeIncident.location}</div>
                </div>
                <div>
                  <div className="text-ink-faint">Disaster Type</div>
                  <div className="text-ink font-semibold">{SOS_DISASTER_TYPE_LABELS[activeIncident.disasterType]}</div>
                </div>
                <div>
                  <div className="text-ink-faint">Risk</div>
                  <div className="text-critical font-bold">{activeIncident.riskScore}/100</div>
                </div>
                <div>
                  <div className="text-ink-faint">Distance / ETA</div>
                  <div className="text-ink font-semibold">{team?.baseDistanceKm} km • {activeIncident.etaMin ?? team?.baseEtaMin} min</div>
                </div>
              </div>

              <Badge variant={statusBadgeVariant[activeIncident.status]} size="sm">
                STATUS: {activeIncident.status.replace('_', ' ')}
              </Badge>
            </div>

            {/* Admin instructions */}
            {activeIncident.instructions && (
              <div className="p-3.5 rounded-lg bg-brand-soft border-2 border-brand/30 space-y-1.5">
                <div className="flex items-center gap-1.5 text-brand text-[10px] font-mono uppercase font-semibold">
                  <ClipboardList className="w-3.5 h-3.5" /> Admin Instructions
                </div>
                <div className="text-sm text-ink font-semibold">{activeIncident.instructions.requiredAction}</div>
                {activeIncident.instructions.notes && (
                  <div className="text-xs text-ink-soft">{activeIncident.instructions.notes}</div>
                )}
                <div className="text-[10px] text-ink-faint">
                  Issued by {activeIncident.instructions.issuedBy} at {activeIncident.instructions.issuedAt}
                </div>
              </div>
            )}

            {/* AI-flagged affected areas */}
            {activeIncident.affectedZones.length > 0 && (
              <div className="p-3 rounded-lg bg-warn-soft border border-warn/30">
                <div className="text-warn text-[10px] font-mono uppercase font-semibold mb-1.5">AI-Flagged Nearby Affected Areas</div>
                <div className="flex flex-wrap gap-1.5">
                  {activeIncident.affectedZones.map((z) => (
                    <span key={z.zoneId} className="text-[10px] px-1.5 py-0.5 rounded bg-warn-soft border border-warn/30 text-warn font-mono">
                      {z.zoneName.split(' (')[0]} ({z.distanceKm}km, {z.riskLevel})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Victim / vulnerability info */}
            {activeIncident.vulnerabilityTags.length > 0 && (
              <div className="p-3 rounded-lg bg-warn-soft border border-warn/30">
                <div className="text-warn text-[10px] font-mono uppercase font-semibold mb-1.5">Victim Information — Vulnerable Habitation</div>
                <div className="flex flex-wrap gap-1.5">
                  {activeIncident.vulnerabilityTags.map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-warn-soft border border-warn/30 text-warn font-mono">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Hazard / zone info */}
            {zone && (
              <div className="p-3 rounded-lg bg-surface border border-hairline text-xs font-mono space-y-1">
                <div className="text-ink-faint uppercase text-[10px]">Hazard Zone Context</div>
                <div className="text-ink">{zone.name} — {zone.riskLevel} ({zone.riskScore}/100)</div>
                <div className="text-ink-soft">{zone.recommendedAction}</div>
              </div>
            )}

            {/* Map */}
            <div className="h-64 rounded-xl overflow-hidden border border-hairline">
              <MapContainer center={[activeIncident.coordinates.lat, activeIncident.coordinates.lng]} zoom={12} style={{ height: '100%', width: '100%' }}>
                <TileLayer attribution="&copy; OpenStreetMap" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {route && <Polyline positions={route.coordinates} pathOptions={{ color: '#3b82f6', weight: 4 }} />}
                <CircleMarker
                  center={[activeIncident.coordinates.lat, activeIncident.coordinates.lng]}
                  radius={10}
                  pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.6 }}
                >
                  <Popup>SOS Victim Location — {activeIncident.id}</Popup>
                </CircleMarker>
              </MapContainer>
            </div>
            <div className="text-[10px] font-mono text-ink-faint flex items-center gap-1.5">
              <Navigation className="w-3 h-3" /> Simulated team position — not real-time GPS tracking.
            </div>

            {routeEval && (
              <div className={`p-2.5 rounded-lg border flex items-center gap-2 text-[11px] font-mono ${
                routeEval.risk_status === 'SAFE' ? 'bg-safe-soft border-safe/30 text-safe' : 'bg-warn-soft border-warn/30 text-warn'
              }`}>
                <Satellite className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Satellite route safety: {routeEval.risk_status.replace('_', ' ')}
                  {hazard?.data_mode === 'DEMO' && ' (Demo Data)'} — never routed through a BLOCKED corridor.
                </span>
              </div>
            )}

            {/* Action buttons */}
            {action && (
              <button
                onClick={() => advanceStatus(activeIncident.id, action.next)}
                className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand/90 text-white font-mono font-bold text-sm uppercase tracking-wide shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                {action.label}
              </button>
            )}
          </div>
        )}

        {/* Rescue history — this team's own completed rescues */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-ink-faint" />
            <h3 className="text-xs font-bold font-mono text-ink-soft uppercase">My Rescue History ({history.length})</h3>
          </div>
          {history.length === 0 ? (
            <div className="text-[11px] font-mono text-ink-faint">No completed rescues yet.</div>
          ) : (
            history.map((h) => (
              <div key={h.id} className="p-3 rounded-lg bg-surface border border-hairline flex items-center justify-between text-xs font-mono">
                <span className="text-ink">{h.id} — {h.location}</span>
                <Badge variant="safe" size="sm">{h.status}</Badge>
              </div>
            ))
          )}
        </div>

        {/* Emergency log — every SOS incident system-wide with its status,
            assigned team, and any admin orders, for full coordination
            visibility beyond this team's own assignment. */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-ink-faint" />
            <h3 className="text-xs font-bold font-mono text-ink-soft uppercase">
              All Emergencies & Admin Orders ({incidents.length})
            </h3>
          </div>
          {incidents.length === 0 ? (
            <div className="text-[11px] font-mono text-ink-faint">No SOS incidents reported yet.</div>
          ) : (
            <div className="space-y-2">
              {incidents.map((inc) => {
                const incTeam = inc.assignedTeamId ? getTeamById(inc.assignedTeamId) : null;
                return (
                  <div key={inc.id} className="p-3 rounded-lg bg-surface border border-hairline text-xs font-mono space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink font-bold">{inc.id}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={inc.priority === 'P1' ? 'critical' : 'moderate'} size="sm">{inc.priority}</Badge>
                        <Badge variant={statusBadgeVariant[inc.status]} size="sm">{inc.status.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-ink-soft"><MapPin className="w-3 h-3 text-ink-faint" />{inc.location} — {SOS_DISASTER_TYPE_LABELS[inc.disasterType]}</div>
                    <div className="text-ink-faint">
                      Team: <span className="text-ink-soft">{incTeam?.name || 'Unassigned'}</span>
                    </div>
                    {inc.instructions && (
                      <div className="flex items-start gap-1.5 pt-1 border-t border-hairline text-brand">
                        <ClipboardList className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{inc.instructions.requiredAction}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <ToastContainer />
    </div>
  );
};
