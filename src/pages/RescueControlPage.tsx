import React, { useState } from 'react';
import {
  Radio,
  ShieldAlert,
  Users,
  Clock,
  CheckCircle2,
  MapPin,
  X,
  UsersRound,
  Sparkles,
  ClipboardList,
} from 'lucide-react';
import { useSOS } from '../context/SOSContext';
import { useDisaster } from '../context/DisasterContext';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';
import { SOSIncident, RescuePriority, SOS_DISASTER_TYPE_LABELS } from '../types/sos';

const requiredActionPresets = [
  'Evacuate victim to nearest relief centre immediately',
  'Provide medical first aid and stabilize before transport',
  'Extract victim from structurally unsafe location',
  'Deliver emergency supplies and monitor situation',
];

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

export const RescueControlPage: React.FC = () => {
  const { incidents, rescueTeams, assignTeam, dispatchTeam } = useSOS();
  const { riskZones, addToast } = useDisaster();
  const { user } = useAuth();
  const [selectedIncident, setSelectedIncident] = useState<SOSIncident | null>(null);
  const [teamPickerFor, setTeamPickerFor] = useState<string | null>(null);
  const [pickedTeamId, setPickedTeamId] = useState<string | null>(null);
  const [priorityOverride, setPriorityOverride] = useState<RescuePriority | null>(null);
  const [requiredAction, setRequiredAction] = useState('');
  const [notes, setNotes] = useState('');

  const incidentBeingAssigned = teamPickerFor ? incidents.find((i) => i.id === teamPickerFor) : null;

  const openAssignModal = (incident: SOSIncident) => {
    const recommended = incident.recommendedTeamId
      ? rescueTeams.find((t) => t.id === incident.recommendedTeamId)
      : null;
    setTeamPickerFor(incident.id);
    // Only pre-fill the AI-recommended team if it's still actually available —
    // it was computed when the SOS came in and may be stale by the time an
    // admin opens this modal (already dispatched elsewhere in the meantime).
    setPickedTeamId(recommended?.status === 'AVAILABLE' ? recommended.id : null);
    setPriorityOverride(incident.priority);
    setRequiredAction(requiredActionPresets[0]);
    setNotes('');
  };

  const closeAssignModal = () => {
    setTeamPickerFor(null);
    setPickedTeamId(null);
    setPriorityOverride(null);
    setRequiredAction('');
    setNotes('');
  };

  const submitAssignment = () => {
    if (!teamPickerFor || !pickedTeamId) return;
    // Re-validate against live team status right before writing — the pick
    // may have gone stale while the modal was open (another admin session,
    // or a realtime update, could have dispatched this team elsewhere).
    const team = rescueTeams.find((t) => t.id === pickedTeamId);
    if (!team || team.status !== 'AVAILABLE') {
      addToast('warning', 'TEAM NO LONGER AVAILABLE', 'That team was just dispatched elsewhere. Pick another team.');
      setPickedTeamId(null);
      return;
    }
    assignTeam(teamPickerFor, pickedTeamId, {
      priority: priorityOverride ?? undefined,
      requiredAction: requiredAction || 'Proceed to incident location and assess situation',
      notes,
      issuedBy: user?.name || 'Admin',
    });
    closeAssignModal();
  };

  const activeSOS = incidents.filter((i) => i.status !== 'CLOSED' && i.status !== 'RESCUED');
  const criticalSOS = activeSOS.filter((i) => i.priority === 'P1');
  const teamsAvailable = rescueTeams.filter((t) => t.status === 'AVAILABLE').length;
  const teamsDispatched = rescueTeams.filter((t) => t.status === 'DISPATCHED' || t.status === 'ASSIGNED').length;
  const rescuesInProgress = incidents.filter((i) => i.status === 'EN_ROUTE' || i.status === 'ARRIVED' || i.status === 'IN_PROGRESS').length;

  const zoneOf = (incident: SOSIncident) => riskZones.find((z) => z.id === incident.zoneId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-critical" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-critical font-semibold">
              EMERGENCY SOS COORDINATION
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-ink tracking-tight mt-0.5">
            Rescue Control
          </h1>
          <p className="text-xs text-ink-soft mt-1">
            Live citizen SOS requests, rescue team dispatch, and rescue status tracking
          </p>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 rounded-lg bg-surface border border-hairline font-mono">
          <span className="text-[10px] text-ink-faint uppercase block">ACTIVE SOS</span>
          <span className="text-2xl font-bold text-ink mt-1">{activeSOS.length}</span>
        </div>
        <div className="p-4 rounded-lg bg-critical-soft border border-critical/30 font-mono">
          <span className="text-[10px] text-critical uppercase font-semibold block">CRITICAL SOS</span>
          <span className="text-2xl font-bold text-critical mt-1">{criticalSOS.length}</span>
        </div>
        <div className="p-4 rounded-lg bg-safe-soft border border-safe/30 font-mono">
          <span className="text-[10px] text-safe uppercase font-semibold block">TEAMS AVAILABLE</span>
          <span className="text-2xl font-bold text-safe mt-1">{teamsAvailable}</span>
        </div>
        <div className="p-4 rounded-lg bg-brand-soft border border-brand/30 font-mono">
          <span className="text-[10px] text-brand uppercase font-semibold block">TEAMS DISPATCHED</span>
          <span className="text-2xl font-bold text-brand mt-1">{teamsDispatched}</span>
        </div>
        <div className="p-4 rounded-lg bg-warn-soft border border-warn/30 font-mono col-span-2 md:col-span-1">
          <span className="text-[10px] text-warn uppercase font-semibold block">RESCUES IN PROGRESS</span>
          <span className="text-2xl font-bold text-warn mt-1">{rescuesInProgress}</span>
        </div>
      </div>

      {/* INCIDENT TABLE */}
      <div className="p-4 rounded-lg bg-surface border border-hairline shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold font-mono text-ink flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-critical" />
            Emergency SOS Incidents ({incidents.length})
          </h3>
        </div>

        {incidents.length === 0 ? (
          <div className="text-xs font-mono text-ink-faint py-8 text-center">
            No SOS requests received yet. Incidents raised by citizens will appear here in real time.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-hairline bg-inset text-ink-soft uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">SOS ID</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Hazard</th>
                  <th className="py-2.5 px-3">Risk</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Assigned Team</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {incidents.map((incident) => {
                  const team = rescueTeams.find((t) => t.id === incident.assignedTeamId);
                  return (
                    <tr key={incident.id} className="hover:bg-paper-alt">
                      <td className="py-3 px-3 text-ink font-bold">{incident.id}</td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => setSelectedIncident(incident)}
                          className="text-brand hover:text-brand underline flex items-center gap-1"
                        >
                          <MapPin className="w-3 h-3" />
                          {incident.location}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-ink-soft">
                        {incident.hazard}
                        {incident.affectedZones.length > 0 && (
                          <div className="text-[10px] text-warn mt-0.5">
                            {incident.affectedZones.length} zone{incident.affectedZones.length !== 1 ? 's' : ''} flagged
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-critical font-semibold">{incident.riskScore}</td>
                      <td className="py-3 px-3">
                        <Badge variant={incident.priority === 'P1' ? 'critical' : 'moderate'} size="sm">
                          {incident.priority}
                        </Badge>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant={statusBadgeVariant[incident.status] || 'neutral'} size="sm">
                          {incident.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-ink-soft">{team ? team.name : '—'}</td>
                      <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                        {!incident.assignedTeamId && incident.status !== 'RESCUED' && incident.status !== 'CLOSED' && (
                          <button
                            onClick={() => openAssignModal(incident)}
                            className="py-1 px-2.5 rounded bg-brand-soft hover:bg-brand-soft border border-brand/30 text-brand text-[11px] transition-colors"
                          >
                            Assign Team
                          </button>
                        )}
                        {incident.assignedTeamId && incident.status === 'ASSIGNED' && (
                          <button
                            onClick={() => dispatchTeam(incident.id)}
                            className="py-1 px-2.5 rounded bg-safe-soft hover:bg-safe-soft border border-safe/30 text-safe text-[11px] transition-colors"
                          >
                            Dispatch Team
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedIncident(incident)}
                          className="py-1 px-2.5 rounded bg-paper-alt hover:bg-paper-alt text-ink text-[11px] transition-colors"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RESCUE TEAMS PANEL */}
      <div className="p-4 rounded-lg bg-surface border border-hairline shadow-xl space-y-3">
        <h3 className="text-sm font-bold font-mono text-ink flex items-center gap-2">
          <UsersRound className="w-4 h-4 text-brand" />
          Rescue Team Roster
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rescueTeams.map((team) => (
            <div key={team.id} className="p-3 rounded-lg bg-inset border border-hairline space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">{team.name}</span>
                <Badge
                  variant={team.status === 'AVAILABLE' ? 'safe' : team.status === 'DISPATCHED' ? 'info' : 'moderate'}
                  size="sm"
                >
                  {team.status}
                </Badge>
              </div>
              <div className="text-ink-soft">{team.specialization}</div>
              <div className="text-ink-soft">Distance: {team.baseDistanceKm} km • ETA: {team.baseEtaMin} min</div>
            </div>
          ))}
        </div>
      </div>

      {/* ASSIGN TEAM + INSTRUCTIONS MODAL */}
      {teamPickerFor && incidentBeingAssigned && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inset backdrop-blur-md">
          <div className="w-full max-w-lg bg-surface border border-hairline rounded-xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <h3 className="text-sm font-bold font-mono text-ink">Assign Team & Send Instructions — {incidentBeingAssigned.id}</h3>
              <button onClick={closeAssignModal} className="text-ink-soft hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 rounded-lg bg-inset border border-hairline text-xs font-mono flex items-center justify-between">
              <span className="text-ink-soft">{incidentBeingAssigned.location} • {SOS_DISASTER_TYPE_LABELS[incidentBeingAssigned.disasterType]}</span>
              <Badge variant={incidentBeingAssigned.priority === 'P1' ? 'critical' : 'moderate'} size="sm">{incidentBeingAssigned.priority}</Badge>
            </div>

            {/* Team selection */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono text-ink-soft uppercase font-semibold">Select Rescue Team</div>
              <div className="space-y-2">
                {rescueTeams.map((team) => {
                  const isAvailable = team.status === 'AVAILABLE';
                  const isRecommended = team.id === incidentBeingAssigned.recommendedTeamId;
                  const isPicked = pickedTeamId === team.id;
                  return (
                    <button
                      key={team.id}
                      disabled={!isAvailable}
                      onClick={() => setPickedTeamId(team.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors text-xs font-mono ${
                        isPicked
                          ? 'bg-brand-soft border-brand ring-1 ring-brand'
                          : isAvailable
                          ? 'bg-inset border-hairline hover:border-brand/30'
                          : 'bg-inset border-hairline opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-ink">{team.name}</span>
                          {isRecommended && (
                            <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-safe-soft border border-safe/30 text-safe">
                              <Sparkles className="w-2.5 h-2.5" /> AI RECOMMENDED
                            </span>
                          )}
                        </div>
                        <Badge variant={isAvailable ? 'safe' : 'moderate'} size="sm">{team.status}</Badge>
                      </div>
                      <div className="text-ink-soft">{team.specialization}</div>
                      <div className="text-ink-soft mt-1">Distance: {team.baseDistanceKm} km • ETA: {team.baseEtaMin} min</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Instructions form */}
            <div className="space-y-2 pt-1 border-t border-hairline">
              <div className="text-[10px] font-mono text-ink-soft uppercase font-semibold flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" /> Instructions to Rescue Team
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-ink-faint">PRIORITY:</span>
                {(['P1', 'P2', 'P3'] as RescuePriority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriorityOverride(p)}
                    className={`px-2 py-1 rounded text-[11px] font-mono ${
                      priorityOverride === p
                        ? 'bg-critical text-white'
                        : 'bg-paper-alt text-ink-soft hover:text-ink'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <select
                value={requiredAction}
                onChange={(e) => setRequiredAction(e.target.value)}
                className="w-full bg-paper border border-hairline rounded px-2.5 py-2 text-xs font-mono text-ink focus:outline-none focus:border-brand"
              >
                {requiredActionPresets.map((preset) => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes for the rescue team (optional)"
                rows={2}
                className="w-full bg-paper border border-hairline rounded px-2.5 py-2 text-xs font-mono text-ink focus:outline-none focus:border-brand resize-none"
              />
            </div>

            <button
              onClick={submitAssignment}
              disabled={!pickedTeamId}
              className="w-full py-2.5 rounded-lg bg-brand hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono font-bold uppercase tracking-wide transition-colors"
            >
              Send Assignment & Instructions
            </button>
          </div>
        </div>
      )}

      {/* INCIDENT DETAIL MODAL */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inset backdrop-blur-md">
          <div className="w-full max-w-lg bg-surface border border-hairline rounded-xl shadow-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <h3 className="text-sm font-bold font-mono text-ink">Emergency Incident — {selectedIncident.id}</h3>
              <button onClick={() => setSelectedIncident(null)} className="text-ink-soft hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-inset border border-hairline">
                <div className="text-ink-faint text-[10px]">CITIZEN</div>
                <div className="text-ink font-semibold">{selectedIncident.citizenName}</div>
              </div>
              <div className="p-2 rounded bg-inset border border-hairline">
                <div className="text-ink-faint text-[10px]">TIME REPORTED</div>
                <div className="text-ink font-semibold">{selectedIncident.timestamp}</div>
              </div>
              <div className="p-2 rounded bg-inset border border-hairline">
                <div className="text-ink-faint text-[10px]">LOCATION</div>
                <div className="text-ink font-semibold">{selectedIncident.location}</div>
              </div>
              <div className="p-2 rounded bg-inset border border-hairline">
                <div className="text-ink-faint text-[10px]">GPS COORDINATES</div>
                <div className="text-ink font-semibold">
                  {selectedIncident.coordinates.lat.toFixed(4)}, {selectedIncident.coordinates.lng.toFixed(4)}
                  {selectedIncident.isDemoLocation && <span className="text-warn"> (Demo)</span>}
                </div>
              </div>
              <div className="p-2 rounded bg-critical-soft border border-critical/30">
                <div className="text-critical text-[10px]">RISK SCORE</div>
                <div className="text-critical font-bold">{selectedIncident.riskScore}/100</div>
              </div>
              <div className="p-2 rounded bg-inset border border-hairline">
                <div className="text-ink-faint text-[10px]">DISASTER TYPE</div>
                <div className="text-ink font-semibold">{SOS_DISASTER_TYPE_LABELS[selectedIncident.disasterType]}</div>
              </div>
            </div>

            {selectedIncident.affectedZones.length > 0 && (
              <div className="p-2.5 rounded bg-warn-soft border border-warn/30">
                <div className="text-warn text-[10px] font-mono uppercase font-semibold mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> AI-FLAGGED NEARBY AFFECTED AREAS
                </div>
                <div className="space-y-1">
                  {selectedIncident.affectedZones.map((z) => (
                    <div key={z.zoneId} className="flex items-center justify-between text-[11px] font-mono text-ink-soft">
                      <span>{z.zoneName}</span>
                      <span className="text-warn">{z.distanceKm} km • {z.riskLevel}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedIncident.instructions && (
              <div className="p-2.5 rounded bg-brand-soft border border-brand/30 space-y-1">
                <div className="text-brand text-[10px] font-mono uppercase font-semibold flex items-center gap-1.5">
                  <ClipboardList className="w-3 h-3" /> INSTRUCTIONS ISSUED
                </div>
                <div className="text-xs text-ink">{selectedIncident.instructions.requiredAction}</div>
                {selectedIncident.instructions.notes && (
                  <div className="text-[11px] text-ink-soft">{selectedIncident.instructions.notes}</div>
                )}
                <div className="text-[10px] text-ink-faint">
                  By {selectedIncident.instructions.issuedBy} at {selectedIncident.instructions.issuedAt}
                </div>
              </div>
            )}

            {selectedIncident.vulnerabilityTags.length > 0 && (
              <div className="p-2.5 rounded bg-warn-soft border border-warn/30">
                <div className="text-warn text-[10px] font-mono uppercase font-semibold mb-1">VULNERABLE HABITATION</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedIncident.vulnerabilityTags.map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-warn-soft border border-warn/30 text-warn font-mono">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="p-3 rounded-lg bg-critical-soft border border-critical/30">
              <div className="text-[10px] font-mono text-critical uppercase font-semibold">RESCUE PRIORITY</div>
              <div className="text-sm font-bold text-ink mt-0.5">{selectedIncident.priority} — {selectedIncident.priority === 'P1' ? 'CRITICAL RESCUE' : selectedIncident.priority === 'P2' ? 'HIGH PRIORITY RESCUE' : 'STANDARD RESCUE'}</div>
              <div className="text-[11px] text-ink-soft mt-1">
                Citizen SOS received from a {selectedIncident.priority === 'P1' ? 'critical red' : 'moderate risk'} zone.
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] font-mono text-ink-faint uppercase">STATUS HISTORY</div>
              {selectedIncident.statusHistory.map((h, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px] font-mono text-ink-soft border-b border-hairline py-1">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-safe" />
                    {h.status.replace('_', ' ')}
                  </span>
                  <span className="text-ink-faint">{h.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
