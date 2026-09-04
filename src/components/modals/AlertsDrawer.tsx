import React from 'react';
import { X, Bell, AlertTriangle, Info, CheckCircle, ExternalLink } from 'lucide-react';
import { useDisaster } from '../../context/DisasterContext';
import { Badge } from '../common/Badge';

interface AlertsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AlertsDrawer: React.FC<AlertsDrawerProps> = ({ isOpen, onClose }) => {
  const { alerts, markAlertsAsRead, setSelectedZone, riskZones, setSelectedDetailDrawerZone } =
    useDisaster();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop for click-away and focus */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      />

      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-inset border-l border-hairline shadow-2xl backdrop-blur-xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
        {/* Header */}
      <div className="p-4 border-b border-hairline flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-bold font-mono text-ink uppercase tracking-wider">
            Emergency Alerts & Telemetry
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={markAlertsAsRead}
            className="text-[10px] font-mono text-ink-soft hover:text-ink px-2 py-1 rounded bg-surface border border-hairline"
          >
            Mark all read
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-ink-soft hover:text-ink hover:bg-surface"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Alert Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {alerts.map((alert) => {
          const isCritical = alert.severity === 'CRITICAL';
          const isWarning = alert.severity === 'WARNING';

          return (
            <div
              key={alert.id}
              className={`p-3.5 rounded-lg border text-xs font-mono space-y-1.5 transition-all ${
                isCritical
                  ? 'bg-critical-soft border-critical/30 text-critical'
                  : isWarning
                  ? 'bg-warn-soft border-warn/30 text-amber-200'
                  : 'bg-surface border-hairline text-ink'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold">
                  {isCritical ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-critical shrink-0" />
                  ) : isWarning ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-brand shrink-0" />
                  )}
                  <span className="text-[11px] leading-tight text-ink">{alert.title}</span>
                </div>
                <span className="text-[10px] text-ink-soft shrink-0">{alert.timestamp}</span>
              </div>

              <p className="text-[11px] text-ink-soft font-sans leading-relaxed">
                {alert.message}
              </p>

              {alert.zoneId && (
                <button
                  onClick={() => {
                    const zone = riskZones.find((z) => z.id === alert.zoneId);
                    if (zone) {
                      setSelectedZone(zone);
                      setSelectedDetailDrawerZone(zone);
                      onClose();
                    }
                  }}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-brand hover:text-brand underline"
                >
                  <span>Locate Zone on GIS Map</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-hairline bg-paper text-center text-[10px] font-mono text-ink-soft">
        ALERTS UPDATE LIVE AS NEW SYSTEM EVENTS OCCUR
      </div>
    </div>
    </>
  );
};
