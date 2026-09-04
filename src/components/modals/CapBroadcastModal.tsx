import React, { useState } from 'react';
import {
  X,
  Radio,
  Send,
  Volume2,
  VolumeX,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Waves,
  ShieldCheck,
  Building2,
  MessageSquare,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { RelocationPlan } from '../../types';
import { useDisaster } from '../../context/DisasterContext';
import { generateCapXml } from '../../utils/exportUtils';
import { persistCapBroadcast } from '../../lib/supabase';

interface CapBroadcastModalProps {
  plan: RelocationPlan | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CapBroadcastModal: React.FC<CapBroadcastModalProps> = ({
  plan,
  isOpen,
  onClose,
}) => {
  const { addToast, addAlert } = useDisaster();
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastStage, setBroadcastStage] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copied, setCopied] = useState(false);

  // Channel selections
  const [channels, setChannels] = useState({
    cellBroadcast: true,
    vhfRadio: true,
    civicSiren: true,
    whatsApp: true,
    shelterTriage: true,
  });

  if (!isOpen || !plan) return null;

  // One pipeline stage per channel toggle, in a fixed order — so unchecking
  // a channel actually removes its stage from the simulated broadcast
  // instead of running (and reporting) all five regardless of selection.
  const channelSteps: { key: keyof typeof channels; label: string }[] = [
    { key: 'cellBroadcast', label: 'Handshake with State Disaster Telecom Gateway' },
    { key: 'vhfRadio', label: 'VHF Radio Transmit Activated' },
    { key: 'civicSiren', label: 'Public Address Klaxon Activated' },
    { key: 'whatsApp', label: 'WhatsApp Incident Alert Pushed to Ward Subscribers' },
    { key: 'shelterTriage', label: 'Ingested into Relief Centre Reception Manifest' },
  ];
  const activeChannelSteps = channelSteps.filter((s) => channels[s.key]);
  const totalStages = 1 + activeChannelSteps.length; // +1 for the always-on CAP XML compile stage
  const isComplete = broadcastStage > 0 && broadcastStage === totalStages;

  // Synthesize realistic emergency alert chime via Web Audio API
  const playAlertSiren = () => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      // Dual tone EAS siren
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(853, ctx.currentTime);
      osc2.frequency.setValueAtTime(960, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 1.2);
      osc2.stop(ctx.currentTime + 1.2);
    } catch {
      // Audio autoplay policies or unsupported browser
    }
  };

  const handleStartBroadcast = async () => {
    if (activeChannelSteps.length === 0) return;

    setIsBroadcasting(true);
    setBroadcastStage(1); // Generating CAP v1.2 XML & Signing SHA256 — always happens
    playAlertSiren();

    for (let i = 0; i < activeChannelSteps.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      setBroadcastStage(2 + i);
    }

    const channelCount = activeChannelSteps.length;

    // Persist to Supabase / Local storage
    await persistCapBroadcast({
      identifier: `SURAKSHA-CAP-${plan.id}-${Date.now()}`,
      sender: 'Admin (Incident Commander Alpha)',
      sent: new Date().toISOString(),
      status: 'Actual',
      msgType: 'Alert',
      headline: `IMMEDIATE EVACUATION ORDER: ${plan.zoneName}`,
      description: `Phased relocation of ${plan.vulnerablePopulation} priority citizens to ${plan.recommendedShelter.name} via ${plan.primaryRoute.destinationName}.`,
      areaDesc: `${plan.zoneName}, Kamrup Basin`,
      channels: Object.keys(channels).filter((k) => (channels as any)[k]),
    });

    // Add high-priority alert into global alerts feed
    addAlert({
      zoneId: plan.zoneId,
      severity: 'CRITICAL',
      title: `🚨 CAP BROADCAST TRANSMITTED: ${plan.zoneName}`,
      message: `Common Alerting Protocol evacuation order dispatched across ${channelCount} channel${channelCount !== 1 ? 's' : ''}. Shelter: ${plan.recommendedShelter.name}.`,
    });

    addToast(
      'success',
      'CAP Emergency Broadcast Transmitted',
      `Order ${plan.id} successfully dispatched to ${plan.zoneName} network via ${channelCount} channel${channelCount !== 1 ? 's' : ''}!`
    );
  };

  const handleCopyCap = () => {
    const xml = generateCapXml(plan);
    navigator.clipboard.writeText(xml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-paper border border-critical/30 rounded-xl shadow-sm flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-hairline bg-critical-soft flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-critical text-white shadow-sm">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-critical uppercase tracking-widest">
                  OASIS CAP v1.2 EMERGENCY DISPATCH
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-critical-soft text-critical border border-critical/30">
                  PUBLIC SAFETY
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold font-mono text-ink mt-0.5">
                Broadcast Evacuation Order #{plan.id}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-paper-alt transition-colors"
              title={soundEnabled ? 'Mute Alert Chime' : 'Enable Alert Chime'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-safe" /> : <VolumeX className="w-4 h-4 text-ink-faint" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-paper-alt transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Alert Preview Banner */}
          <div className="p-4 rounded-lg bg-surface border border-critical/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-critical uppercase tracking-wider">
                TRANSMISSION PAYLOAD HEADLINE
              </span>
              <button
                onClick={handleCopyCap}
                className="text-xs font-mono text-ink-soft hover:text-ink flex items-center gap-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-safe" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied XML' : 'Copy CAP XML'}</span>
              </button>
            </div>
            <div className="text-sm font-bold text-ink font-mono">
              IMMEDIATE EVACUATION ORDER: {plan.zoneName} to {plan.recommendedShelter.name}
            </div>
            <p className="text-xs text-ink-soft font-sans leading-relaxed">
              Mandatory relocation of {plan.vulnerablePopulation} priority citizens. Designated transit via {plan.primaryRoute.destinationName}. Primary shelter: {plan.recommendedShelter.name} ({plan.recommendedShelter.location}).
            </p>
          </div>

          {/* Multi-Channel Distribution Matrix */}
          <div className="space-y-2.5">
            <span className="text-xs font-mono text-ink-soft uppercase font-semibold block">
              Multi-Channel Broadcast Targets:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="p-3 rounded-lg bg-surface border border-hairline flex items-center justify-between cursor-pointer hover:border-hairline transition-colors">
                <div className="flex items-center gap-2.5">
                  <Smartphone className="w-4 h-4 text-brand" />
                  <div>
                    <div className="text-xs font-semibold text-ink">Cell Broadcast (CB-SMS)</div>
                    <div className="text-[10px] text-ink-soft font-mono">All active towers in {plan.zoneName}</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={channels.cellBroadcast}
                  onChange={(e) => setChannels({ ...channels, cellBroadcast: e.target.checked })}
                  disabled={isBroadcasting}
                  className="rounded border-hairline text-critical focus:ring-critical w-4 h-4 bg-white"
                />
              </label>

              <label className="p-3 rounded-lg bg-surface border border-hairline flex items-center justify-between cursor-pointer hover:border-hairline transition-colors">
                <div className="flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-safe" />
                  <div>
                    <div className="text-xs font-semibold text-ink">VHF Emergency Net</div>
                    <div className="text-[10px] text-ink-soft font-mono">NDRF / SDRF Channel 4</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={channels.vhfRadio}
                  onChange={(e) => setChannels({ ...channels, vhfRadio: e.target.checked })}
                  disabled={isBroadcasting}
                  className="rounded border-hairline text-critical focus:ring-critical w-4 h-4 bg-white"
                />
              </label>

              <label className="p-3 rounded-lg bg-surface border border-hairline flex items-center justify-between cursor-pointer hover:border-hairline transition-colors">
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-warn" />
                  <div>
                    <div className="text-xs font-semibold text-ink">Civic Klaxon & Siren</div>
                    <div className="text-[10px] text-ink-soft font-mono">Zone A Public Address Station</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={channels.civicSiren}
                  onChange={(e) => setChannels({ ...channels, civicSiren: e.target.checked })}
                  disabled={isBroadcasting}
                  className="rounded border-hairline text-critical focus:ring-critical w-4 h-4 bg-white"
                />
              </label>

              <label className="p-3 rounded-lg bg-surface border border-hairline flex items-center justify-between cursor-pointer hover:border-hairline transition-colors">
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-green-400" />
                  <div>
                    <div className="text-xs font-semibold text-ink">WhatsApp Ward Bot</div>
                    <div className="text-[10px] text-ink-soft font-mono">Village Marshals & Citizens</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={channels.whatsApp}
                  onChange={(e) => setChannels({ ...channels, whatsApp: e.target.checked })}
                  disabled={isBroadcasting}
                  className="rounded border-hairline text-critical focus:ring-critical w-4 h-4 bg-white"
                />
              </label>
            </div>
          </div>

          {/* Real-time Broadcast Pipeline Tracker — one row per SELECTED channel */}
          {broadcastStage > 0 && (
            <div className="p-4 rounded-lg bg-surface border border-hairline space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-ink uppercase">
                  LIVE BROADCAST PIPELINE STATUS
                </span>
                <span className="text-[10px] font-mono text-safe font-bold">
                  {isComplete ? '● TRANSMISSION 100% CONFIRMED' : '● TRANSMITTING...'}
                </span>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-ink-soft">
                  {broadcastStage >= 1 ? <CheckCircle2 className="w-3.5 h-3.5 text-safe" /> : <span className="w-3.5 h-3.5 rounded-full border border-hairline" />}
                  <span>[1/{totalStages}] Compiled CAP v1.2 XML & Cryptographic SHA256 Signature</span>
                </div>
                {activeChannelSteps.map((step, idx) => {
                  const stageNum = idx + 2;
                  const isLast = idx === activeChannelSteps.length - 1;
                  return (
                    <div
                      key={step.key}
                      className={`flex items-center gap-2 ${isLast ? 'text-safe font-bold' : 'text-ink-soft'}`}
                    >
                      {broadcastStage >= stageNum ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-safe" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-hairline" />
                      )}
                      <span>
                        [{stageNum}/{totalStages}] {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-hairline bg-surface flex items-center justify-between">
          <div className="text-[11px] font-mono text-ink-soft flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-safe" />
            <span>Authorized by Admin • Incident Commander Alpha</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg bg-paper-alt hover:bg-hairline text-ink-soft text-xs font-mono transition-colors"
            >
              {isComplete ? 'Close' : 'Cancel'}
            </button>
            <button
              onClick={handleStartBroadcast}
              disabled={isBroadcasting || activeChannelSteps.length === 0}
              title={activeChannelSteps.length === 0 ? 'Select at least one broadcast channel' : undefined}
              className="px-4 py-2 rounded-lg bg-critical hover:bg-critical/90 disabled:opacity-50 text-white text-xs font-mono font-bold flex items-center gap-2 shadow-sm transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>{isBroadcasting ? (isComplete ? 'Broadcast Finished ✓' : 'Transmitting...') : 'START BROADCAST NOW'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
