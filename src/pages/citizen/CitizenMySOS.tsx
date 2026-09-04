import React, { useState } from 'react';
import {
  ShieldAlert,
  X,
  CheckCircle2,
  Circle,
  Loader2,
  Radio,
  Clock,
  UsersRound,
  ClipboardList,
  Waves,
  Mountain,
  Wind,
  Landmark,
  Flame,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSOS } from '../../context/SOSContext';
import { useDisaster } from '../../context/DisasterContext';
import { SOSStatus, SOSDisasterType, SOS_DISASTER_TYPE_LABELS } from '../../types/sos';
import { CitizenLocationState } from './CitizenApp';

interface Props {
  location: CitizenLocationState;
  setLocation: (loc: CitizenLocationState) => void;
}

const statusSteps: { status: SOSStatus; label: string }[] = [
  { status: 'REQUESTED', label: 'SOS Received' },
  { status: 'ASSIGNED', label: 'Rescue Team Assigned' },
  { status: 'DISPATCHED', label: 'Team Dispatched' },
  { status: 'EN_ROUTE', label: 'Team En Route' },
  { status: 'ARRIVED', label: 'Team Arrived' },
  { status: 'RESCUED', label: 'Rescue Completed' },
];

const statusOrder: SOSStatus[] = ['REQUESTED', 'VERIFIED', 'ASSIGNED', 'DISPATCHED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'RESCUED', 'CLOSED'];

const disasterTypeOptions: { type: SOSDisasterType; icon: React.FC<{ className?: string }> }[] = [
  { type: 'FLOOD', icon: Waves },
  { type: 'EARTHQUAKE', icon: Landmark },
  { type: 'CYCLONE', icon: Wind },
  { type: 'LANDSLIDE', icon: Mountain },
  { type: 'TSUNAMI', icon: Waves },
  { type: 'FIRE', icon: Flame },
  { type: 'OTHER', icon: HelpCircle },
];

export const CitizenMySOS: React.FC<Props> = ({ location, setLocation }) => {
  const { user } = useAuth();
  const { createSOS, getTeamById, incidents } = useSOS();
  const { riskZones, scenarioMeta, addToast } = useDisaster();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [selectedDisasterType, setSelectedDisasterType] = useState<SOSDisasterType>(
    scenarioMeta.disasterType as SOSDisasterType
  );

  const myIncidents = user ? incidents.filter((i) => i.citizenId === user.id) : [];
  // Only an in-flight incident should block the SOS button — once an
  // incident is RESCUED/CLOSED it must not permanently hide "Emergency SOS"
  // for any future emergency (myIncidents is newest-first).
  const activeIncident = myIncidents.find((i) => i.status !== 'RESCUED' && i.status !== 'CLOSED') || null;
  const lastResolvedIncident = !activeIncident
    ? myIncidents.find((i) => i.status === 'RESCUED' || i.status === 'CLOSED') || null
    : null;

  const processingMessages = [
    'Acquiring location…',
    'Location acquired…',
    'Checking communication…',
    `Running AI impact analysis for ${SOS_DISASTER_TYPE_LABELS[selectedDisasterType]}…`,
    'Sending emergency request to Admin & nearest Rescue Team…',
  ];

  const handleSendSOS = async () => {
    setShowConfirm(false);
    setIsProcessing(true);

    let coords = location.coords;
    let isDemo = location.isDemo;

    if (!coords) {
      const fallbackZone = [...riskZones].sort((a, b) => b.riskScore - a.riskScore)[0];
      if (fallbackZone) {
        coords = { lat: fallbackZone.coordinates.lat, lng: fallbackZone.coordinates.lng };
        isDemo = true;
        setLocation({ coords, accuracy: null, isDemo: true });
      }
    }

    for (let i = 0; i < processingMessages.length; i++) {
      setProcessingStep(i);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    let sentOk = false;
    if (coords && user) {
      const incident = await createSOS({
        coordinates: coords,
        isDemoLocation: isDemo,
        citizenId: user.id,
        citizenName: user.name,
        disasterType: selectedDisasterType,
      });
      sentOk = incident !== null;
    }

    setIsProcessing(false);
    setProcessingStep(0);

    if (!sentOk) {
      addToast(
        'error',
        'SOS Failed to Send',
        'Your emergency request could not be transmitted. Please try again or seek help directly if possible.'
      );
    }
  };

  const currentStatusIndex = activeIncident ? statusOrder.indexOf(activeIncident.status) : -1;
  const assignedTeam = activeIncident?.assignedTeamId ? getTeamById(activeIncident.assignedTeamId) : null;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold font-mono text-ink">My Emergency Status</h2>

      {!activeIncident && !isProcessing && (
        <>
          {lastResolvedIncident && (
            <div className="p-3 rounded-lg bg-safe-soft border border-safe/30 text-[11px] font-mono text-safe flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Your last emergency ({lastResolvedIncident.id}) was marked {lastResolvedIncident.status === 'RESCUED' ? 'RESCUED' : 'CLOSED'}. You can send a new SOS below if you need help again.
              </span>
            </div>
          )}
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full py-5 rounded-xl bg-critical hover:bg-critical/90 text-white font-mono font-black text-lg uppercase tracking-wider shadow-sm flex flex-col items-center justify-center gap-1.5 transition-colors border-2 border-critical/30"
          >
            <ShieldAlert className="w-7 h-7" />
            <span>Emergency SOS</span>
          </button>
          <p className="text-[11px] text-ink-soft text-center">
            For people who are trapped, injured, unable to evacuate, or unable to reach a safe centre.
          </p>
        </>
      )}

      {isProcessing && (
        <div className="p-6 rounded-xl bg-surface border border-hairline flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-critical animate-spin" />
          <span className="text-sm font-mono text-ink text-center">{processingMessages[processingStep]}</span>
        </div>
      )}

      {activeIncident && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-safe-soft border border-safe/30 text-center">
            <CheckCircle2 className="w-8 h-8 text-safe mx-auto mb-1" />
            <div className="text-sm font-bold font-mono text-ink">SOS TRANSMITTED</div>
            <div className="text-[11px] font-mono text-ink-soft">{activeIncident.id}</div>
          </div>

          <div className="p-4 rounded-xl bg-surface border border-hairline space-y-2 text-xs font-mono">
            <div className="flex justify-between"><span className="text-ink-faint">Location</span><span className="text-ink">{activeIncident.location}</span></div>
            <div className="flex justify-between"><span className="text-ink-faint">Disaster Type</span><span className="text-ink">{SOS_DISASTER_TYPE_LABELS[activeIncident.disasterType]}</span></div>
            <div className="flex justify-between"><span className="text-ink-faint">Risk</span><span className="text-critical font-bold">{activeIncident.riskScore}/100</span></div>
            <div className="flex justify-between"><span className="text-ink-faint">Priority</span><span className="text-critical font-bold">{activeIncident.priority} — {activeIncident.priority === 'P1' ? 'CRITICAL RESCUE' : 'RESCUE'}</span></div>
          </div>

          {activeIncident.affectedZones.length > 0 && (
            <div className="p-3 rounded-lg bg-warn-soft border border-warn/30 space-y-1">
              <div className="text-[10px] font-mono text-warn uppercase font-semibold">AI-Flagged Nearby Affected Areas</div>
              <div className="flex flex-wrap gap-1.5">
                {activeIncident.affectedZones.map((z) => (
                  <span key={z.zoneId} className="text-[10px] px-1.5 py-0.5 rounded bg-warn-soft border border-warn/30 text-warn font-mono">
                    {z.zoneName.split(' (')[0]} ({z.distanceKm}km)
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl bg-surface border border-hairline space-y-2.5">
            <div className="text-[11px] font-mono text-ink-soft uppercase font-semibold">My Emergency Status</div>
            {statusSteps.map((step, idx) => {
              const stepIdx = statusOrder.indexOf(step.status);
              const isDone = currentStatusIndex >= stepIdx && currentStatusIndex !== -1 && stepIdx <= currentStatusIndex;
              const isCurrent = activeIncident.status === step.status;
              return (
                <div key={step.status} className="flex items-center gap-2 text-xs font-mono">
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-safe shrink-0" />
                  ) : (
                    <Circle className={`w-4 h-4 shrink-0 ${isCurrent ? 'text-brand' : 'text-ink-faint'}`} />
                  )}
                  <span className={isDone ? 'text-ink' : isCurrent ? 'text-brand font-semibold' : 'text-ink-faint'}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {assignedTeam && (
            <div className="p-4 rounded-xl bg-brand-soft border border-brand/30 space-y-1.5 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-brand font-semibold uppercase text-[11px]">
                <UsersRound className="w-3.5 h-3.5" /> Assigned Team
              </div>
              <div className="text-ink font-bold">{assignedTeam.name}</div>
              <div className="text-ink-soft flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> ETA: {activeIncident.etaMin ?? assignedTeam.baseEtaMin} minutes
              </div>
              <div className="text-ink-soft flex items-center gap-1.5">
                <Radio className="w-3 h-3" /> Communication: {activeIncident.communicationMode}
              </div>
            </div>
          )}

          {activeIncident.instructions && (
            <div className="p-4 rounded-xl bg-surface border border-hairline space-y-1.5 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-ink-soft font-semibold uppercase text-[11px]">
                <ClipboardList className="w-3.5 h-3.5 text-brand" /> Admin Instructions to Rescue Team
              </div>
              <div className="text-ink-soft">{activeIncident.instructions.requiredAction}</div>
              {activeIncident.instructions.notes && (
                <div className="text-ink-faint">{activeIncident.instructions.notes}</div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inset backdrop-blur-md">
          <div className="w-full max-w-sm bg-surface border-2 border-critical/30 rounded-xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black font-mono text-critical uppercase">Emergency SOS</span>
              <button onClick={() => setShowConfirm(false)} className="text-ink-soft hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-ink">Are you unable to evacuate safely?</p>

            <div className="space-y-1.5">
              <div className="text-[10px] font-mono text-ink-soft uppercase font-semibold">
                What type of disaster is affecting you?
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {disasterTypeOptions.map(({ type, icon: Icon }) => {
                  const isSelected = selectedDisasterType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedDisasterType(type)}
                      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-mono transition-colors ${
                        isSelected
                          ? 'bg-critical-soft border-critical text-critical'
                          : 'bg-inset border-hairline text-ink-soft hover:border-hairline'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{SOS_DISASTER_TYPE_LABELS[type]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-ink-soft">
              Your location and disaster type will be shared with SURAKSHA-X Admin Rescue Control and the nearest matching Rescue Team.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => setShowConfirm(false)}
                className="py-2.5 rounded-lg bg-paper-alt hover:bg-paper-alt text-ink text-xs font-mono font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSendSOS}
                className="py-2.5 rounded-lg bg-critical hover:bg-critical/90 text-white text-xs font-mono font-bold"
              >
                Send SOS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
