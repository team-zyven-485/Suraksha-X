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
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSOS } from '../../context/SOSContext';
import { useDisaster } from '../../context/DisasterContext';
import { SOSStatus, SOSDisasterType } from '../../types/sos';
import { CitizenLocationState } from './CitizenApp';
import { useI18n } from '../../i18n';
import { CitizenLiveTeam } from '../../components/live/CitizenLiveTeam';
import { getCurrentFix, FAILURE_KEY, LocationFailure } from '../../lib/geolocate';

interface Props {
  location: CitizenLocationState;
  setLocation: (loc: CitizenLocationState) => void;
}

const statusSteps: SOSStatus[] = ['REQUESTED', 'ASSIGNED', 'DISPATCHED', 'EN_ROUTE', 'ARRIVED', 'RESCUED'];

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
  const { createSOS, closeSOS, getTeamById, incidents } = useSOS();
  const { riskZones, scenarioMeta, addToast } = useDisaster();
  const { t } = useI18n();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [locationProblem, setLocationProblem] = useState<LocationFailure | null>(null);
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
  const isQueued = activeIncident?.syncState === 'QUEUED';
  // Can only be withdrawn before a team is assigned; after that the citizen must call Rescue Control.
  const canCancel =
    !!activeIncident && !activeIncident.assignedTeamId && (isQueued || activeIncident.status === 'REQUESTED' || activeIncident.status === 'VERIFIED');

  const handleCancel = async () => {
    if (!activeIncident) return;
    setIsCancelling(true);
    const ok = await closeSOS(activeIncident.id);
    setIsCancelling(false);
    setConfirmCancel(false);
    if (!ok) addToast('error', t('sos.cancelFailedTitle'), t('sos.cancelFailed'));
  };

  const processingMessages = [
    t('sos.p1'),
    t('sos.p2'),
    t('sos.p3'),
    t('sos.p4', { type: t(`dtype.${selectedDisasterType}`) }),
    t('sos.p5'),
  ];

  const handleSendSOS = async (opts: { allowDemo?: boolean } = {}) => {
    setShowConfirm(false);
    setLocationProblem(null);
    setIsProcessing(true);
    setProcessingStep(0);

    // Always ask the device for the CURRENT position first — never reuse a
    // demo location the user may have picked earlier.
    let coords: { lat: number; lng: number } | null = null;
    let isDemo = false;
    const fix = await getCurrentFix();
    if (fix.ok) {
      coords = fix.coords;
      setLocation({ coords: fix.coords, accuracy: fix.accuracy, isDemo: false });
    } else if (location.coords && !location.isDemo) {
      coords = location.coords; // fall back to the last REAL position we already had
    } else if (opts.allowDemo) {
      // Only when the user explicitly chose "send with a demo location" (testing).
      const demoZone = [...riskZones].sort((a, b) => b.riskScore - a.riskScore)[0];
      if (demoZone) {
        coords = { lat: demoZone.coordinates.lat, lng: demoZone.coordinates.lng };
        isDemo = true;
        setLocation({ coords, accuracy: null, isDemo: true });
      }
    }

    if (!coords) {
      // Rescuers must not be dispatched to a made-up place: stop and let the citizen decide.
      setIsProcessing(false);
      setLocationProblem('reason' in fix ? fix.reason : 'unavailable');
      return;
    }

    for (let i = 1; i < processingMessages.length; i++) {
      setProcessingStep(i);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    let sentOk = false;
    if (coords && user) {
      const incident = await createSOS({
        coordinates: coords,
        isDemoLocation: isDemo,
        disasterType: selectedDisasterType,
      });
      sentOk = incident !== null;
    }

    setIsProcessing(false);
    setProcessingStep(0);

    if (!sentOk) {
      addToast('error', t('sos.failedTitle'), t('sos.failedBody'));
    }
  };

  const currentStatusIndex = activeIncident ? statusOrder.indexOf(activeIncident.status) : -1;
  const assignedTeam = activeIncident?.assignedTeamId ? getTeamById(activeIncident.assignedTeamId) : null;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold font-mono text-ink">{t('sos.title')}</h2>

      {!activeIncident && !isProcessing && (
        <>
          {lastResolvedIncident && (
            <div className="p-3 rounded-lg bg-safe-soft border border-safe/30 text-[11px] font-mono text-safe flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {t('sos.lastResolved', {
                  id: lastResolvedIncident.id,
                  status: lastResolvedIncident.status === 'RESCUED' ? t('sos.rescuedWord') : t('sos.closedWord'),
                })}
              </span>
            </div>
          )}
          {locationProblem && (
            <div className="p-3.5 rounded-xl bg-warn-soft border border-warn/30 space-y-2.5 text-xs font-mono">
              <div className="font-bold text-warn uppercase text-[11px]">{t('sos.locFailedTitle')}</div>
              <div className="text-ink leading-relaxed">{t(FAILURE_KEY[locationProblem])}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button onClick={() => handleSendSOS()} className="py-2 rounded-lg bg-critical text-white font-bold">
                  {t('sos.retry')}
                </button>
                <button
                  onClick={() => handleSendSOS({ allowDemo: true })}
                  className="py-2 rounded-lg border border-hairline text-ink-soft hover:text-ink"
                >
                  {t('sos.sendDemo')}
                </button>
              </div>
            </div>
          )}
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full py-5 rounded-xl bg-critical hover:bg-critical/90 text-white font-mono font-black text-lg uppercase tracking-wider shadow-sm flex flex-col items-center justify-center gap-1.5 transition-colors border-2 border-critical/30"
          >
            <ShieldAlert className="w-7 h-7" />
            <span>{t('sos.button')}</span>
          </button>
          <p className="text-[11px] text-ink-soft text-center">{t('sos.help')}</p>
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
          {isQueued ? (
            <div className="p-4 rounded-xl bg-warn-soft border border-warn/30 text-center space-y-1">
              <WifiOff className="w-8 h-8 text-warn mx-auto mb-1" />
              <div className="text-sm font-bold font-mono text-ink">{t('sos.queuedTitle')}</div>
              <div className="text-[11px] font-mono text-ink-soft">{t('sos.queuedBody')}</div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-safe-soft border border-safe/30 text-center">
              <CheckCircle2 className="w-8 h-8 text-safe mx-auto mb-1" />
              <div className="text-sm font-bold font-mono text-ink">{t('sos.transmitted')}</div>
              <div className="text-[11px] font-mono text-ink-soft">{activeIncident.id}</div>
            </div>
          )}

          <div className="p-4 rounded-xl bg-surface border border-hairline space-y-2 text-xs font-mono">
            <div className="flex justify-between"><span className="text-ink-faint">{t('sos.location')}</span><span className="text-ink">{activeIncident.location}</span></div>
            <div className="flex justify-between"><span className="text-ink-faint">{t('sos.disasterType')}</span><span className="text-ink">{t(`dtype.${activeIncident.disasterType}`)}</span></div>
            <div className="flex justify-between"><span className="text-ink-faint">{t('sos.risk')}</span><span className="text-critical font-bold">{activeIncident.riskScore}/100</span></div>
            <div className="flex justify-between"><span className="text-ink-faint">{t('sos.priority')}</span><span className="text-critical font-bold">{activeIncident.priority} — {activeIncident.priority === 'P1' ? t('sos.critical') : t('sos.rescue')}</span></div>
          </div>

          {activeIncident.affectedZones.length > 0 && (
            <div className="p-3 rounded-lg bg-warn-soft border border-warn/30 space-y-1">
              <div className="text-[10px] font-mono text-warn uppercase font-semibold">{t('sos.flagged')}</div>
              <div className="flex flex-wrap gap-1.5">
                {activeIncident.affectedZones.map((z) => (
                  <span key={z.zoneId} className="text-[10px] px-1.5 py-0.5 rounded bg-warn-soft border border-warn/30 text-warn font-mono">
                    {z.zoneName.split(' (')[0]} ({z.distanceKm}km)
                  </span>
                ))}
              </div>
            </div>
          )}

          {!isQueued && (
            <div className="p-4 rounded-xl bg-surface border border-hairline space-y-2.5">
              <div className="text-[11px] font-mono text-ink-soft uppercase font-semibold">{t('sos.title')}</div>
              {statusSteps.map((step) => {
                const stepIdx = statusOrder.indexOf(step);
                const isDone = currentStatusIndex !== -1 && stepIdx <= currentStatusIndex;
                const isCurrent = activeIncident.status === step;
                return (
                  <div key={step} className="flex items-center gap-2 text-xs font-mono">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-safe shrink-0" />
                    ) : (
                      <Circle className={`w-4 h-4 shrink-0 ${isCurrent ? 'text-brand' : 'text-ink-faint'}`} />
                    )}
                    <span className={isDone ? 'text-ink' : isCurrent ? 'text-brand font-semibold' : 'text-ink-faint'}>
                      {t(`sos.step.${step}`)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {assignedTeam && (
            <div className="p-4 rounded-xl bg-brand-soft border border-brand/30 space-y-1.5 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-brand font-semibold uppercase text-[11px]">
                <UsersRound className="w-3.5 h-3.5" /> {t('sos.assignedTeam')}
              </div>
              <div className="text-ink font-bold">{assignedTeam.name}</div>
              <div className="text-ink-soft flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> {t('sos.eta', { n: activeIncident.etaMin ?? assignedTeam.baseEtaMin })}
              </div>
              <div className="text-ink-soft flex items-center gap-1.5">
                <Radio className="w-3 h-3" />{' '}
                {t('sos.comm', {
                  mode: activeIncident.communicationMode === 'Mobile Network' ? t('sos.commMobile') : t('sos.commOffline'),
                })}
              </div>
            </div>
          )}

          {assignedTeam && !isQueued && <CitizenLiveTeam incident={activeIncident} team={assignedTeam} />}

          {activeIncident.instructions && (
            <div className="p-4 rounded-xl bg-surface border border-hairline space-y-1.5 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-ink-soft font-semibold uppercase text-[11px]">
                <ClipboardList className="w-3.5 h-3.5 text-brand" /> {t('sos.adminInstr')}
              </div>
              <div className="text-ink-soft">{activeIncident.instructions.requiredAction}</div>
              {activeIncident.instructions.notes && (
                <div className="text-ink-faint">{activeIncident.instructions.notes}</div>
              )}
            </div>
          )}

          {canCancel &&
            (confirmCancel ? (
              <div className="p-3 rounded-xl bg-warn-soft border border-warn/30 space-y-2 text-xs font-mono">
                <div className="text-ink">{t('sos.cancelAsk')}</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="py-2 rounded-lg bg-paper-alt text-ink font-semibold"
                  >
                    {t('sos.cancelKeep')}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isCancelling}
                    className="py-2 rounded-lg bg-critical text-white font-bold disabled:opacity-60"
                  >
                    {t('sos.cancelYes')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmCancel(true)}
                className="w-full py-2 rounded-lg border border-hairline text-ink-soft hover:text-ink text-[11px] font-mono"
              >
                {t('sos.cancelBtn')}
              </button>
            ))}
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inset backdrop-blur-md">
          <div className="w-full max-w-sm bg-surface border-2 border-critical/30 rounded-xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black font-mono text-critical uppercase">{t('sos.confirmTitle')}</span>
              <button onClick={() => setShowConfirm(false)} className="text-ink-soft hover:text-ink" aria-label={t('sos.cancel')}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-ink">{t('sos.unableEvac')}</p>

            <div className="space-y-1.5">
              <div className="text-[10px] font-mono text-ink-soft uppercase font-semibold">{t('sos.whatType')}</div>
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
                      <span>{t(`dtype.${type}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-ink-soft">{t('sos.share')}</p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => setShowConfirm(false)}
                className="py-2.5 rounded-lg bg-paper-alt hover:bg-paper-alt text-ink text-xs font-mono font-semibold"
              >
                {t('sos.cancel')}
              </button>
              <button
                onClick={() => handleSendSOS()}
                className="py-2.5 rounded-lg bg-critical hover:bg-critical/90 text-white text-xs font-mono font-bold"
              >
                {t('sos.send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
